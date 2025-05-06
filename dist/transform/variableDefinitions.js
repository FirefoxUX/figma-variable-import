import Config from '../Config.js';
import { getVisibleCollectionByName, SYMBOL_RESOLVED_TYPE } from '../utils.js';
export function updateVariableDefinitions(uc, tokens, handleDeprecation = false) {
    const figmaTokens = uc.getFigmaTokens();
    for (const collectionLabel in tokens) {
        const collection = getVisibleCollectionByName(figmaTokens, collectionLabel);
        if (!collection) {
            throw new Error(`The collection '${collectionLabel}' is missing in the Figma file. Please add it to the Figma file before running the script again.`);
        }
        const sets = generateVariableSets(tokens[collectionLabel], collection);
        for (const key of sets.onlyInCentral) {
            const resolvedType = tokens[collectionLabel][key][SYMBOL_RESOLVED_TYPE];
            uc.createVariable(key, collectionLabel, resolvedType);
        }
        if (handleDeprecation) {
            for (const key of sets.onlyInFigma) {
                if (Config.figmaOnlyVariables?.includes(key)) {
                    continue;
                }
                const variableData = collection.variables.find((v) => v.name === key);
                if (!variableData) {
                    throw new Error(`When adding deprecation tags, the variable ${key} could not be found in the Figma tokens`);
                }
                const newDescription = potentiallyAddDeprecated(variableData.description);
                if (newDescription) {
                    uc.updateVariable({
                        id: variableData.id,
                        description: newDescription,
                    });
                    uc.addDeprecationStat(collectionLabel, variableData.name, true);
                }
            }
            for (const key of sets.inBoth) {
                const variableData = collection.variables.find((v) => v.name === key);
                if (!variableData) {
                    throw new Error(`When removing deprecation tags, the variable ${key} could not be found in the Figma tokens`);
                }
                const newDescription = potentiallyRemoveDeprecated(variableData.description);
                if (newDescription) {
                    uc.updateVariable({
                        id: variableData.id,
                        description: newDescription,
                    });
                    uc.addDeprecationStat(collectionLabel, variableData.name, false);
                }
            }
        }
    }
}
function potentiallyAddDeprecated(description) {
    if (description.includes('[deprecated]')) {
        return undefined;
    }
    return `${description.trimEnd()}\n\n[deprecated] This variable is deprecated.`.trimStart();
}
function potentiallyRemoveDeprecated(description) {
    if (!description.includes('[deprecated]')) {
        return undefined;
    }
    return description
        .split('\n')
        .filter((line) => !line.includes('[deprecated]'))
        .join('\n')
        .trimEnd();
}
function generateVariableSets(central, figma) {
    const centralKeys = new Set(Object.keys(central));
    const figmaKeys = new Set(figma.variables.map((v) => v.name));
    const onlyInCentral = new Set([...centralKeys].filter((key) => !figmaKeys.has(key)));
    const onlyInFigma = new Set([...figmaKeys].filter((key) => !centralKeys.has(key)));
    const inBoth = new Set([...centralKeys].filter((key) => figmaKeys.has(key)));
    return {
        onlyInCentral,
        onlyInFigma,
        inBoth,
    };
}
