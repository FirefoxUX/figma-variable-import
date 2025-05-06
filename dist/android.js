import { memoize, isFigmaAlias, figmaToCulori, getVisibleCollectionByName, getCollectionsByName, } from './utils.js';
import Config from './Config.js';
export function getAndroidModes(figmaAndroidTokens, figmaMobileColors) {
    const resolveColor = getResolveColor(figmaMobileColors);
    const themeCollectionName = Config.android.themeCollectionName;
    const themeCollection = getVisibleCollectionByName(figmaAndroidTokens, themeCollectionName);
    if (!themeCollection) {
        throw new Error(`The collection '${themeCollectionName}' is missing in the figma file. Please add it to the figma file before running the script again.`);
    }
    const [nonOpacityVariables, opacityVariables] = themeCollection.variables.reduce((acc, variable) => {
        if (variable.name.startsWith(Config.android.opacityVariablePrefix)) {
            acc[1].push(variable);
        }
        else {
            acc[0].push(variable);
        }
        return acc;
    }, [[], []]);
    const updatedNonOpacityVariables = nonOpacityVariables.reduce((acc, variable) => {
        const updatedVariable = {
            'Acorn / Light': resolveColor(figmaAndroidTokens, 'Light', {
                collectionName: themeCollectionName,
                variableName: variable.name,
            }),
            'Acorn / Dark': resolveColor(figmaAndroidTokens, 'Dark', {
                collectionName: themeCollectionName,
                variableName: variable.name,
            }),
            'Acorn / Private': resolveColor(figmaAndroidTokens, 'Private', {
                collectionName: themeCollectionName,
                variableName: variable.name,
            }),
        };
        acc[variable.name] = updatedVariable;
        return acc;
    }, {});
    const updatedOpacityVariables = opacityVariables.reduce((acc, variable) => {
        const path = variable.name.split('/').map((part) => part.trim());
        const [_, referencedVariableName, opacity] = path;
        const opacityNumber = parseFloat(opacity.split('-')[1]) / 100;
        if (isNaN(opacityNumber)) {
            throw new Error(`When parsing opacity variable, the value for ${opacity} is not a number`);
        }
        const variableName = `${Config.android.variablePrefix}${referencedVariableName}`;
        const variableNameFallback = `${Config.android.variablePrefixAlt}${referencedVariableName}`;
        const resolveWithFallback = (mode, name, fallback) => {
            let color = undefined;
            try {
                color = resolveColor(figmaAndroidTokens, mode, {
                    collectionName: themeCollectionName,
                    variableName: name,
                });
            }
            catch (_e) {
                color = resolveColor(figmaAndroidTokens, mode, {
                    collectionName: themeCollectionName,
                    variableName: fallback,
                });
            }
            return {
                ...color,
                alpha: opacityNumber * (color.alpha ?? 1),
            };
        };
        const updatedVariable = {
            'Acorn / Light': resolveWithFallback('Light', variableName, variableNameFallback),
            'Acorn / Dark': resolveWithFallback('Dark', variableName, variableNameFallback),
            'Acorn / Private': resolveWithFallback('Private', variableName, variableNameFallback),
        };
        acc[variable.name] = updatedVariable;
        return acc;
    }, {});
    const collection = {
        [themeCollectionName]: {
            ...updatedNonOpacityVariables,
            ...updatedOpacityVariables,
        },
    };
    return collection;
}
const getCollections = memoize((collections, search) => {
    if ('collectionName' in search) {
        return getCollectionsByName(collections, search.collectionName);
    }
    else {
        const result = Object.values(collections).find((collection) => collection.collection.variableIds.includes(search.variableId));
        if (result) {
            return [result];
        }
    }
    return [];
}, 'getCollection');
const getModeId = memoize((collection, mode) => {
    const modesLookup = [Config.android.themeCollectionReferenceMode, mode];
    if (collection.collection.modes.length === 1) {
        return collection.collection.modes[0].modeId;
    }
    else {
        for (const lookup of modesLookup) {
            const foundMode = collection.collection.modes.find((mode) => lookup === mode.name);
            if (foundMode) {
                return foundMode.modeId;
            }
        }
    }
    throw new Error(`Mode ${mode} not found in collection ${collection.collection.name}`);
}, 'getModeId');
const getVariableData = memoize((collection, search) => {
    if ('collectionName' in search) {
        return collection.variables.find((variable) => variable.name === search.variableName);
    }
    else {
        return collection.variables.find((variable) => variable.id === search.variableId);
    }
}, 'getVariableData');
const getVariableValue = (variableData, modeId, errParams) => {
    const variableValue = variableData.valuesByMode[modeId];
    if (!variableValue) {
        throw new Error(`Variable ${errParams.errVariableName} not found in collection ${errParams.errCollectionName} for mode ${errParams.mode}`);
    }
    return variableValue;
};
export const getResolveColor = (fallbackCollections) => {
    const resolveColor = memoize((collections, mode, search) => {
        const errCollectionName = 'collectionName' in search
            ? search.collectionName
            : 'Unknown collection';
        const errVariableName = 'collectionName' in search ? search.variableName : search.variableId;
        const foundCollectiond = getCollections(collections, search);
        if (foundCollectiond.length <= 0) {
            throw new Error(`Collection ${errCollectionName} not found while resolving ${errVariableName}`);
        }
        for (const foundCollection of foundCollectiond) {
            const modeId = getModeId(foundCollection, mode);
            const variableData = getVariableData(foundCollection, search);
            if (!variableData) {
                throw new Error(`Variable ${errVariableName} not found in collection ${errCollectionName}`);
            }
            const variableValue = getVariableValue(variableData, modeId, {
                errVariableName,
                errCollectionName,
                mode,
            });
            if (isFigmaAlias(variableValue)) {
                try {
                    return resolveColor(collections, mode, {
                        variableId: variableValue.id,
                    });
                }
                catch (e) {
                    if (collections !== fallbackCollections) {
                        return resolveColor(fallbackCollections, mode, {
                            collectionName: foundCollection.collection.name,
                            variableName: variableData.name,
                        });
                    }
                    throw e;
                }
            }
            if (variableValue === null ||
                typeof variableValue !== 'object' ||
                !('r' in variableValue) ||
                !('g' in variableValue) ||
                !('b' in variableValue) ||
                !('a' in variableValue)) {
                throw new Error(`Variable ${errVariableName} in collection ${errCollectionName} is not a color`);
            }
            const parsedColor = figmaToCulori(variableValue);
            if (!parsedColor) {
                throw new Error(`Variable ${errVariableName} in collection ${errCollectionName} is not a valid color`);
            }
            return parsedColor;
        }
        throw new Error(`Variable ${errVariableName} not found in collection ${errCollectionName}`);
    }, 'resolveColor');
    return resolveColor;
};
