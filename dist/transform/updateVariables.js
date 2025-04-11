import { converter, parse } from 'culori';
import { isFigmaAlias, culoriToFigma, figmaToCulori, SYMBOL_RESOLVED_TYPE, isCentralAlias, compareColors, } from '../utils.js';
import { customParse } from '../color.js';
const rgb = converter('rgb');
export function updateVariables(uc) {
    for (const collectionName in uc.centralTokens) {
        for (const [variableName, centralValues] of Object.entries(uc.centralTokens[collectionName])) {
            for (const [modeName, centralValue] of Object.entries(centralValues)) {
                const figmaVariableData = getFigmaVariableData(uc, collectionName, modeName, variableName);
                const requiresUpdate = checkIfUpdateRequired(figmaVariableData, centralValue, uc, centralValues);
                if (!requiresUpdate) {
                    continue;
                }
                if (isCentralAlias(centralValue)) {
                    const resolvedAlias = uc.resolveCentralAlias(centralValue);
                    if (!resolvedAlias)
                        throw new Error(`When resolving alias '${centralValue}' in collection '${collectionName}', the alias could not be found`);
                    uc.setVariableAlias(figmaVariableData.info.id, figmaVariableData.modeId, resolvedAlias.id);
                    continue;
                }
                if (centralValues[SYMBOL_RESOLVED_TYPE] === 'COLOR') {
                    const parsedColor = customParse(centralValue);
                    if (parsedColor === undefined) {
                        throw new Error(`When updating variables: Invalid central color value: ${centralValue} for token ${variableName} in collection ${collectionName}`);
                    }
                    uc.setVariableValue(figmaVariableData.info.id, figmaVariableData.modeId, culoriToFigma(rgb(parsedColor)));
                    continue;
                }
                uc.setVariableValue(figmaVariableData.info.id, figmaVariableData.modeId, centralValue);
            }
        }
    }
}
function checkIfUpdateRequired(figmaVariableData, centralValue, uc, centralValues) {
    let requiresUpdate = figmaVariableData.value === undefined;
    if (!requiresUpdate) {
        const isCentralValueAlias = isCentralAlias(centralValue);
        const isFigmaValueAlias = isFigmaAlias(figmaVariableData.value);
        if (isCentralValueAlias !== isFigmaValueAlias) {
            requiresUpdate = true;
        }
        else if (isCentralValueAlias && isFigmaValueAlias) {
            const resolveCentralAlias = uc.resolveCentralAlias(centralValue);
            if (resolveCentralAlias.id !== figmaVariableData.value.id) {
                requiresUpdate = true;
            }
        }
        else if (centralValues[SYMBOL_RESOLVED_TYPE] === 'FLOAT') {
            if (centralValue.toFixed(4) !==
                figmaVariableData.value.toFixed(4)) {
                requiresUpdate = true;
            }
        }
        else if (centralValues[SYMBOL_RESOLVED_TYPE] !== 'COLOR') {
            if (figmaVariableData.value !== centralValue) {
                requiresUpdate = true;
            }
        }
        else {
            if (!figmaVariableData.value ||
                typeof figmaVariableData.value !== 'object' ||
                !('r' in figmaVariableData.value)) {
                requiresUpdate = true;
            }
            else {
                const centralParsed = parse(centralValue);
                const figmaParsed = figmaToCulori(figmaVariableData.value);
                if (figmaParsed === undefined ||
                    !compareColors(centralParsed, figmaParsed)) {
                    requiresUpdate = true;
                }
            }
        }
    }
    return requiresUpdate;
}
function getFigmaVariableData(uc, collectionName, modeName, variableName) {
    const modeId = uc.getModeId(collectionName, modeName);
    if (!modeId)
        throw new Error(`When updating variables: Mode ${modeName} not found in collection ${collectionName}`);
    const info = uc.getVariable(collectionName, variableName);
    if (!info)
        throw new Error(`When updating variables: Variable ${variableName} not found in collection ${collectionName}`);
    const value = info.valuesByMode[modeId];
    return { value, info, modeId };
}
