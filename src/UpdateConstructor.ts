import {
  ErrorResponsePayloadWithErrorBoolean,
  LocalVariable,
  PostVariablesRequestBody,
  PostVariablesResponse,
  RGBA,
  VariableCreate,
  VariableModeCreate,
  VariableModeValue,
  VariableUpdate,
} from '@figma/rest-api-spec'
import {
  CentralCollections,
  FigmaCollections,
  FigmaVariableValue,
  TypedCentralCollections,
  TypedCentralVariable,
} from './types.js'
import {
  FigmaAPIURLs,
  SYMBOL_RESOLVED_TYPE,
  determineResolvedTypeWithAlias,
  extractAliasParts,
  fetchFigmaAPI,
} from './utils.js'

export type ExtraStats = {
  variablesDeprecated: { collection: string; variable: string }[]
  variablesUndeprecated: { collection: string; variable: string }[]
  modesCreated: { collection: string; mode: string }[]
  variablesCreated: {
    collection: string
    variable: string
    resolvedType: VariableCreate['resolvedType']
  }[]
  variableValuesUpdated: {
    collection: string
    variable: string
    mode: string
    oldValue: FigmaVariableValue
    newValue: FigmaVariableValue
    resolvedType: VariableCreate['resolvedType']
  }[]
  result?: PostVariablesResponse | ErrorResponsePayloadWithErrorBoolean | string
}

/**
 * This class is used to keep track of changes that need to be submitted to the Figma API.
 */
class UpdateConstructor {
  private idCounter: number
  private changes: Required<PostVariablesRequestBody>
  private extraStats: ExtraStats
  centralTokens: TypedCentralCollections
  figmaTokens: FigmaCollections

  constructor(
    centralTokens: CentralCollections,
    figmaTokens: FigmaCollections,
  ) {
    this.centralTokens = inferResolvedTypes(centralTokens)
    this.figmaTokens = figmaTokens
    this.idCounter = 0
    this.changes = {
      variableCollections: [],
      variableModes: [],
      variables: [],
      variableModeValues: [],
    }
    this.extraStats = {
      variablesDeprecated: [],
      variablesUndeprecated: [],
      modesCreated: [],
      variablesCreated: [],
      variableValuesUpdated: [],
    }
  }

  getChanges() {
    return this.changes
  }
  getStats() {
    return this.extraStats
  }

  hasChanges() {
    return Object.keys(this.changes).some(
      (key) => this.changes[key as keyof typeof this.changes].length > 0,
    )
  }

  getTempId() {
    return `tempId${this.idCounter++}`
  }

