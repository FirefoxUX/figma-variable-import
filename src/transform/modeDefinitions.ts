import UpdateConstructor from '../UpdateConstructor.js'
import {
  FigmaCollection,
  TypedCentralCollection,
  TypedCentralCollections,
} from '../types.js'
import { getVisibleCollectionByName } from '../utils.js'

/**
 * Adds mode definitions to the given `UpdateConstructor` instance.
 *
 * @param uc - The `UpdateConstructor` instance to add mode definitions to.
 */
export function addModesDefinitions(
  uc: UpdateConstructor,
  tokens: TypedCentralCollections,
) {
  const figmaTokens = uc.getFigmaTokens()
  for (const collectionLabel in tokens) {
    // Throw an error if the collection is missing in the figma file.

    const collection = getVisibleCollectionByName(figmaTokens, collectionLabel)

    if (!collection) {
      throw new Error(
        `The collection '${collectionLabel}' is missing in the figma file. Please add it to the figma file before running the script again.
Figma collections: ${Object.keys(figmaTokens).join(', ')}
Central collections: ${Object.keys(tokens).join(', ')}`,
      )
    }
    // Generate a set of modes only present in the central collection.
    const { onlyInCentral } = generateModeSets(
      tokens[collectionLabel],
      collection,
    )
    // Create a variable mode for each mode only present in the central collection.
    for (const key of onlyInCentral) {
      uc.createVariableMode(key, collectionLabel)
    }
  }
}

/**
 * Generates a set of modes only present in the central collection.
 * @param {CentralCollecion} central - The central collection.
 * @param {FigmaCollection} figma - The figma collection.
 * @returns {Object} - An object containing the modes only present in the central collection.
 */
function generateModeSets(
  central: TypedCentralCollection,
  figma: FigmaCollection,
): { onlyInCentral: Set<string> } {
  const figmaModes = new Set(figma.collection.modes.map((m) => m.name))
  const centralKeys = new Set(Object.keys(central[Object.keys(central)[0]]))

  const onlyInCentral = new Set(
    [...centralKeys].filter((key) => !figmaModes.has(key)),
  )
  return {
    onlyInCentral,
  }
}
