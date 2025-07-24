import Config from './Config.js';
import { customParse, formatHex8 } from './color.js';
import { createHash } from 'crypto';
import { extractVdReference } from './vd.js';
const FIGMA_API_ENDPOINT = 'https://api.figma.com';
export const FigmaAPIURLs = {
    getLocalVariables: (fileId) => `${FIGMA_API_ENDPOINT}/v1/files/${fileId}/variables/local`,
    getPublishedVariables: (fileId) => `${FIGMA_API_ENDPOINT}/v1/files/${fileId}/variables/published`,
    postVariables: (fileId) => `${FIGMA_API_ENDPOINT}/v1/files/${fileId}/variables`,
};
export async function fetchFigmaAPI(url, options = {}) {
    const headers = {
        'X-FIGMA-TOKEN': Config.figmaAccessToken,
        ...options.headers,
    };
    const finalOptions = {
        ...options,
        headers,
    };
    try {
        const response = await fetch(url, finalOptions);
        const data = (await response.json());
        if (data.error === true) {
            throw new Error(`When fetching Figma API, an error occurred: ${data.message}`);
        }
        return data;
    }
    catch (error) {
        console.error('Error fetching Figma API:', error);
        throw error;
    }
}
export function roundTwoDecimals(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
export function isFigmaAlias(value) {
    return value !== undefined && typeof value === 'object' && 'type' in value;
}
export function culoriToFigma(rgba) {
    return {
        r: rgba.r,
        g: rgba.g,
        b: rgba.b,
        a: rgba.alpha ?? 1,
    };
}
export function figmaToCulori(rgba) {
    if (rgba === null ||
        rgba === undefined ||
        typeof rgba !== 'object' ||
        !('r' in rgba) ||
        !('g' in rgba) ||
        !('b' in rgba) ||
        !('a' in rgba) ||
        typeof rgba.r !== 'number' ||
        typeof rgba.g !== 'number' ||
        typeof rgba.b !== 'number' ||
        typeof rgba.a !== 'number') {
        return undefined;
    }
    return {
        mode: 'rgb',
        r: rgba.r,
        g: rgba.g,
        b: rgba.b,
        alpha: rgba.a,
    };
}
export function compareColors(a, b) {
    return formatHex8(a) === formatHex8(b);
}
export const SYMBOL_RESOLVED_TYPE = Symbol('resolvedType');
export function determineResolvedType(value) {
    if (typeof value === 'boolean') {
        return 'BOOLEAN';
    }
    if (!isNaN(Number(value))) {
        return 'FLOAT';
    }
    if (customParse(value) !== undefined) {
        return 'COLOR';
    }
    if (typeof value === 'string') {
        return 'STRING';
    }
    throw new Error(`Could not determine type for value: ${JSON.stringify(value)}`);
}
export function determineResolvedTypeWithAlias(collections, value, fileVariables) {
    const resolvedType = determineResolvedType(value);
    if (resolvedType !== 'STRING')
        return resolvedType;
    const aliasParts = extractVdReference(value);
    if (aliasParts) {
        const { collection, variable } = aliasParts;
        if (collections[collection]?.[variable]) {
            return collections[collection][variable][SYMBOL_RESOLVED_TYPE];
        }
        if (fileVariables && fileVariables[collection]) {
            const variableData = fileVariables[collection][variable];
            if (variableData && 'id' in variableData) {
                const type = variableData.resolvedDataType;
                if (type) {
                    return type;
                }
            }
        }
        return null;
    }
    return resolvedType;
}
export function roundTo(value, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round((value + Number.EPSILON) * factor) / factor;
}
const RECORD_STATS = false;
const memoStats = new Map();
function recordMemoStat(name, hit) {
    if (!memoStats.has(name)) {
        memoStats.set(name, { hits: 0, misses: 0 });
    }
    const stats = memoStats.get(name);
    if (hit) {
        stats.hits++;
    }
    else {
        stats.misses++;
    }
}
export function getMemoStats() {
    return Array.from(memoStats.entries()).map(([name, { hits, misses }]) => ({
        name,
        hits,
        misses,
    }));
}
export function memoize(fn, givenName) {
    const cache = new Map();
    const fnName = givenName || fn.name || getNameFromStackTrace(new Error());
    const memoizedFn = (...args) => {
        const key = quickHash(args);
        if (cache.has(key)) {
            if (RECORD_STATS) {
                recordMemoStat(fnName, true);
            }
            const cachedValue = cache.get(key);
            return cachedValue;
        }
        if (RECORD_STATS) {
            recordMemoStat(fnName, false);
        }
        const result = fn(...args);
        if (result instanceof Promise) {
            const promise = result.then((res) => {
                cache.set(key, res);
                return res;
            });
            cache.set(key, promise);
            return promise;
        }
        else {
            cache.set(key, result);
            return result;
        }
    };
    return memoizedFn;
}
function getNameFromStackTrace(error) {
    const stack = error.stack;
    if (!stack)
        return 'Unknown function';
    const lines = stack.split('\n');
    const match = lines[1].match(/at (\w+)/);
    return match ? match[1] : 'Unknown function';
}
export function getCollectionsByName(collections, name, onlyVisible = false) {
    return Object.values(collections)
        .filter((collection) => collection.collection.name === name &&
        (!onlyVisible || !collection.collection.hiddenFromPublishing))
        .sort((a, b) => {
        const aHidden = a.collection.hiddenFromPublishing;
        const bHidden = b.collection.hiddenFromPublishing;
        if (aHidden && !bHidden) {
            return 1;
        }
        if (!aHidden && bHidden) {
            return -1;
        }
        return 0;
    });
}
export function getVisibleCollectionByName(collections, name) {
    const visibleCollections = getCollectionsByName(collections, name, true);
    if (visibleCollections.length === 0) {
        return undefined;
    }
    if (visibleCollections.length > 1) {
        throw new Error(`Found multiple visible collections with the name '${name}'. Can't proceed due to ambiguity.`);
    }
    return visibleCollections[0];
}
export function quickHash(input) {
    const data = typeof input === 'string' || typeof input === 'number'
        ? String(input)
        : JSON.stringify(input);
    return createHash('sha1').update(data).digest('base64');
}
