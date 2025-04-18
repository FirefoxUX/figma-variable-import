import Config from './Config.js';
import { getCentralCollectionValues } from './central-import.js';
import { fetchFigmaAPI, FigmaAPIURLs } from './utils.js';
import { HCM_MAP } from './imports.js';
import UpdateConstructor from './UpdateConstructor.js';
import { addModesDefinitions } from './transform/modeDefinitions.js';
import { updateVariableDefinitions } from './transform/variableDefinitions.js';
import { updateVariables } from './transform/updateVariables.js';
import { documentError, documentStats } from './workflow/index.js';
import { constructRelativeData } from './relative-transform.js';
async function run() {
    const { meta: figmaData } = await fetchFigmaAPI(FigmaAPIURLs.getVariables(Config.figmaFileId));
    const centralData = await getCentralCollectionValues();
    const relativeData = constructRelativeData(centralData.relative);
    const centralTokens = {
        'HCM Theme': HCM_MAP,
        ...centralData.central,
        ...relativeData,
    };
    const figmaTokens = normalizeFigmaTokens(figmaData);
    const uc = new UpdateConstructor(centralTokens, figmaTokens);
    addModesDefinitions(uc);
    updateVariableDefinitions(uc);
    updateVariables(uc);
    if (!Config.dryRun) {
        await uc.submitChanges(Config.figmaFileId);
    }
    documentStats(uc.getStats(), uc.figmaTokens);
}
run().catch((error) => {
    documentError(error).then(() => {
        throw error;
    });
});
function normalizeFigmaTokens(figmaData) {
    return Object.keys(figmaData.variableCollections).reduce((acc, key) => {
        const collection = figmaData.variableCollections[key];
        if (!collection) {
            throw new Error(`When normalizing Figma tokens, the collection '${key}' was not found`);
        }
        const variables = Object.values(figmaData.variables).filter((v) => v.variableCollectionId === collection.id);
        acc[collection.name] = {
            collection,
            variables,
        };
        return acc;
    }, {});
}
