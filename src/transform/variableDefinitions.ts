import UpdateConstructor from '../UpdateConstructor.js'
import {
  CentralCollection,
  FigmaCollection,
  TypedCentralCollections,
} from '../types.js'
import Config from '../Config.js'
import { SYMBOL_RESOLVED_TYPE } from '../utils.js'

/**
 * Updates the variable definitions based on the provided UpdateConstructor.
 * This function compares the central tokens with the Figma tokens and performs
 * the necessary updates to the variable definitions.
 *
 * @param uc - The UpdateConstructor object containing the central and Figma tokens.
 */
export function updateVariableDefinitions(
  uc: UpdateConstructor,
  tokens: TypedCentralCollections,
) {
  for (const collectionLabel in tokens) {
    const sets = generateVariableSets(
      tokens[collectionLabel],
      uc.figmaTokens[collectionLabel],
    )
    // Create variables that are only in the central collection
    for (const key of sets.onlyInCentral) {
      // we need to determine the type of the variable
      const resolvedType = tokens[collectionLabel][key][SYMBOL_RESOLVED_TYPE]
      uc.createVariable(key, collectionLabel, resolvedType)
    }

    // Add deprecation tags to variables that are only in the Figma collection
    for (const key of sets.onlyInFigma) {
      if (Config.figmaOnlyVariables?.includes(key)) {
        continue
      }
      const variableData = uc.figmaTokens[collectionLabel].variables.find(
        (v) => v.name === key,
      )
      if (!variableData) {
        throw new Error(
          `When adding deprecation tags, the variable ${key} could not be found in the Figma tokens`,
        )
      }
      const newDescription = potentiallyAddDeprecated(variableData.description)
      if (newDescription) {
        uc.updateVariable({
          id: variableData.id,
          description: newDescription,
        })
        uc.addDeprecationStat(collectionLabel, variableData.name, true)
      }
    }

    // Remove deprecation tags from variables that are in both collections
    for (const key of sets.inBoth) {
      const variableData = uc.figmaTokens[collectionLabel].variables.find(
        (v) => v.name === key,
      )
      if (!variableData) {
        throw new Error(
          `When removing deprecation tags, the variable ${key} could not be found in the Figma tokens`,
        )
      }
      const newDescription = potentiallyRemoveDeprecated(
        variableData.description,
      )
      if (newDescription) {
        uc.updateVariable({
          id: variableData.id,
          description: newDescription,
        })
        uc.addDeprecationStat(collectionLabel, variableData.name, false)
      }
    }
  }
}

/**
 * Adds a deprecated tag to the description if it doesn't already have one.
 * @param description - The original description.
 * @returns The updated description with a deprecated tag, or undefined if the description already has a deprecated tag.
 */
function potentiallyAddDeprecated(description: string) {
  // check if description already has a deprecated tag
  if (description.includes('[deprecated]')) {
    return undefined
  }
  return `${description.trimEnd()}\n\n[deprecated] This variable is deprecated.`.trimStart()
}

/**
 * Removes deprecated lines from the given description.
 * If the description does not contain any deprecated lines, returns undefined.
 * @param description - The description to process.
 * @returns The processed description with deprecated lines removed, or undefined if no deprecated lines were found.
 */
function potentiallyRemoveDeprecated(description: string) {
  if (!description.includes('[deprecated]')) {
    return undefined
  }
  return description
    .split('\n')
    .filter((line) => !line.includes('[deprecated]'))
    .join('\n')
    .trimEnd()
}

/**
 * Generates sets of variables based on the comparison between the central collection and the Figma collection.
 * @param {CentralCollecion} central - The central collection of variables.
 * @param {FigmaCollection} figma - The Figma collection of variables.
 * @returns {Object} - An object containing sets of variables that are only in the central collection, only in the Figma collection, and in both collections.
 */
function generateVariableSets(
  central: CentralCollection,
  figma: FigmaCollection,
): {
  onlyInCentral: Set<string>
  onlyInFigma: Set<string>
  inBoth: Set<string>
} {
  const centralKeys = new Set(Object.keys(central))
  const figmaKeys = new Set(figma.variables.map((v) => v.name))

  const onlyInCentral = new Set(
    [...centralKeys].filter((key) => !figmaKeys.has(key)),
  )
  const onlyInFigma = new Set(
    [...figmaKeys].filter((key) => !centralKeys.has(key)),
  )
  const inBoth = new Set([...centralKeys].filter((key) => figmaKeys.has(key)))

  return {
    onlyInCentral,
    onlyInFigma,
    inBoth,
  }
}
