import { inspect } from 'util';
import { fetchFigmaAPI, FigmaAPIURLs, getVisibleCollectionByName, getCollectionsByName, } from '../utils.js';
import { extractVdReference } from '../vd.js';
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
    hasChanges() {
        return Object.keys(this.changes).some((key) => this.changes[key].length > 0);
    }
    getChanges() {
        return this.changes;
    }
    getStats() {
        return this.extraStats;
    }
    getModeId(collectionLabel, modeName) {
        const variableCollections = getCollectionsByName(this.figmaTokens, collectionLabel);
        for (const c of variableCollections) {
            const result = c.collection.modes.find((m) => {
                return m.name === modeName;
            })?.modeId;
            if (result) {
                return result;
            }
        }
        return undefined;
    }
    getVariable(collectionLabel, variableName) {
        const variableCollections = getCollectionsByName(this.figmaTokens, collectionLabel);
        for (const collection of variableCollections) {
            const variable = collection.variables.find((v) => v.name === variableName);
            if (variable) {
                return variable;
            }
        }
        return undefined;
    }
    getFigmaTokens() {
        return this.figmaTokens;
    }
    getFileVariables() {
        return this.fileVariables;
    }
    resolveVdReference(vdAlias) {
        const aliasParts = extractVdReference(vdAlias);
        if (!aliasParts) {
            throw new Error(`When resolving alias '${vdAlias}', the alias could not be parsed`);
        }
        const { collection: collectionName, variable } = aliasParts;
        const collections = getCollectionsByName(this.figmaTokens, collectionName);
        for (const c of collections) {
            const resolvedVariable = c.variables.find((v) => v.name === variable);
            if (resolvedVariable) {
                return resolvedVariable;
            }
        }
        if (this.fileVariables[collectionName]) {
            const figmaVariable = this.fileVariables[collectionName][variable];
            if (figmaVariable && 'id' in figmaVariable) {
                return {
                    ...figmaVariable,
                    id: figmaVariable.subscribed_id,
                };
            }
        }
        throw new Error(`When resolving alias '${vdAlias}', the alias could not be found in the figma tokens`);
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
    createVariable(name, collectionLabel, resolvedType) {
        const variableCollection = getVisibleCollectionByName(this.figmaTokens, collectionLabel);
        if (!variableCollection) {
            throw new Error(`When creating variable '${name}', the collection '${collectionLabel}' was not found`);
        }
        const variableCollectionId = variableCollection.collection.id;
        const tempId = this.getTempId();
        const obj = {
            action: 'CREATE',
            name,
            id: tempId,
            variableCollectionId,
            resolvedType: resolvedType,
        };
        this.changes.variables.push(obj);
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
        });
        this.extraStats.variablesCreated.push({
            collection: collectionLabel,
            variable: name,
            resolvedType,
        });
    }
    createVariableMode(name, collectionLabel) {
        const tempId = this.getTempId();
        const variableCollection = getVisibleCollectionByName(this.figmaTokens, collectionLabel);
        if (!variableCollection) {
            throw new Error(`When creating variable mode '${name}', the collection '${collectionLabel}' was not found`);
        }
        const variableCollectionId = variableCollection.collection.id;
        const obj = {
            action: 'CREATE',
            id: tempId,
            name,
            variableCollectionId,
        };
        this.changes.variableModes.push(obj);
        this.figmaTokens[variableCollectionId].collection.modes.push({
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
    getTempId() {
        return `tempId${this.idCounter++}`;
    }
}
export default UpdateConstructor;
