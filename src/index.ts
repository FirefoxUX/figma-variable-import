import { GetLocalVariablesResponse } from '@figma/rest-api-spec'
import Config from './Config.js'
import { getCentralCollectionValues } from './central-import.js'
import { CentralCollections, FigmaCollections } from './types.js'
import { fetchFigmaAPI, FigmaAPIURLs } from './utils.js'
import { HCM_MAP, OPERATING_SYSTEM_MAP, SURFACE_MAP } from './imports.js'
import UpdateConstructor from './UpdateConstructor.js'
import { addModesDefinitions } from './transform/modeDefinitions.js'
import { updateVariableDefinitions } from './transform/variableDefinitions.js'
import { updateVariables } from './transform/updateVariables.js'
import { documentError, documentStats } from './workflow/index.js'

async function run() {
  const { meta: figmaData } = await fetchFigmaAPI<GetLocalVariablesResponse>(
    FigmaAPIURLs.getVariables(Config.figmaFileId),
  )

  const centralTokens: CentralCollections = {
    'HCM Theme': HCM_MAP,
    'Operating System': OPERATING_SYSTEM_MAP,
    ...(await getCentralCollectionValues()),
    Surface: SURFACE_MAP,
  }

  // normalizeCentralTokens(await getCentralTokens())
  const figmaTokens = normalizeFigmaTokens(figmaData)

  // // STEP 1: Create a new UpdateConstructor instance to keep track of changes
  const uc = new UpdateConstructor(centralTokens, figmaTokens)

  // // STEP 2: Iterate over collections and add missing modes
  addModesDefinitions(uc)

  // // STEP 3: Iterate over collections and add missing variables
  updateVariableDefinitions(uc)

  // // STEP 4: Update the values of the variables
  updateVariables(uc)

  if (!Config.dryRun) {
    await uc.submitChanges(Config.figmaFileId)
  }

  documentStats(uc.getStats())
}

run().catch((error) => {
  documentError(error as Error).then(() => {
    throw error
  })
})

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
