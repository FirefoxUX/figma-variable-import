import tinycolor from 'tinycolor2';
import Config from './Config.js';
const FIGMA_API_ENDPOINT = 'https://api.figma.com';
export const FigmaAPIURLs = {
    getVariables: (fileId) => `${FIGMA_API_ENDPOINT}/v1/files/${fileId}/variables/local`,
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
        const data = await response.json();
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
export function normalizeRGBA(rgba) {
    return {
        r: rgba.r / 255,
        g: rgba.g / 255,
        b: rgba.b / 255,
        a: roundTwoDecimals(rgba.a),
    };
}
export function denormalizeRGBA(rgba) {
    return {
        r: Math.floor(rgba.r * 255),
        g: Math.floor(rgba.g * 255),
        b: Math.floor(rgba.b * 255),
        a: rgba.a,
    };
}
export const SYMBOL_RESOLVED_TYPE = Symbol('resolvedType');
export function determineResolvedType(value) {
    if (typeof value === 'boolean') {
        return 'BOOLEAN';
    }
    if (!isNaN(Number(value))) {
        return 'FLOAT';
    }
    if (tinycolor(value).isValid()) {
        return 'COLOR';
    }
    if (typeof value === 'string') {
        return 'STRING';
    }
    throw new Error(`Could not determine type for value: ${value}`);
}
const ALIAS_REGEX = /{([^$]+)\$([^}]+)}/;
export function isCentralAlias(value) {
    if (typeof value !== 'string')
        return false;
    return ALIAS_REGEX.test(value);
}
export function extractAliasParts(value) {
    if (typeof value !== 'string')
        return null;
    const match = ALIAS_REGEX.exec(value);
    if (match) {
        return {
            collection: match[1],
            variable: match[2],
        };
    }
    return null;
}
export function determineResolvedTypeWithAlias(collections, value) {
    const resolvedType = determineResolvedType(value);
    if (resolvedType !== 'STRING')
        return resolvedType;
    const aliasParts = extractAliasParts(value);
    if (aliasParts) {
        const { collection, variable } = aliasParts;
        if (collections[collection]?.[variable]) {
            return collections[collection][variable][SYMBOL_RESOLVED_TYPE];
        }
        return null;
    }
    return resolvedType;
}
export function roundTo(value, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round((value + Number.EPSILON) * factor) / factor;
}
