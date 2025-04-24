
import { RGBA, VariableAlias } from '@figma/rest-api-spec'
import UpdateConstructor from '../UpdateConstructor.js'
import {
  isFigmaAlias,
  culoriToFigma,
  figmaToCulori,
  SYMBOL_RESOLVED_TYPE,
  isCentralAlias,
  compareColors,
} from '../utils.js'

import {
  FigmaResultCollection,
  FigmaVariableData,
  TypedCentralCollections,
  TypedCentralVariable,
} from '../types.js'

import { customParse, rgb } from '../color.js'

/**
 * Updates the variable values if central values don't match the Figma values.
 *
 * @param uc - An UpdateConstructor instance.
 */
export function updateVariables(
  uc: UpdateConstructor,
  tokens: TypedCentralCollections,
) {
  for (const collectionName in tokens) {
    // iterate over all values in the current collection
    for (const [variableName, centralValues] of Object.entries(
      tokens[collectionName],
    )) {
      // iterate over keys in centralValues
      for (const [modeName, centralValue] of Object.entries(centralValues)) {
        // get the figma mode id based on the key and collection
        const figmaVariableData = getFigmaVariableData(
          uc,
          collectionName,
          modeName,
          variableName,
        )

        // check if the values in figma and central are the same already
        const requiresUpdate = checkIfUpdateRequired(
          figmaVariableData,
          centralValue,
          uc,
          centralValues,
        )

        // if no update is required, we can continue to the next variable
        if (!requiresUpdate) {
          continue
        }

        // TYPE 1: The central value is an alias
        if (isCentralAlias(centralValue)) {
          const resolvedAlias = uc.resolveCentralAlias(centralValue as string)
          if (!resolvedAlias)
            throw new Error(
              `When resolving alias '${centralValue}' in collection '${collectionName}', the alias could not be found`,
            )
          uc.setVariableAlias(
            figmaVariableData.info.id,
            figmaVariableData.modeId,
            resolvedAlias.id,
          )
          continue
        }

        // TYPE 2: The figma value is a color
        if (centralValues[SYMBOL_RESOLVED_TYPE] === 'COLOR') {
          // for a color we need to convert to a culori and then to RGBA
          // convert the central value to a culori object
          const parsedColor = customParse(centralValue as string)
          // the central value one has to be valid, since its our source of truth
          if (parsedColor === undefined) {
            throw new Error(
              `When updating variables: Invalid central color value: ${centralValue} for token ${variableName} in collection ${collectionName}`,
            )
          }
          // now we just set the value to the figma variable
          uc.setVariableValue(
            figmaVariableData.info.id,
            figmaVariableData.modeId,
            culoriToFigma(rgb(parsedColor)),
          )
          continue
        }

        // TYPE 3: The central value is a string, boolean or float
        uc.setVariableValue(
          figmaVariableData.info.id,
          figmaVariableData.modeId,
          centralValue,
        )
      }
    }
  }
}

function checkIfUpdateRequired(
  figmaVariableData: FigmaVariableData,
  centralValue: string | number | boolean,
  uc: UpdateConstructor,
  centralValues: TypedCentralVariable,
) {
  let requiresUpdate = figmaVariableData.value === undefined

  // if either of them is a variable and the other is not, we need to update
  if (!requiresUpdate) {
    const isCentralValueAlias = isCentralAlias(centralValue)
    const isFigmaValueAlias = isFigmaAlias(figmaVariableData.value)
    if (isCentralValueAlias !== isFigmaValueAlias) {
      requiresUpdate = true

      // if both are variables, we need to check if they are the same
    } else if (isCentralValueAlias && isFigmaValueAlias) {
      const resolveCentralAlias = uc.resolveCentralAlias(centralValue as string)
      if (
        resolveCentralAlias.id !== (figmaVariableData.value as VariableAlias).id
      ) {
        requiresUpdate = true
      }
    } else if (centralValues[SYMBOL_RESOLVED_TYPE] === 'FLOAT') {
      // Figma does some weird stuff with numbers, so we need to compare them as strings rounded to 4 decimal places
      // The four is somewhat arbitrarily chosen, but it should be enough precision for most use cases
      if (
        (centralValue as number).toFixed(4) !==
        (figmaVariableData.value as number).toFixed(4)
      ) {
        requiresUpdate = true
      }
    } else if (centralValues[SYMBOL_RESOLVED_TYPE] !== 'COLOR') {
      // if its' not a color or an alias it has to be a string, boolean or float, and we can just compare
      if (figmaVariableData.value !== centralValue) {
        requiresUpdate = true
      }
    } else {
      // for colors, we convert both to culori objects and compare
      // if figmaVariableData.value is not an object that contains R, G, B, A, we already know it's not a color and it needs to be updated
      if (
        !figmaVariableData.value ||
        typeof figmaVariableData.value !== 'object' ||
        !('r' in figmaVariableData.value)
      ) {
        requiresUpdate = true
      } else {
        const centralParsed = customParse(centralValue as string)!
        const figmaParsed = figmaToCulori(figmaVariableData.value as RGBA)
        if (
          figmaParsed === undefined ||
          !compareColors(centralParsed, figmaParsed)
        ) {
          requiresUpdate = true
        }
      }
    }
  }
  return requiresUpdate
}

/**
 * Retrieves Figma variable data based on the provided parameters.
 *
 * @param uc - The UpdateConstructor instance.
 * @param collectionName - The name of the collection.
 * @param modeName - The name of the mode.
 * @param variableName - The name of the variable.
 * @returns An object containing the modeId, info, and value of the variable.
 * @throws Error if the mode or variable is not found.
 */
function getFigmaVariableData(
  uc: UpdateConstructor,
  collectionName: string,
  modeName: string,
  variableName: string,
): FigmaVariableData {
  const modeId = uc.getModeId(collectionName, modeName)
  if (!modeId)
    throw new Error(
      `When updating variables: Mode ${modeName} not found in collection ${collectionName}`,
    )
  const info = uc.getVariable(collectionName, variableName)
  if (!info)
    throw new Error(
      `When updating variables: Variable ${variableName} not found in collection ${collectionName}`,
    )
  const value = info.valuesByMode[modeId]
  return { value, info, modeId }
}
