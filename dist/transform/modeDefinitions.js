export function addModesDefinitions(uc, tokens) {
    const figmaTokens = uc.getFigmaTokens();
    for (const collectionLabel in tokens) {
        if (!figmaTokens[collectionLabel]) {
            throw new Error(`The collection '${collectionLabel}' is missing in the figma file. Please add it to the figma file before running the script again.
Figma collections: ${Object.keys(figmaTokens).join(', ')}
Central collections: ${Object.keys(tokens).join(', ')}`);
        }
        const { onlyInCentral } = generateModeSets(tokens[collectionLabel], figmaTokens[collectionLabel]);
        for (const key of onlyInCentral) {
            uc.createVariableMode(key, collectionLabel);
        }
    }
}
function generateModeSets(central, figma) {
    const figmaModes = new Set(figma.collection.modes.map((m) => m.name));
    const centralKeys = new Set(Object.keys(central[Object.keys(central)[0]]));
    const onlyInCentral = new Set([...centralKeys].filter((key) => !figmaModes.has(key)));
    return {
        onlyInCentral,
    };
}
