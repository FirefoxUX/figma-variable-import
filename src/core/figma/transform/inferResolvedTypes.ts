import { VariableCreate } from '@figma/rest-api-spec'
import UpdateConstructor from '../UpdateConstructor.js'
import { determineResolvedTypeWithAlias } from '../../utils.js'
import {
  SYMBOL_RESOLVED_TYPE,
  TypedVDCollections,
  TypedVDVariable,
  VDCollections,
  extractVdReference,
} from '../../vd.js'

export function inferResolvedTypes(
  uc: UpdateConstructor,
  vdTokens: VDCollections,
): TypedVDCollections {
  const typedVdTokens: TypedVDCollections = {}
  let queue: Array<{ collectionName: string; variableName: string }> = []
  const queuedKeys = new Set<string>()

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
        const key = `${collectionName}$${variableName}`
        if (!queuedKeys.has(key)) {
          queue.push({ collectionName, variableName })
          queuedKeys.add(key)
        }
        return
      }
      if (lastResolvedType && lastResolvedType !== resolvedType) {
        const lastValue =
          variable[
            Object.keys(variable).find(
              (mode) =>
                determineResolvedTypeWithAlias(
                  typedVdTokens,
                  variable[mode],
                  fileVariables,
                ) === lastResolvedType,
            )!
          ]
        throw new Error(
          `When trying to infer variable types: Variable '${variableName}' in collection '${collectionName}' has conflicting types in different modes (${lastResolvedType}: ${JSON.stringify(lastValue)} and ${resolvedType}: ${JSON.stringify(value)})`,
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
    queuedKeys.clear()
    for (const { collectionName, variableName } of queueCopy) {
      resolveVariableTypes(collectionName, variableName)
    }
    loopCounter--
  }
  if (loopCounter === 0) {
    const unresolvedTokens = queue
      .map(({ collectionName, variableName }) => {
        const variable = vdTokens[collectionName][variableName]
        const modeDetails = Object.entries(variable)
          .map(([mode, value]) => {
            // Try to find what couldn't be resolved
            if (typeof value === 'string') {
              const ref = extractVdReference(value)
              if (ref) {
                const refExists = vdTokens[ref.collection]?.[ref.variable]
                const refStatus = refExists ? '✓ exists' : '✗ missing'
                return `      ${mode}: ${JSON.stringify(value)} (${refStatus})`
              }
            }
            return `      ${mode}: ${JSON.stringify(value)}`
          })
          .join('\n')
        return `  - ${collectionName}$${variableName}\n${modeDetails}`
      })
      .join('\n')
    throw new Error(
      `When trying to infer variable types: There are still ${queue.length} variables that could not be resolved after ${LOOP_LIMIT} iterations. Unresolved tokens:\n${unresolvedTokens}`,
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
