import Config from './Config.js';
import tinycolor from 'tinycolor2';
export async function getCentralCollectionValues() {
    return downloadFromCentral()
        .then(separateCentralTokens)
        .then(replaceTextColor)
        .then(replaceVariableReferences);
}
async function downloadFromCentral() {
    return (await fetch(Config.centralSource).then((res) => res.json()));
}
function separateCentralTokens(rawCentralTokens) {
    return Object.entries(rawCentralTokens).reduce((acc, [key, value]) => {
        if (typeof value === 'string') {
            acc.Primitives[key] = {
                Value: Config.potentiallyOverride(key) || value,
            };
        }
        else if ('light' in value &&
            'dark' in value &&
            'forcedColors' in value) {
            acc.Theme[key] = {
                Light: Config.potentiallyOverride(key, 'light') || value.light,
                Dark: Config.potentiallyOverride(key, 'dark') || value.dark,
                HCM: Config.potentiallyOverride(key, 'forcedColors') ||
                    value.forcedColors,
            };
        }
        else {
            throw new Error(`When separating central tokens, the value type of token '${key}' is unknown: ${JSON.stringify(value)}`);
        }
        return acc;
    }, { Primitives: {}, Theme: {} });
}
function replaceTextColor(tokens) {
    const colorMixTf = new ColorMix(tokens.Theme, Config.centralCurrentColorAlias);
    for (const [key, value] of Object.entries(tokens.Theme)) {
        for (const mode of ['Light', 'Dark']) {
            const color = value[mode];
            if (colorMixTf.isColorMix(color)) {
                tokens.Theme[key][mode] = colorMixTf.replaceColorMix(mode, color);
            }
        }
    }
    return tokens;
}
function replaceVariableReferences(tokens) {
    const primitiveLookupMap = new Map();
    for (const [key, value] of Object.entries(tokens.Primitives)) {
        const tinyCurrentColor = tinycolor(value.Value);
        if (!tinyCurrentColor.isValid()) {
            continue;
        }
        primitiveLookupMap.set(tinyCurrentColor.toHex8String(), key);
    }
    for (const [key, value] of Object.entries(tokens.Theme)) {
        for (const mode of ['Light', 'Dark', 'HCM']) {
            const color = value[mode];
            if (mode === 'HCM') {
                tokens.Theme[key][mode] = `{HCM Theme$${color}}`;
            }
            else {
                const tinyCurrentColor = tinycolor(color);
                if (!tinyCurrentColor.isValid()) {
                    continue;
                }
                const refVariable = primitiveLookupMap.get(tinyCurrentColor.toHex8String());
                if (refVariable) {
                    tokens.Theme[key][mode] = `{Primitives$${refVariable}}`;
                }
            }
        }
    }
    return tokens;
}
const COLOR_MIX_REGEX = /color-mix\(in srgb, currentColor (\d+)%?, transparent\)/;
class ColorMix {
    light;
    dark;
    constructor(collection, key) {
        const colors = collection[key];
        this.light = tinycolor(colors.Light);
        this.dark = tinycolor(colors.Dark);
        if (!this.light.isValid()) {
            throw new Error(`When initializing ColorMix, the light color is invalid: ${colors.Light}`);
        }
        if (!this.dark.isValid()) {
            throw new Error(`When initializing ColorMix, the dark color is invalid: ${colors.Dark}`);
        }
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
        const newColor = this[mode === 'Light' ? 'light' : 'dark']
            .clone()
            .setAlpha(percentage / 100)
            .toHex8String();
        return newColor;
    }
}
