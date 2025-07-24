import { VariableCreate } from '@figma/rest-api-spec'
import UpdateConstructor from '../UpdateConstructor.js'
import {
  determineResolvedTypeWithAlias,
  SYMBOL_RESOLVED_TYPE,
} from '../../utils.js'
import { TypedVDCollections, TypedVDVariable, VDCollections } from '../../vd.js'

export function inferResolvedTypes(
  uc: UpdateConstructor,
  vdTokens: VDCollections,
): TypedVDCollections {
  const typedVdTokens: TypedVDCollections = {}
  let queue: Array<{ collectionName: string; variableName: string }> = []

  const fileVariables = uc.getFileVariables()

  const resolveVariableTypes = (
    collectionName: string,
    variableName: string,
  ) => {
    const variable = vdTokens[collectionName][variableName]
    let lastResolvedType: VariableCreate['resolvedType'] | undefined = undefined

    for (const mode in variable) {
      const value = variable[mode]
      const resolvedType = determineResolvedTypeWithAlias(
        typedVdTokens,
        value,
        fileVariables,
      )
      if (resolvedType === null) {
        queue.push({ collectionName, variableName })
        return
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

    const typedVariable: TypedVDVariable = {
      ...variable,
      [SYMBOL_RESOLVED_TYPE]: lastResolvedType,
    }

    if (!typedVdTokens[collectionName]) {
      typedVdTokens[collectionName] = {}
    }

    typedVdTokens[collectionName][variableName] = typedVariable
  }

  // We go through all the collections
  for (const collectionName in vdTokens) {
    const collection = vdTokens[collectionName]
    for (const variableName in collection) {
      resolveVariableTypes(collectionName, variableName)
    }
  }

  const LOOP_LIMIT = 10
  let loopCounter = LOOP_LIMIT
  // There might be some variables that are not resolved yet, so we need to go through the queue
  // as long as there are variables in the queue and we have not reached the loop limit
  while (queue.length > 0 && loopCounter > 0) {
    const queueCopy = [...queue]
    queue = []
    for (const { collectionName, variableName } of queueCopy) {
      resolveVariableTypes(collectionName, variableName)
    }
    loopCounter--
  }
  if (loopCounter === 0) {
    throw new Error(
      `When trying to infer variable types: There are still variables that could not be resolved after ${LOOP_LIMIT} iterations.`,
    )
  }

  if (queue.length > 0) {
    console.warn(`WARNING: ${queue.length} variables had to be resolved in a second pass.
         This happens when an alias references a variable that is defined later in the central tokens.
         While this is not a problem, you might be able to optimize the order of the central tokens.
         If it is not possible to optimize the order anymore, you can remove this warning!`)
  }

  return typedVdTokens
}
