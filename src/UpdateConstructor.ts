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
  FigmaResultCollection,
  FigmaVariableValue,
  TypedCentralCollections,
  TypedCentralVariable,
} from './types.js'
import { FigmaAPIURLs, extractAliasParts, fetchFigmaAPI } from './utils.js'
import { addModesDefinitions } from './transform/modeDefinitions.js'
import { updateVariableDefinitions } from './transform/variableDefinitions.js'
import { updateVariables } from './transform/updateVariables.js'
import { inferResolvedTypes } from './inferResolvedTypes.js'

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
  private fileId: string
  figmaTokens: FigmaCollections
  fileVariables: FigmaResultCollection

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

  async submitChanges(dryRun: boolean) {
    if (dryRun) {
      console.info('Dry run: No changes to submit')
      return
    }

    const changes = Object.fromEntries(
      Object.entries(this.changes).filter(([, value]) => value.length > 0),
    )

    if (Object.keys(changes).length === 0) {
      console.info('No changes to submit')
      return
    }

    console.info('Submitting changes...')

    console.log('CHANGES', JSON.stringify(changes, null, 2))

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

    const { collection, variable } = aliasParts

    if (this.figmaTokens[collection]) {
      const resolvedVariable = this.figmaTokens[collection].variables.find(
        (v) => v.name === variable,
      )

      if (resolvedVariable) {
        return resolvedVariable
      }
    }

    if (this.fileVariables[collection]) {
      const figmaVariable = this.fileVariables[collection][variable]
      if (figmaVariable && 'id' in figmaVariable) {
        console.log(
          `Resolved alias ${centralAlias} to ${figmaVariable.name} with id ${figmaVariable.id}`,
          figmaVariable,
        )
        return {
          ...figmaVariable,
          id: figmaVariable.subscribed_id,
        } as unknown as LocalVariable
      }
    }

    throw new Error(
      `When resolving alias '${centralAlias}', the alias could not be found in the figma tokens`,
    )
  }

  constructUpdate(colorsCollections: CentralCollections) {
    // Infer the resolved types of the collections
    const inferredC = inferResolvedTypes(colorsCollections, this.fileVariables)

    // Iterate over collections and add missing modes
    addModesDefinitions(this, inferredC)

    //Iterate over collections and add missing variables
    updateVariableDefinitions(this, inferredC)

    // STEP 4: Update the values of the variables
    updateVariables(this, inferredC)
  }
}

export default UpdateConstructor
