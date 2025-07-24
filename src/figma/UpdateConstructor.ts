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
import { inspect } from 'util'
import {
  FigmaVariableValue,
  FigmaResultCollection,
  FigmaCollections,
} from './types.js'
import {
  fetchFigmaAPI,
  FigmaAPIURLs,
  getVisibleCollectionByName,
  getCollectionsByName,
} from '../utils.js'
import { extractVdReference } from '../vd.js'

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
  emptyChangeset: boolean
  result?: PostVariablesResponse | ErrorResponsePayloadWithErrorBoolean | string
}

/**
 * Manages the construction and submission of updates to Figma variables, collections, and modes.
 *
 * The `UpdateConstructor` class tracks changes to Figma tokens, prepares mutation requests,
 * and provides statistics about the performed operations. It supports creating variables and modes,
 * updating variable values and aliases, and submitting changes to the Figma API.
 *
 * @remarks
 * - The class is initialized with the current state of Figma tokens
 * - Any changes made to the original state are tracked to be submitted later.
 * - Provides methods to create new variables and modes, update existing ones, and set variable values or aliases.
 * - There are methods to retrieve information about collections, variables, and modes that reflect changes too.
 */
class UpdateConstructor {
  private readonly fileId: string
  private readonly fileVariables: FigmaResultCollection
  private figmaTokens: FigmaCollections
  private idCounter: number
  private changes: Required<PostVariablesRequestBody>
  private extraStats: ExtraStats

  constructor(
    figmaTokens: FigmaCollections,
    fileId: string,
    fileVariables?: FigmaResultCollection,
  ) {
    this.fileId = fileId
    this.figmaTokens = figmaTokens
    this.fileVariables = fileVariables || {}
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
      emptyChangeset: true,
    }
  }

  // -------
  // Getters
  // -------

  hasChanges() {
    return Object.keys(this.changes).some(
      (key) => this.changes[key as keyof typeof this.changes].length > 0,
    )
  }

  getChanges() {
    return this.changes
  }

  getStats() {
    return this.extraStats
  }

  getModeId(collectionLabel: string, modeName: string) {
    const variableCollections = getCollectionsByName(
      this.figmaTokens,
      collectionLabel,
    )

    for (const c of variableCollections) {
      const result = c.collection.modes.find((m) => {
        return m.name === modeName
      })?.modeId

      if (result) {
        return result
      }
    }

    return undefined
  }

  getVariable(collectionLabel: string, variableName: string) {
    const variableCollections = getCollectionsByName(
      this.figmaTokens,
      collectionLabel,
    )

    for (const collection of variableCollections) {
      const variable = collection.variables.find((v) => v.name === variableName)
      if (variable) {
        return variable
      }
    }

    return undefined
  }

  getFigmaTokens(): Readonly<FigmaCollections> {
    return this.figmaTokens
  }

  getFileVariables(): Readonly<FigmaResultCollection> {
    return this.fileVariables
  }

  // -------
  // Query methods
  // -------

  resolveVdReference(vdAlias: string): LocalVariable {
    const aliasParts = extractVdReference(vdAlias)
    if (!aliasParts) {
      throw new Error(
        `When resolving alias '${vdAlias}', the alias could not be parsed`,
      )
    }

    const { collection: collectionName, variable } = aliasParts
    const collections = getCollectionsByName(this.figmaTokens, collectionName)

    for (const c of collections) {
      const resolvedVariable = c.variables.find((v) => v.name === variable)

      if (resolvedVariable) {
        return resolvedVariable
      }
    }

    if (this.fileVariables[collectionName]) {
      const figmaVariable = this.fileVariables[collectionName][variable]
      if (figmaVariable && 'id' in figmaVariable) {
        return {
          ...figmaVariable,
          id: figmaVariable.subscribed_id,
        } as unknown as LocalVariable
      }
    }

    throw new Error(
      `When resolving alias '${vdAlias}', the alias could not be found in the figma tokens`,
    )
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

  // -------
  // Mutation methods
  // -------

  createVariable(
    name: string,
    collectionLabel: string,
    resolvedType: VariableCreate['resolvedType'],
  ) {
    const variableCollection = getVisibleCollectionByName(
      this.figmaTokens,
      collectionLabel,
    )

    if (!variableCollection) {
      throw new Error(
        `When creating variable '${name}', the collection '${collectionLabel}' was not found`,
      )
    }

    const variableCollectionId = variableCollection.collection.id

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
    this.figmaTokens[variableCollectionId].variables.push({
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

    const variableCollection = getVisibleCollectionByName(
      this.figmaTokens,
      collectionLabel,
    )

    if (!variableCollection) {
      throw new Error(
        `When creating variable mode '${name}', the collection '${collectionLabel}' was not found`,
      )
    }

    const variableCollectionId = variableCollection.collection.id

    const obj: VariableModeCreate = {
      action: 'CREATE',
      id: tempId,
      name,
      variableCollectionId,
    }
    this.changes.variableModes.push(obj)
    // we will also add the variable mode to the figma tokens with a temp id
    this.figmaTokens[variableCollectionId].collection.modes.push({
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

  async submitChanges(dryRun: boolean) {
    const changes = Object.fromEntries(
      Object.entries(this.changes).filter(([, value]) => value.length > 0),
    )
    const noChanges = Object.keys(changes).length === 0
    this.extraStats.emptyChangeset = noChanges

    if (dryRun) {
      console.info('Dry run: No changes to submit')
      return
    }

    if (noChanges) {
      console.info('No changes to submit')
      return
    }

    console.info(
      'Submitting changes:',
      inspect(changes, { depth: null, colors: true }),
    )

    try {
      const result = await fetchFigmaAPI<PostVariablesResponse>(
        FigmaAPIURLs.postVariables(this.fileId),
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

  // -------
  // Helper methods
  // -------

  /**
   * Generates and returns a unique temporary ID string.
   * The ID is constructed by prefixing "tempId" to an incrementing counter.
   *
   * @returns {string} A unique temporary ID.
   */
  private getTempId() {
    return `tempId${this.idCounter++}`
  }
}

export default UpdateConstructor
