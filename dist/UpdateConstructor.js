import { FigmaAPIURLs, SYMBOL_RESOLVED_TYPE, determineResolvedTypeWithAlias, extractAliasParts, fetchFigmaAPI, } from './utils.js';
class UpdateConstructor {
    idCounter;
    changes;
    extraStats;
    centralTokens;
    figmaTokens;
    constructor(centralTokens, figmaTokens) {
        this.centralTokens = inferResolvedTypes(centralTokens);
        this.figmaTokens = figmaTokens;
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
    getTempId() {
        return `tempId${this.idCounter++}`;
    }
    async submitChanges(fileId) {
        const changes = Object.fromEntries(Object.entries(this.changes).filter(([, value]) => value.length > 0));
        if (Object.keys(changes).length === 0) {
            console.info('No changes to submit');
            return;
        }
        console.info('Submitting changes:', changes);
        try {
            const result = await fetchFigmaAPI(FigmaAPIURLs.postVariables(fileId), {
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
        const variable = this.figmaTokens[aliasParts.collection].variables.find((v) => v.name === aliasParts.variable);
        if (!variable) {
            throw new Error(`When resolving alias '${centralAlias}', the alias could not be found in the figma tokens`);
        }
        return variable;
    }
}
export default UpdateConstructor;
function inferResolvedTypes(centralTokens) {
    const typedCentralTokens = {};
    const queue = [];
    const resolveVariableTypes = (collectionName, variableName, addToQueue) => {
        const variable = centralTokens[collectionName][variableName];
        let lastResolvedType = undefined;
        for (const mode in variable) {
            const value = variable[mode];
            const resolvedType = determineResolvedTypeWithAlias(typedCentralTokens, value);
            if (resolvedType === null) {
                if (addToQueue) {
                    queue.push({ collectionName, variableName });
                    return;
                }
                else {
                    throw new Error(`When trying to infer variable types: Variable '${variableName}' in collection '${collectionName}' could not be resolved (variable value: ${value})`);
                }
            }
            if (lastResolvedType && lastResolvedType !== resolvedType) {
                throw new Error(`When trying to infer variable types: Variable '${variableName}' in collection '${collectionName}' has conflicting types in different modes (${lastResolvedType} and ${resolvedType})`);
            }
            lastResolvedType = resolvedType;
        }
        if (!lastResolvedType) {
            throw new Error(`When trying to infer variable types: Variable '${variableName}' in collection '${collectionName}' has no modes`);
        }
        const typedVariable = {
            ...variable,
            [SYMBOL_RESOLVED_TYPE]: lastResolvedType,
        };
        if (!typedCentralTokens[collectionName]) {
            typedCentralTokens[collectionName] = {};
        }
        typedCentralTokens[collectionName][variableName] = typedVariable;
    };
    for (const collectionName in centralTokens) {
        const collection = centralTokens[collectionName];
        for (const variableName in collection) {
            resolveVariableTypes(collectionName, variableName, true);
        }
    }
    for (const { collectionName, variableName } of queue) {
        resolveVariableTypes(collectionName, variableName, false);
    }
    if (queue.length > 0) {
        console.warn(`WARNING: ${queue.length} variables had to be resolved in a second pass.
         This happens when an alias references a variable that is defined later in the central tokens.
         While this is not a problem, you might be able to optimize the order of the central tokens.
         If it is not possible to optimize the order anymore, you can remove this warning!`);
    }
    return typedCentralTokens;
}
