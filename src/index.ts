import {
  GetLocalVariablesResponse,
  GetPublishedVariablesResponse,
  PublishedVariable,
} from '@figma/rest-api-spec'
import Config from './Config.js'
import { getCentralCollectionValues } from './central-import.js'
import {
  CentralCollections,
  FigmaCollections,
  FigmaResultCollection,
} from './types.js'
import { fetchFigmaAPI, FigmaAPIURLs } from './utils.js'
import { HCM_MAP } from './imports.js'
import UpdateConstructor from './UpdateConstructor.js'
import { addModesDefinitions } from './transform/modeDefinitions.js'
import { updateVariableDefinitions } from './transform/variableDefinitions.js'
import { updateVariables } from './transform/updateVariables.js'
import { documentError, documentStats } from './workflow/index.js'
import { constructRelativeData } from './relative-transform.js'
import { inferResolvedTypes } from './inferResolvedTypes.js'

async function run() {
  const { meta: figmaColorsData } =
    await fetchFigmaAPI<GetLocalVariablesResponse>(
      FigmaAPIURLs.getLocalVariables(Config.figmaColorsFileId),
    )
  const { meta: figmaTokenData } =
    await fetchFigmaAPI<GetLocalVariablesResponse>(
      FigmaAPIURLs.getLocalVariables(Config.figmaFileId),
    )

  const centralData = await getCentralCollectionValues()
  const relativeData = constructRelativeData(centralData.relative)
  // get the Colors from the central data, delete it from the centralData
  const { Colors, ...centralDataWithoutColors } = centralData.central

  const colorsCollections: CentralCollections = {
    Colors,
  }
  const tokensCollections: CentralCollections = {
    'HCM Theme': HCM_MAP,
    ...centralDataWithoutColors,
    ...relativeData,
  }

  const figmaColorsTokens = normalizeFigmaTokens(figmaColorsData)
  const figmaTokens = normalizeFigmaTokens(figmaTokenData)

  const ucColor = new UpdateConstructor(
    figmaColorsTokens,
    Config.figmaColorsFileId,
  )
  ucColor.constructUpdate(colorsCollections)
  await ucColor.submitChanges(Config.dryRun)

  const { meta: publishedVarData } =
    await fetchFigmaAPI<GetPublishedVariablesResponse>(
      FigmaAPIURLs.getPublishedVariables(Config.figmaColorsFileId),
    )

  const figmaPublishedTokens = normalizeFigmaPublishedTokens(publishedVarData)

  const ucTokens = new UpdateConstructor(
    figmaTokens,
    Config.figmaFileId,
    figmaPublishedTokens,
  )
  ucTokens.constructUpdate(tokensCollections)
  await ucTokens.submitChanges(Config.dryRun)

  documentStats([
    {
      fileName: 'Firefox Colors',
      stats: ucColor.getStats(),
      figCollections: ucColor.figmaTokens,
    },
    {
      fileName: 'Deskop Styles',
      stats: ucTokens.getStats(),
      figCollections: ucTokens.figmaTokens,
    },
  ])
}

run().catch((error) => {
  documentError(error as Error).then(() => {
    throw error
  })
})

/**
 * Sorts the Figma variables based on their collection.
 *
 * @param figmaData - The metadata from the Figma local variables response.
 * @returns An object where each key is a collection name and the value is an object containing the collection and its associated variables.
 * @throws Will throw an error if a collection is not found in the Figma data.
 */
function normalizeFigmaTokens(
  figmaData: GetLocalVariablesResponse['meta'],
): FigmaCollections {
  return Object.keys(figmaData.variableCollections).reduce((acc, key) => {
    const collection = figmaData.variableCollections[key]
    if (!collection) {
      throw new Error(
        `When normalizing Figma tokens, the collection '${key}' was not found`,
      )
    }
    const variables = Object.values(figmaData.variables).filter(
      (v) => v.variableCollectionId === collection.id,
    )

    acc[collection.name] = {
      collection,
      variables,
    }
    return acc
  }, {} as FigmaCollections)
}

// function that transforms GetPublishedVariablesResponse into FigmaResultCollection

function normalizeFigmaPublishedTokens(
  figmaData: GetPublishedVariablesResponse['meta'],
): FigmaResultCollection {
  return Object.values(figmaData.variableCollections).reduce(
    (acc, collectionData) => {
      acc[collectionData.name] = Object.values(figmaData.variables)
        .filter((v) => v.variableCollectionId === collectionData.id)
        .reduce(
          (varAcc, variableData) => {
            varAcc[variableData.name] = variableData
            return varAcc
          },
          {} as Record<string, PublishedVariable>,
        )
      return acc
    },
    {} as FigmaResultCollection,
  )
}
