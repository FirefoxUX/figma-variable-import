export function addModesDefinitions(uc) {
    for (const collectionLabel in uc.centralTokens) {
        if (!uc.figmaTokens[collectionLabel]) {
            throw new Error(`The collection '${collectionLabel}' is missing in the figma file. Please add it to the figma file before running the script again.
Figma collections: ${Object.keys(uc.figmaTokens).join(', ')}
Central collections: ${Object.keys(uc.centralTokens).join(', ')}`);
        }
        const { onlyInCentral } = generateModeSets(uc.centralTokens[collectionLabel], uc.figmaTokens[collectionLabel]);
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
