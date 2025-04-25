import { customParse, formatHex8 } from './color.js';
import Config from './Config.js';
import { extractAliasParts } from './utils.js';
export async function getCentralCollectionValues() {
    const result = await downloadFromCentral()
        .then(normalizeNames)
        .then(replaceTextColor)
        .then(filterRelativeUnits);
    return result;
}
async function downloadFromCentral() {
    try {
        const [colors, primitives, theme] = await Promise.all([
            fetch(Config.centralSource.colors).then((res) => res.json()),
            fetch(Config.centralSource.primitives).then((res) => res.json()),
            fetch(Config.centralSource.theme).then((res) => res.json()),
        ]);
        const rawCentralTokens = {
            colors,
            primitives,
            theme,
        };
        return rawCentralTokens;
    }
    catch (error) {
        throw new Error(`Central Import: When downloading from central, the download failed: ${error?.toString()}`);
    }
}
function normalizeNames(rawCentralTokens) {
    const themeTokens = Object.entries(rawCentralTokens.theme).reduce((acc, [key, value]) => {
        if (typeof value !== 'object') {
            acc[key] = {
                Light: value,
                Dark: value,
                HCM: value,
            };
            return acc;
        }
        const newValue = {
            Light: value.light,
            Dark: value.dark,
            HCM: value.forcedColors,
        };
        acc[key] = newValue;
        return acc;
    }, {});
    const wrappedPrimitives = Object.fromEntries(Object.entries(rawCentralTokens.primitives).map(([key, value]) => [
        key,
        { Value: value },
    ]));
    const wrappedColors = Object.fromEntries(Object.entries(rawCentralTokens.colors).map(([key, value]) => [
        key,
        { Value: value },
    ]));
    return {
        Colors: wrappedColors,
        Primitives: wrappedPrimitives,
        Theme: themeTokens,
    };
}
function replaceTextColor(tokens) {
    const colorMixTf = new ColorMix(tokens, Config.centralCurrentColorAlias);
    const potentiallyFix = (value, mode, tokenName) => {
        if (value === 'inherit') {
            return tryResolveInheritance(tokens, tokenName, mode);
        }
        if (value === 'currentColor') {
            return Config.centralCurrentColorAlias;
        }
        if ((mode === 'Light' || mode === 'Dark') && colorMixTf.isColorMix(value)) {
            return colorMixTf.replaceColorMix(mode, value);
        }
        return value;
    };
    for (const collection of Object.values(tokens)) {
        for (const [tokenName, token] of Object.entries(collection)) {
            if ('Value' in token) {
                const primitiveToken = token;
                if (typeof primitiveToken.Value === 'string') {
                    const newValue = potentiallyFix(primitiveToken.Value, undefined, tokenName);
                    primitiveToken.Value = newValue;
                }
            }
            else if ('Light' in token) {
                const themeToken = token;
                for (const mode of ['Light', 'Dark', 'HCM']) {
                    const value = themeToken[mode];
                    if (typeof value === 'string') {
                        const newValue = potentiallyFix(value, mode, tokenName);
                        themeToken[mode] = newValue;
                    }
                }
            }
        }
    }
    return tokens;
}
function filterRelativeUnits(tokens) {
    const relativeTokens = {};
    let newlyAdded = 0;
    do {
        newlyAdded = 0;
        for (const [collectionName, collection] of Object.entries(tokens)) {
            for (const entry of Object.entries(collection)) {
                const tokenName = entry[0];
                const token = entry[1];
                const isRelative = (value) => {
                    const extracted = extractAliasParts(value);
                    if (extracted) {
                        return relativeTokens[extracted.variable] !== undefined;
                    }
                    if (value.endsWith('rem') ||
                        value.endsWith('em') ||
                        value.endsWith('%')) {
                        return true;
                    }
                    return false;
                };
                if ('Value' in token && typeof token.Value === 'string') {
                    const isRel = isRelative(token.Value);
                    if (isRel) {
                        newlyAdded++;
                        delete tokens[collectionName][tokenName];
                        relativeTokens[tokenName] = token;
                    }
                }
                else if ('Light' in token) {
                    const themeToken = token;
                    for (const mode of ['Light', 'Dark', 'HCM']) {
                        const value = themeToken[mode];
                        if (typeof value === 'string') {
                            const isRel = isRelative(value);
                            if (isRel) {
                                throw new Error(`Central Import: When filtering relative units, the token ${tokenName} is a theme token and is relative. Which is not expected.`);
                            }
                        }
                    }
                }
            }
        }
    } while (newlyAdded > 0);
    return {
        central: tokens,
        relative: relativeTokens,
    };
}
const COLOR_MIX_REGEX = /color-mix\(in srgb, currentColor (\d+)%?, transparent\)/;
class ColorMix {
    token;
    light;
    dark;
    constructor(collections, key) {
        const lightPrimitive = centralFullResolve(key, 'Light', collections);
        const darkPrimitive = centralFullResolve(key, 'Dark', collections);
        const light = customParse(lightPrimitive);
        const dark = customParse(darkPrimitive);
        if (light === undefined) {
            throw new Error(`When initializing ColorMix, the light color is invalid: ${lightPrimitive}`);
        }
        if (dark === undefined) {
            throw new Error(`When initializing ColorMix, the dark color is invalid: ${darkPrimitive}`);
        }
        this.token = key;
        this.light = light;
        this.dark = dark;
    }
    isColorMix(str) {
        return COLOR_MIX_REGEX.test(str);
    }
    replaceColorMix(mode, str) {
        const match = str.match(COLOR_MIX_REGEX);
        if (!match) {
            throw new Error(`When replacing color mix, the color mix is invalid: ${str}`);
        }
        const percentage = parseInt(match[1]);
        const baseColor = this[mode === 'Light' ? 'light' : 'dark'];
        const newColor = formatHex8({ ...baseColor, alpha: percentage / 100 });
        return newColor;
    }
}
function tryResolveInheritance(tokens, tokenName, mode) {
    const parts = tokenName.split('/');
    const PASSES = 2;
    const getKeyFn = (pass) => (i, parts, lastPart) => {
        switch (pass) {
            case 1:
                return [...parts.slice(0, i), lastPart].join('/');
            case 2:
                return parts.slice(0, i).join('/');
            default:
                throw new Error('Invalid pass number');
        }
    };
    for (let pass = 1; pass <= PASSES; pass++) {
        const getKey = getKeyFn(pass);
        const lastPart = parts[parts.length - 1];
        for (let i = parts.length - 1; i >= 0; i--) {
            const key = getKey(i, parts, lastPart);
            const current = tokens.Theme[key];
            if (current) {
                if (!('Value' in current)) {
                    if (!mode) {
                        throw new Error(`Central Import: When trying to resolve inheritance for primitive ${tokenName}, a non-primitive value was found.`);
                    }
                    if (current[mode] !== undefined && current[mode] !== 'inherit') {
                        return current[mode];
                    }
                }
                else if (current.Value !== 'inherit') {
                    return current.Value;
                }
            }
        }
    }
    throw new Error(`Central Import: When trying to find a replacement for 'inherit' in ${tokenName}, no value was found`);
}
function centralFullResolve(key, mode, collections) {
    let value = key;
    while (true) {
        const extracted = extractAliasParts(value);
        if (!extracted) {
            return value;
        }
        const collection = collections[extracted.collection];
        if (!collection) {
            throw new Error(`Central Import: When resolving '${key}', the collection '${extracted.collection}' does not exist`);
        }
        const variable = collection[extracted.variable];
        if (!variable) {
            throw new Error(`Central Import: When resolving '${key}', the variable '${extracted.variable}' does not exist in collection '${extracted.collection}'`);
        }
        if (!('Value' in variable)) {
            if (!variable[mode]) {
                throw new Error(`Central Import: When resolving '${key}', the mode '${mode}' does not exist in variable '${extracted.variable}'`);
            }
            value = variable[mode];
        }
        else {
            value = variable.Value;
        }
    }
}
