export function normalizeFigmaTokens(figmaData) {
    return Object.keys(figmaData.variableCollections).reduce((acc, key) => {
        const collection = figmaData.variableCollections[key];
        if (!collection) {
            throw new Error(`When normalizing Figma tokens, the collection '${key}' was not found`);
        }
        const variables = Object.values(figmaData.variables).filter((v) => v.variableCollectionId === collection.id);
        acc[collection.id] = {
            toJSON: () => `${collection.key}`,
            collection,
            variables,
        };
        return acc;
    }, {});
}
export function normalizeFigmaPublishedTokens(figmaData) {
    return Object.values(figmaData.variableCollections).reduce((acc, collectionData) => {
        acc[collectionData.name] = Object.values(figmaData.variables)
            .filter((v) => v.variableCollectionId === collectionData.id)
            .reduce((varAcc, variableData) => {
            varAcc[variableData.name] = variableData;
            return varAcc;
        }, {});
        return acc;
    }, {});
}
