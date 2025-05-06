import {
  GetLocalVariablesResponse,
  GetPublishedVariablesResponse,
  PublishedVariable,
} from '@figma/rest-api-spec'
import { FigmaCollections, FigmaResultCollection } from './types.js'

/**
 * Sorts the Figma variables based on their collection.
 *
 * @param figmaData - The metadata from the Figma local variables response.
 * @returns An object where each key is a collection name and the value is an object containing the collection and its associated variables.
 * @throws Will throw an error if a collection is not found in the Figma data.
 */
export function normalizeFigmaTokens(
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

    acc[collection.id] = {
      toJSON: () => `${collection.key}`,
      collection,
      variables,
    }
    return acc
  }, {} as FigmaCollections)
}

/**
 * Normalizes the published Figma tokens by organizing them into a structured collection.
 *
 * @param figmaData - The `meta` property from the Figma API's `GetPublishedVariablesResponse`,
 * which contains information about variable collections and variables.
 *
 * @returns A `FigmaResultCollection` object where each key corresponds to a variable collection
 * name, and its value is an object mapping variable names to their respective `PublishedVariable` data.
 */
export function normalizeFigmaPublishedTokens(
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
