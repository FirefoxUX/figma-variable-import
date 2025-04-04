import { VariableCreate } from '@figma/rest-api-spec'
import {
  CentralCollections,
  FigmaResultCollection,
  TypedCentralCollections,
  TypedCentralVariable,
} from './types.js'
import {
  determineResolvedTypeWithAlias,
  SYMBOL_RESOLVED_TYPE,
} from './utils.js'

export function inferResolvedTypes(
  centralTokens: CentralCollections,
  fileVariables?: FigmaResultCollection,
): TypedCentralCollections {
  const typedCentralTokens: TypedCentralCollections = {}
  const queue: Array<{ collectionName: string; variableName: string }> = []

  const resolveVariableTypes = (
    collectionName: string,
    variableName: string,
    addToQueue: boolean,
  ) => {
    const variable = centralTokens[collectionName][variableName]
    let lastResolvedType: VariableCreate['resolvedType'] | undefined = undefined

    for (const mode in variable) {
      const value = variable[mode]
      const resolvedType = determineResolvedTypeWithAlias(
        typedCentralTokens,
        value,
        fileVariables,
      )
      if (resolvedType === null) {
        if (addToQueue) {
          queue.push({ collectionName, variableName })
          return
        } else {
          throw new Error(
            `When trying to infer variable types: Variable '${variableName}' in collection '${collectionName}' could not be resolved (variable value: ${value})`,
          )
        }
      }
      if (lastResolvedType && lastResolvedType !== resolvedType) {
        throw new Error(
          `When trying to infer variable types: Variable '${variableName}' in collection '${collectionName}' has conflicting types in different modes (${lastResolvedType} and ${resolvedType})`,
        )
      }
      lastResolvedType = resolvedType
    }

    if (!lastResolvedType) {
      throw new Error(
        `When trying to infer variable types: Variable '${variableName}' in collection '${collectionName}' has no modes`,
      )
    }

    const typedVariable: TypedCentralVariable = {
      ...variable,
      [SYMBOL_RESOLVED_TYPE]: lastResolvedType,
    }

    if (!typedCentralTokens[collectionName]) {
      typedCentralTokens[collectionName] = {}
    }

    typedCentralTokens[collectionName][variableName] = typedVariable
  }

  // We go through all the collections
  for (const collectionName in centralTokens) {
    const collection = centralTokens[collectionName]
    for (const variableName in collection) {
      resolveVariableTypes(collectionName, variableName, true)
    }
  }
  // We'll try to resolve the variables that we couldn't resolve before.
  // If they can't be resolved this time, we'll throw an error.
  for (const { collectionName, variableName } of [...queue]) {
    resolveVariableTypes(collectionName, variableName, true)
  }
  for (const { collectionName, variableName } of [...queue]) {
    resolveVariableTypes(collectionName, variableName, true)
  }
  for (const { collectionName, variableName } of [...queue]) {
    resolveVariableTypes(collectionName, variableName, true)
  }
  // We'll try to resolve the variables that we couldn't resolve before.
  // If they can't be resolved this time, we'll throw an error.
  for (const { collectionName, variableName } of queue) {
    resolveVariableTypes(collectionName, variableName, false)
  }

  if (queue.length > 0) {
    console.warn(`WARNING: ${queue.length} variables had to be resolved in a second pass.
         This happens when an alias references a variable that is defined later in the central tokens.
         While this is not a problem, you might be able to optimize the order of the central tokens.
         If it is not possible to optimize the order anymore, you can remove this warning!`)
  }

  return typedCentralTokens
}
