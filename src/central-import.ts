import Config from './Config.js'
import tinycolor from 'tinycolor2'

type RawThemeTokens = { light: string; dark: string; forcedColors: string }
type RawCentralTokens = {
  [key: string]: string | RawThemeTokens
}

type ThemeTokens = { Light: string; Dark: string; HCM: string }
type PrimitiveTokens = { Value: string | number | boolean }
type SeparatedTokens = {
  Theme: { [key: string]: ThemeTokens }
  Primitives: { [key: string]: PrimitiveTokens }
}

export async function getCentralCollectionValues() {
  return downloadFromCentral()
    .then(separateCentralTokens)
    .then(replaceTextColor)
    .then(replaceVariableReferences)
}

/**
 * Downloads data from the central source specified in the configuration.
 *
 * @returns {Promise<RawCentralTokens>} A promise that resolves to the raw central tokens.
 */
async function downloadFromCentral() {
  return (await fetch(Config.centralSource).then((res) =>
    res.json(),
  )) as RawCentralTokens
}

/**
 * Separates raw central tokens into seperate theme and primitive objects.
 * Both get normalized to the mode names expected by Figma.
 * Also applies any value overrides specified in the configuration.
 *
 * @param rawCentralTokens - The raw central tokens to be separated.
 * @returns An object containing separated tokens categorized into primitives and theme tokens.
 *
 * @throws Will throw an error if the value type of a token is unknown.
 */
function separateCentralTokens(
  rawCentralTokens: RawCentralTokens,
): SeparatedTokens {
  return Object.entries(rawCentralTokens).reduce(
    (acc, [key, value]) => {
      if (typeof value === 'string') {
        acc.Primitives[key] = {
          Value: Config.potentiallyOverride(key) || value,
        }
      } else if (
        'light' in value &&
        'dark' in value &&
        'forcedColors' in value
      ) {
        acc.Theme[key] = {
          Light: Config.potentiallyOverride(key, 'light') || value.light,
          Dark: Config.potentiallyOverride(key, 'dark') || value.dark,
          HCM:
            Config.potentiallyOverride(key, 'forcedColors') ||
            value.forcedColors,
        }
      } else {
        throw new Error(
          `When separating central tokens, the value type of token '${key}' is unknown: ${JSON.stringify(value)}`,
        )
      }

      return acc
    },
    { Primitives: {}, Theme: {} } as SeparatedTokens,
  )
}

/**
 * Replaces color-mixes that mix with currentColor with the actual color from the variables.
 *
 * @param tokens - The tokens containing theme information to be processed.
 * @returns The updated tokens with replaced text colors.
 */
function replaceTextColor(tokens: SeparatedTokens): SeparatedTokens {
  const colorMixTf = new ColorMix(tokens.Theme, Config.centralCurrentColorAlias)
  for (const [key, value] of Object.entries(tokens.Theme)) {
    for (const mode of ['Light', 'Dark'] as const) {
      const color = value[mode]
      if (colorMixTf.isColorMix(color)) {
        tokens.Theme[key][mode] = colorMixTf.replaceColorMix(mode, color)
      }
    }
  }
  return tokens
}

/**
 * Replaces variable references in the provided tokens object.
 *
 * This function iterates over all theme tokens and replaces color values with corresponding aliases.
 * For Light and Dark modes, it looks for a corresponding color in the primitives and replaces the color
 * with an alias in the format `{Primitives$path/to/color}`. For HCM mode, it replaces the name with
 * `{HCM Theme$hcmtoken}`.
 *
 * To optimize performance, a map of all primitive colors is created initially.
 *
 * @param tokens - The tokens object containing theme and primitive color definitions.
 * @returns The modified tokens object with replaced variable references.
 */
function replaceVariableReferences(tokens: SeparatedTokens): SeparatedTokens {
  const primitiveLookupMap = new Map<string, string>()
  for (const [key, value] of Object.entries(tokens.Primitives)) {
    const tinyCurrentColor = tinycolor(value.Value as string)
    // skip if it does not contain a color
    if (!tinyCurrentColor.isValid()) {
      continue
    }
    primitiveLookupMap.set(tinyCurrentColor.toHex8String(), key)
  }

  for (const [key, value] of Object.entries(tokens.Theme)) {
    for (const mode of ['Light', 'Dark', 'HCM'] as const) {
      const color = value[mode]
      if (mode === 'HCM') {
        tokens.Theme[key][mode] = `{HCM Theme$${color}}`
      } else {
        const tinyCurrentColor = tinycolor(color)
        // we only do this for colors, under the assumptions that colors are unique
        if (!tinyCurrentColor.isValid()) {
          continue
        }
        // look up the color in the map
        const refVariable = primitiveLookupMap.get(
          tinyCurrentColor.toHex8String(),
        )
        if (refVariable) {
          tokens.Theme[key][mode] = `{Primitives$${refVariable}}`
        }
      }
    }
  }

  return tokens
}

const COLOR_MIX_REGEX =
  /color-mix\(in srgb, currentColor (\d+)%?, transparent\)/

/**
 * Class to replace color-mix functions with an actual color based on the mode.
 */
class ColorMix {
  light: tinycolor.Instance
  dark: tinycolor.Instance

  /**
   * Creates a new instance of the ColorMix class.
   * @param collection - The collection of colors.
   * @param key - The key to access the colors in the collection.
   * @throws Error if the light or dark color is invalid.
   */
  constructor(collection: SeparatedTokens['Theme'], key: string) {
    const colors = collection[key]
    this.light = tinycolor(colors.Light)
    this.dark = tinycolor(colors.Dark)

    if (!this.light.isValid()) {
      throw new Error(
        `When initializing ColorMix, the light color is invalid: ${colors.Light}`,
      )
    }
    if (!this.dark.isValid()) {
      throw new Error(
        `When initializing ColorMix, the dark color is invalid: ${colors.Dark}`,
      )
    }
  }

  /**
   * Checks if a string represents a color mix.
   * @param str - The string to check.
   * @returns True if the string represents a color mix, false otherwise.
   */
  isColorMix(str: string) {
    return COLOR_MIX_REGEX.test(str)
  }

  /**
   * Replaces a color mix with a new color based on the mode.
   * @param mode - The mode ('Light' or 'Dark') to determine which color to use.
   * @param str - The string representing the color mix.
   * @returns The new color as a hex8 string.
   * @throws Error if the color mix is invalid.
   */
  replaceColorMix(mode: 'Light' | 'Dark', str: string) {
    const match = str.match(COLOR_MIX_REGEX)

    if (!match) {
      throw new Error(
        `When replacing color mix, the color mix is invalid: ${str}`,
      )
    }

    const percentage = parseInt(match[1])
    const newColor = this[mode === 'Light' ? 'light' : 'dark']
      .clone()
      .setAlpha(percentage / 100)
      .toHex8String()

    return newColor
  }
}
