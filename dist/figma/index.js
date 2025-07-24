import { inferResolvedTypes } from './transform/inferResolvedTypes.js';
import { fetchFigmaAPI, FigmaAPIURLs } from '../utils.js';
import { normalizeFigmaTokens } from './normalizeFigmaTokens.js';
import { addModesDefinitions } from './transform/modeDefinitions.js';
import { updateVariables } from './transform/updateVariables.js';
import { updateVariableDefinitions } from './transform/variableDefinitions.js';
import UpdateConstructor from './UpdateConstructor.js';
export async function submitVDCollections(fileId, figmaTokens, tokensCollections, options) {
    const { handleDeprecation = false, dryRun = false } = options || {};
    const uc = new UpdateConstructor(figmaTokens, fileId);
    const inferredC = inferResolvedTypes(uc, tokensCollections);
    addModesDefinitions(uc, inferredC);
    updateVariableDefinitions(uc, inferredC, handleDeprecation);
    updateVariables(uc, inferredC);
    await uc.submitChanges(dryRun);
    return uc;
}
export async function getFigmaCollections(fileId) {
    const url = FigmaAPIURLs.getLocalVariables(fileId);
    const { meta } = await fetchFigmaAPI(url);
    return normalizeFigmaTokens(meta);
}
