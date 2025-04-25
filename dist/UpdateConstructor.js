import { FigmaAPIURLs, extractAliasParts, fetchFigmaAPI } from './utils.js';
import { addModesDefinitions } from './transform/modeDefinitions.js';
import { updateVariableDefinitions } from './transform/variableDefinitions.js';
import { updateVariables } from './transform/updateVariables.js';
import { inferResolvedTypes } from './inferResolvedTypes.js';
import { inspect } from 'util';
class UpdateConstructor {
    fileId;
    fileVariables;
    figmaTokens;
    idCounter;
    changes;
    extraStats;
    constructor(figmaTokens, fileId, fileVariables) {
        this.fileId = fileId;
        this.figmaTokens = figmaTokens;
        this.fileVariables = fileVariables || {};
        this.idCounter = 0;
        this.changes = {
            variableCollections: [],
            variableModes: [],
            variables: [],
            variableModeValues: [],
        };
        this.extraStats = {
            variablesDeprecated: [],
            variablesUndeprecated: [],
            modesCreated: [],
            variablesCreated: [],
            variableValuesUpdated: [],
            emptyChangeset: true,
        };
    }
    getChanges() {
        return this.changes;
    }
    getStats() {
        return this.extraStats;
    }
    hasChanges() {
        return Object.keys(this.changes).some((key) => this.changes[key].length > 0);
    }
    getFigmaTokens() {
        return this.figmaTokens;
    }
    getTempId() {
        return `tempId${this.idCounter++}`;
    }
    async submitChanges(dryRun) {
        const changes = Object.fromEntries(Object.entries(this.changes).filter(([, value]) => value.length > 0));
        const noChanges = Object.keys(changes).length === 0;
        this.extraStats.emptyChangeset = noChanges;
        if (dryRun) {
            console.info('Dry run: No changes to submit');
            return;
        }
        if (noChanges) {
            console.info('No changes to submit');
            return;
        }
        console.info('Submitting changes:', inspect(changes, { depth: null, colors: true }));
        try {
            const result = await fetchFigmaAPI(FigmaAPIURLs.postVariables(this.fileId), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(changes),
            });
            this.extraStats.result = result;
        }
        catch (error) {
            this.extraStats.result =
                typeof error === 'string'
                    ? error
                    : `${error.message}\n\n${error.stack}`;
        }
    }
    createVariable(name, collectionLabel, resolvedType) {
        const variableCollectionId = this.figmaTokens[collectionLabel].collection.id;
        const tempId = this.getTempId();
        const obj = {
            action: 'CREATE',
            name,
            id: tempId,
            variableCollectionId,
            resolvedType: resolvedType,
        };
        this.changes.variables.push(obj);
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
        });
        this.extraStats.variablesCreated.push({
            collection: collectionLabel,
            variable: name,
            resolvedType,
        });
    }
    createVariableMode(name, collectionLabel) {
        const tempId = this.getTempId();
        const obj = {
            action: 'CREATE',
            id: tempId,
            name,
            variableCollectionId: this.figmaTokens[collectionLabel].collection.id,
        };
        this.changes.variableModes.push(obj);
        this.figmaTokens[collectionLabel].collection.modes.push({
            modeId: tempId,
            name,
        });
        this.extraStats.modesCreated.push({
            collection: collectionLabel,
            mode: name,
        });
    }
    updateVariable(update) {
        const fullUpdate = {
            action: 'UPDATE',
            ...update,
        };
        const existing = this.changes.variables.find((v) => v.id === fullUpdate.id);
        if (existing) {
            Object.assign(existing, fullUpdate);
        }
        else {
            this.changes.variables.push(fullUpdate);
        }
    }
    setVariableValue(variableId, modeId, value) {
        const obj = {
            variableId,
            modeId,
            value,
        };
        this.changes.variableModeValues.push(obj);
        const { collectionName, variableName, modeName, currentValue, resolvedType, } = this.reverseSearchVariableInfo(variableId, modeId);
        this.extraStats.variableValuesUpdated.push({
            collection: collectionName,
            variable: variableName,
            mode: modeName,
            oldValue: currentValue,
            newValue: value,
            resolvedType,
        });
    }
    reverseSearchVariableInfo(variableId, modeId) {
        let collectionName, variableName, modeName, currentValue = null, resolvedType = null;
        for (const { collection, variables } of Object.values(this.figmaTokens)) {
            const variable = variables.find((v) => v.id === variableId);
            if (variable) {
                collectionName = collection.name;
                variableName = variable.name;
                modeName = collection.modes.find((m) => m.modeId === modeId)?.name;
                currentValue = variable.valuesByMode[modeId];
                resolvedType = variable.resolvedType;
                break;
            }
        }
        if (!collectionName ||
            !variableName ||
            !modeName ||
            currentValue === null ||
            resolvedType === null) {
            throw new Error(`When updating variable values: Could not find the collection, variable or mode for variable id '${variableId}' and mode id '${modeId}'`);
        }
        return {
            collectionName,
            variableName,
            modeName,
            currentValue,
            resolvedType,
        };
    }
    setVariableAlias(variableId, modeId, aliasId) {
        const obj = {
            variableId,
            modeId,
            value: { type: 'VARIABLE_ALIAS', id: aliasId },
        };
        this.changes.variableModeValues.push(obj);
        const { collectionName, variableName, modeName, currentValue, resolvedType, } = this.reverseSearchVariableInfo(variableId, modeId);
        this.extraStats.variableValuesUpdated.push({
            collection: collectionName,
            variable: variableName,
            mode: modeName,
            oldValue: currentValue,
            newValue: { type: 'VARIABLE_ALIAS', id: aliasId },
            resolvedType,
        });
    }
    addDeprecationStat(collection, variable, deprecated) {
        if (deprecated) {
            this.extraStats.variablesDeprecated.push({ collection, variable });
        }
        else {
            this.extraStats.variablesUndeprecated.push({ collection, variable });
        }
    }
    getModeId(collectionLabel, modeName) {
        return this.figmaTokens[collectionLabel].collection.modes.find((m) => m.name === modeName)?.modeId;
    }
    getVariable(collectionLabel, variableName) {
        return this.figmaTokens[collectionLabel].variables.find((v) => v.name === variableName);
    }
    resolveCentralAlias(centralAlias) {
        const aliasParts = extractAliasParts(centralAlias);
        if (!aliasParts) {
            throw new Error(`When resolving alias '${centralAlias}', the alias could not be parsed`);
        }
        const { collection, variable } = aliasParts;
        if (this.figmaTokens[collection]) {
            const resolvedVariable = this.figmaTokens[collection].variables.find((v) => v.name === variable);
            if (resolvedVariable) {
                return resolvedVariable;
            }
        }
        if (this.fileVariables[collection]) {
            const figmaVariable = this.fileVariables[collection][variable];
            if (figmaVariable && 'id' in figmaVariable) {
                console.log(`Resolved alias ${centralAlias} to ${figmaVariable.name} with id ${figmaVariable.id}`, figmaVariable);
                return {
                    ...figmaVariable,
                    id: figmaVariable.subscribed_id,
                };
            }
        }
        throw new Error(`When resolving alias '${centralAlias}', the alias could not be found in the figma tokens`);
    }
    constructUpdate(colorsCollections, handleDeprecation = false) {
        const inferredC = inferResolvedTypes(colorsCollections, this.fileVariables);
        addModesDefinitions(this, inferredC);
        updateVariableDefinitions(this, inferredC, handleDeprecation);
        updateVariables(this, inferredC);
    }
}
export default UpdateConstructor;
