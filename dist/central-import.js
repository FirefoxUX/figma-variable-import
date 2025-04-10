import { customParse, formatHex8 } from './color.js';
import Config from './Config.js';
const HCM_KEYS = [
    'ActiveText',
    'ButtonBorder',
    'ButtonFace',
    'ButtonText',
    'Canvas',
    'CanvasText',
    'Field',
    'FieldText',
    'GrayText',
    'Highlight',
    'HighlightText',
    'LinkText',
    'Mark',
    'MarkText',
    'SelectedItem',
    'SelectedItemText',
    'AccentColor',
    'AccentColorText',
    'VisitedText',
];
export async function getCentralCollectionValues() {
    const x = await downloadFromCentral()
        .then(separateCentralTokens)
        .then(replaceTextColor)
        .then(replaceVariableReferences);
    return x;
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
        for (const mode of ['Light', 'Dark', 'HCM']) {
            const color = value[mode];
            if (color === 'inherit') {
                tokens.Theme[key][mode] = tryResolveInheritance(tokens, key, mode);
            }
            if (colorMixTf.isColorMix(color) && mode !== 'HCM') {
                tokens.Theme[key][mode] = colorMixTf.replaceColorMix(mode, color);
            }
        }
    }
    return tokens;
}
function replaceVariableReferences(tokens) {
    const primitiveLookupMap = new Map();
    for (const [key, value] of Object.entries(tokens.Primitives)) {
        const parsedColor = customParse(value.Value);
        if (parsedColor === undefined) {
            continue;
        }
        primitiveLookupMap.set(formatHex8(parsedColor), key);
    }
    for (const [key, value] of Object.entries(tokens.Theme)) {
        for (const mode of ['Light', 'Dark', 'HCM']) {
            const color = value[mode];
            if (mode === 'HCM' && HCM_KEYS.includes(color)) {
                tokens.Theme[key][mode] = `{HCM Theme$${color}}`;
            }
            else if (mode === 'HCM' && color === 'inherit') {
                if (value.Light !== value.Dark) {
                    throw new Error(`Ambiguous inherit: When replacing variable references, the color for '${key}' is 'inherit', but the light and dark colors are different: ${value.Light} and ${value.Dark}`);
                }
                tokens.Theme[key][mode] = value.Light;
            }
            else {
                const parsedCurrentColor = customParse(color);
                if (parsedCurrentColor === undefined) {
                    continue;
                }
                const refVariable = primitiveLookupMap.get(formatHex8(parsedCurrentColor));
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
        const light = customParse(colors.Light);
        const dark = customParse(colors.Dark);
        if (light === undefined) {
            throw new Error(`When initializing ColorMix, the light color is invalid: ${colors.Light}`);
        }
        if (dark === undefined) {
            throw new Error(`When initializing ColorMix, the dark color is invalid: ${colors.Dark}`);
        }
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
    const lastPart = parts[parts.length - 1];
    for (let i = parts.length - 2; i >= 0; i--) {
        const key = [...parts.slice(0, i), lastPart].join('/');
        if (tokens.Theme[key] && tokens.Theme[key][mode] !== 'inherit') {
            return tokens.Theme[key][mode];
        }
    }
    for (let i = parts.length - 1; i > 0; i--) {
        const key = parts.slice(0, i).join('/');
        if (tokens.Theme[key] && tokens.Theme[key][mode] !== 'inherit') {
            return tokens.Theme[key][mode];
        }
    }
    throw new Error(`Central Import: When trying to find a replacement for 'inherit' in ${tokenName}, no value was found`);
}