  async submitChanges(fileId: string) {
    const changes = Object.fromEntries(
      Object.entries(this.changes).filter(([, value]) => value.length > 0),
    )

    if (Object.keys(changes).length === 0) {
      console.info('No changes to submit')
      return
    }

    console.info('Submitting changes:', changes)

    try {
      const result = await fetchFigmaAPI<PostVariablesResponse>(
        FigmaAPIURLs.postVariables(fileId),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(changes),
        },
      )
      this.extraStats.result = result
    } catch (error) {
      this.extraStats.result =
        typeof error === 'string'
          ? error
          : `${(error as Error).message}\n\n${(error as Error).stack}`
    }
  }

  createVariable(
    name: string,
    collectionLabel: string,
    resolvedType: VariableCreate['resolvedType'],
  ) {
    const variableCollectionId = this.figmaTokens[collectionLabel].collection.id

    const tempId = this.getTempId()
    const obj: VariableCreate = {
      action: 'CREATE',
      name,
      id: tempId,
      variableCollectionId,
      resolvedType: resolvedType,
    }
    this.changes.variables.push(obj)
    // we will also add the variable to the figma tokens with a temp id
    this.figmaTokens[collectionLabel].variables.push({
      id: tempId,
      name,
      key: '---',
      variableCollectionId,
      resolvedType: resolvedType,
      valuesByMode: {},
      remote: false,
      description: '',
      hiddenFromPublishing: false,
      scopes: [],
      codeSyntax: {},
    })

    // Stats
    this.extraStats.variablesCreated.push({
      collection: collectionLabel,
      variable: name,
      resolvedType,
    })
  }

  createVariableMode(name: string, collectionLabel: string) {
    const tempId = this.getTempId()
    const obj: VariableModeCreate = {
      action: 'CREATE',
      id: tempId,
      name,
      variableCollectionId: this.figmaTokens[collectionLabel].collection.id,
    }
    this.changes.variableModes.push(obj)
    // we will also add the variable mode to the figma tokens with a temp id
    this.figmaTokens[collectionLabel].collection.modes.push({
      modeId: tempId,
      name,
    })

    // Stats
    this.extraStats.modesCreated.push({
      collection: collectionLabel,
      mode: name,
    })
  }

  updateVariable(update: Omit<VariableUpdate, 'action'>) {
    const fullUpdate: VariableUpdate = {
      action: 'UPDATE',
      ...update,
    }
    const existing = this.changes.variables.find((v) => v.id === fullUpdate.id)
    if (existing) {
      Object.assign(existing, fullUpdate)
    } else {
      this.changes.variables.push(fullUpdate)
    }
  }

  setVariableValue(
    variableId: string,
    modeId: string,
    value: RGBA | boolean | number | string,
  ) {
    const obj: VariableModeValue = {
      variableId,
      modeId,
      value,
    }
    this.changes.variableModeValues.push(obj)

    // Stats
    const {
      collectionName,
      variableName,
      modeName,
      currentValue,
      resolvedType,
    } = this.reverseSearchVariableInfo(variableId, modeId)

    this.extraStats.variableValuesUpdated.push({
      collection: collectionName,
      variable: variableName,
      mode: modeName,
      oldValue: currentValue,
      newValue: value,
      resolvedType,
    })
  }

  private reverseSearchVariableInfo(variableId: string, modeId: string) {
    let collectionName,
      variableName,
      modeName,
      currentValue: FigmaVariableValue | null = null,
      resolvedType: VariableCreate['resolvedType'] | null = null
    for (const { collection, variables } of Object.values(this.figmaTokens)) {
      const variable = variables.find((v) => v.id === variableId)
      if (variable) {
        collectionName = collection.name
        variableName = variable.name
        modeName = collection.modes.find((m) => m.modeId === modeId)?.name
        currentValue = variable.valuesByMode[modeId]
        resolvedType = variable.resolvedType
        break
      }
    }
    // if any of them are undefined, throw an error
    if (
      !collectionName ||
      !variableName ||
      !modeName ||
      currentValue === null ||
      resolvedType === null
    ) {
      throw new Error(
        `When updating variable values: Could not find the collection, variable or mode for variable id '${variableId}' and mode id '${modeId}'`,
      )
    }
    return {
      collectionName,
      variableName,
      modeName,
      currentValue,
      resolvedType,
    }
  }

  setVariableAlias(variableId: string, modeId: string, aliasId: string) {
    const obj: VariableModeValue = {
      variableId,
      modeId,
      value: { type: 'VARIABLE_ALIAS', id: aliasId },
    }
    this.changes.variableModeValues.push(obj)

    // Stats
    const {
      collectionName,
      variableName,
      modeName,
      currentValue,
      resolvedType,
    } = this.reverseSearchVariableInfo(variableId, modeId)

    this.extraStats.variableValuesUpdated.push({
      collection: collectionName,
      variable: variableName,
      mode: modeName,
      oldValue: currentValue,
      newValue: { type: 'VARIABLE_ALIAS', id: aliasId },
      resolvedType,
    })
  }

  // -------

  addDeprecationStat(
    collection: string,
    variable: string,
    deprecated: boolean,
  ) {
    if (deprecated) {
      this.extraStats.variablesDeprecated.push({ collection, variable })
    } else {
      this.extraStats.variablesUndeprecated.push({ collection, variable })
    }
  }

  // -------

  getModeId(collectionLabel: string, modeName: string) {
    return this.figmaTokens[collectionLabel].collection.modes.find(
      (m) => m.name === modeName,
    )?.modeId
  }

  getVariable(collectionLabel: string, variableName: string) {
    return this.figmaTokens[collectionLabel].variables.find(
      (v) => v.name === variableName,
    )
  }

  resolveCentralAlias(centralAlias: string): LocalVariable {
    const aliasParts = extractAliasParts(centralAlias)
    if (!aliasParts) {
      throw new Error(
        `When resolving alias '${centralAlias}', the alias could not be parsed`,
      )
    }
    const variable = this.figmaTokens[aliasParts.collection].variables.find(
      (v) => v.name === aliasParts.variable,
    )
    if (!variable) {
      throw new Error(
        `When resolving alias '${centralAlias}', the alias could not be found in the figma tokens`,
      )
    }
    return variable
  }
}

export default UpdateConstructor

// function that converts CentralCollections to TypedCentralCollections
function inferResolvedTypes(
  centralTokens: CentralCollections,
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
