import Config from '../Config.js';
import { SYMBOL_RESOLVED_TYPE } from '../utils.js';
export function updateVariableDefinitions(uc) {
    for (const collectionLabel in uc.centralTokens) {
        const sets = generateVariableSets(uc.centralTokens[collectionLabel], uc.figmaTokens[collectionLabel]);
        for (const key of sets.onlyInCentral) {
            const resolvedType = uc.centralTokens[collectionLabel][key][SYMBOL_RESOLVED_TYPE];
            uc.createVariable(key, collectionLabel, resolvedType);
        }
        for (const key of sets.onlyInFigma) {
            if (Config.figmaOnlyVariables?.includes(key)) {
                continue;
            }
            const variableData = uc.figmaTokens[collectionLabel].variables.find((v) => v.name === key);
            if (!variableData) {
                throw new Error(`When adding deprecation tags, the variable ${key} could not be found in the Figma tokens`);
            }
            const newDescription = potentiallyAddDeprecated(variableData.description);
            if (newDescription) {
                uc.updateVariable({
                    id: variableData.id,
                    description: newDescription,
                });
                uc.addDeprecationStat(collectionLabel, variableData.id, true);
            }
        }
        for (const key of sets.inBoth) {
            const variableData = uc.figmaTokens[collectionLabel].variables.find((v) => v.name === key);
            if (!variableData) {
                throw new Error(`When removing deprecation tags, the variable ${key} could not be found in the Figma tokens`);
            }
            const newDescription = potentiallyRemoveDeprecated(variableData.description);
            if (newDescription) {
                uc.updateVariable({
                    id: variableData.id,
                    description: newDescription,
                });
                uc.addDeprecationStat(collectionLabel, variableData.id, false);
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
