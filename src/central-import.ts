import { customParse, Color, formatHex8 } from './color.js'
import Config from './Config.js'
import { extractAliasParts } from './utils.js'

type RawPrimitiveValue = string | number | boolean
type RawThemeValue =
  | {
      light: string | number | boolean
      dark: string | number | boolean
      forcedColors: string | number | boolean
    }
  | RawPrimitiveValue

type RawCentralTokens = {
  colors: Record<string, RawPrimitiveValue>
  primitives: Record<string, RawPrimitiveValue>
  theme: Record<string, RawThemeValue>
}

type PrimitiveTokens = { Value: string | number | boolean }
type ThemeTokens = {
  Light: string | number | boolean
  Dark: string | number | boolean
  HCM: string | number | boolean
}

type CentralTokens = {
  Colors: Record<string, PrimitiveTokens>
  Primitives: Record<string, PrimitiveTokens>
  Theme: Record<string, ThemeTokens>
}

type CentralAndRelativeTokens = {
  central: CentralTokens
  relative: Record<string, PrimitiveTokens>
}

export async function getCentralCollectionValues(): Promise<CentralAndRelativeTokens> {
  const result = await downloadFromCentral()
    .then(normalizeNames)
    .then(replaceTextColor)
    .then(filterRelativeUnits)

  return result
}

/**
 * Downloads data from the central source specified in the configuration.
 *
 * @returns {Promise<RawCentralTokens>} A promise that resolves to the raw central tokens.
 */
async function downloadFromCentral() {
  // download each json from from the links in Config.centralSource with Promise.all
  try {
    const [colors, primitives, theme] = await Promise.all([
      fetch(Config.centralSource.colors).then(
        (res) => res.json() as unknown as Record<string, RawPrimitiveValue>,
      ),
      fetch(Config.centralSource.primitives).then(
        (res) => res.json() as unknown as Record<string, RawPrimitiveValue>,
      ),
      fetch(Config.centralSource.theme).then(
        (res) => res.json() as unknown as Record<string, RawPrimitiveValue>,
      ),
    ])
    const rawCentralTokens: RawCentralTokens = {
      colors,
      primitives,
      theme,
    }
    return rawCentralTokens
  } catch (error) {
    throw new Error(
      `Central Import: When downloading from central, the download failed: ${error?.toString()}`,
    )
  }
}

function normalizeNames(rawCentralTokens: RawCentralTokens): CentralTokens {
  const themeTokens: Record<string, ThemeTokens> = Object.entries(
    rawCentralTokens.theme,
  ).reduce(
    (acc, [key, value]) => {
      if (typeof value !== 'object') {
        acc[key] = {
          Light: value,
          Dark: value,
          HCM: value,
        }
        return acc
      }

      const newValue: ThemeTokens = {
        Light: value.light,
        Dark: value.dark,
        HCM: value.forcedColors,
      }

      acc[key] = newValue
      return acc
    },
    {} as Record<string, ThemeTokens>,
  )

  // primitives and relative values just need to be wrapped in an object
  const wrappedPrimitives = Object.fromEntries(
    Object.entries(rawCentralTokens.primitives).map(([key, value]) => [
      key,
      { Value: value },
    ]),
  )
  // primitives and relative values just need to be wrapped in an object
  const wrappedColors = Object.fromEntries(
    Object.entries(rawCentralTokens.colors).map(([key, value]) => [
      key,
      { Value: value },
    ]),
  )

  return {
    Colors: wrappedColors,
    Primitives: wrappedPrimitives,
    Theme: themeTokens,
  }
}

function replaceTextColor(tokens: CentralTokens): CentralTokens {
  const colorMixTf = new ColorMix(tokens, Config.centralCurrentColorAlias)

  const potentiallyFix = (
    value: string,
    mode: 'Light' | 'Dark' | 'HCM' | undefined,
    tokenName: string,
  ) => {
    if (value === 'inherit') {
      return tryResolveInheritance(tokens, tokenName, mode)
    }
    if (value === 'currentColor') {
      return Config.centralCurrentColorAlias
    }
    if ((mode === 'Light' || mode === 'Dark') && colorMixTf.isColorMix(value)) {
      return colorMixTf.replaceColorMix(mode, value)
    }
    return value
  }

  // Iterate over the collections in the tokens object
  for (const collection of Object.values(tokens)) {
    // Iterate over the tokens in each collection
    for (const [tokenName, token] of Object.entries(collection)) {
      // Check if the token is a primitive token
      if ('Value' in token) {
        const primitiveToken = token as PrimitiveTokens
        if (typeof primitiveToken.Value === 'string') {
          const newValue = potentiallyFix(
            primitiveToken.Value,
            undefined,
            tokenName,
          )
          primitiveToken.Value = newValue
        }
      }
      // Check if the token is a theme token
      else if ('Light' in token) {
        const themeToken = token as ThemeTokens
        for (const mode of ['Light', 'Dark', 'HCM'] as const) {
          const value = themeToken[mode]
          if (typeof value === 'string') {
            const newValue = potentiallyFix(value, mode, tokenName)
            themeToken[mode] = newValue
          }
        }
      }
    }
  }

  return tokens
}

function filterRelativeUnits(tokens: CentralTokens): CentralAndRelativeTokens {
  const relativeTokens: Record<string, PrimitiveTokens> = {}
  let newlyAdded = 0

  // do-while newlyAdded > 0
  // iterate over the collections in the tokens object and find tokens that are relative (e.g. "10rem", "5%", etc.)
  // and tokens that depend on relative tokens
  // if we find them, we remove them from the original collection and add them to the relativeTokens collection
  // then we repeat the process until no more relative tokens and those that depend on them are found
  do {
    newlyAdded = 0
    for (const [collectionName, collection] of Object.entries(tokens)) {
      // Iterate over the tokens in each collection
      for (const entry of Object.entries(collection)) {
        const tokenName = entry[0]
        const token = entry[1] as PrimitiveTokens | ThemeTokens
        const isRelative = (value: string) => {
          // first we check if its a reference to another token
          const extracted = extractAliasParts(value)
          if (extracted) {
            return relativeTokens[extracted.variable] !== undefined
          }
          // next check if the value is a relative value
          // check if the value is a number and ends with a unit that is rem, em, %
          if (
            value.endsWith('rem') ||
            value.endsWith('em') ||
            value.endsWith('%')
          ) {
            return true
          }
          return false
        }

        // first check if we have a primitive token or a theme token
        if ('Value' in token && typeof token.Value === 'string') {
          const isRel = isRelative(token.Value)
          if (isRel) {
            // if the token is relative, we can remove it from the original collection
            // and add it to the relativeTokens collection
            newlyAdded++
            delete (
              tokens[collectionName as keyof CentralTokens] as Record<
                string,
                PrimitiveTokens | ThemeTokens
              >
            )[tokenName]
            relativeTokens[tokenName] = token
          }
        } else if ('Light' in token) {
          // Check if the token is a theme token
          const themeToken = token

          for (const mode of ['Light', 'Dark', 'HCM'] as const) {
            const value = themeToken[mode]
            if (typeof value === 'string') {
              const isRel = isRelative(value)
              if (isRel) {
                // throw an error because we're not expecting Theme tokens to be relative
                throw new Error(
                  `Central Import: When filtering relative units, the token ${tokenName} is a theme token and is relative. Which is not expected.`,
                )
              }
            }
          }
        }
      }
    }
  } while (newlyAdded > 0)

  return {
    central: tokens,
    relative: relativeTokens,
  }
}

const COLOR_MIX_REGEX =
  /color-mix\(in srgb, currentColor (\d+)%?, transparent\)/

/**
 * Class to replace color-mix functions with an actual color based on the mode.
 */
class ColorMix {
  token: string
  light: Color
  dark: Color

  /**
   * Creates a new instance of the ColorMix class.
   * @param collection - The collection of colors.
   * @param key - The key to access the colors in the collection.
   * @throws Error if the light or dark color is invalid.
   */
  constructor(collections: CentralTokens, key: string) {
    const lightPrimitive = centralFullResolve(key, 'Light', collections)
    const darkPrimitive = centralFullResolve(key, 'Dark', collections)

    const light = customParse(lightPrimitive)
    const dark = customParse(darkPrimitive)

    if (light === undefined) {
      throw new Error(
        `When initializing ColorMix, the light color is invalid: ${lightPrimitive}`,
      )
    }
    if (dark === undefined) {
      throw new Error(
        `When initializing ColorMix, the dark color is invalid: ${darkPrimitive}`,
      )
    }

    this.token = key
    this.light = light
    this.dark = dark
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
    const baseColor = this[mode === 'Light' ? 'light' : 'dark']
    const newColor = formatHex8({ ...baseColor, alpha: percentage / 100 })

    return newColor
  }
}

/**
 * Attempts to resolve the inheritance of a token by searching through its hierarchical structure.
 *
 * @param tokens - An object containing separated tokens categorized by themes.
 * @param tokenName - The name of the token to resolve, represented as a string with parts separated by '/'.
 * @param mode - The mode of the theme to resolve ('Light', 'Dark', or 'HCM').
 * @returns The resolved token value for the specified mode.
 * @throws Will throw an error if no value is found for the given token name and mode.
 */
function tryResolveInheritance(
  tokens: CentralTokens,
  tokenName: string,
  mode?: 'Light' | 'Dark' | 'HCM',
): string | number | boolean {
  const parts = tokenName.split('/')

  // First pass: keep the last element and pop off the second to last one and then the one before that
  // (so if the token is button/color/ghost/disabled, we will first try button/color/disabled, then button/disabled, etc.)
  // Second pass: current approach of just removing the last and then the last
  // (so if the token is button/color/ghost/disabled, we will first try button/color/ghost, then button/color, etc.)
  const PASSES = 2
  const getKeyFn =
    (pass: number) => (i: number, parts: string[], lastPart: string) => {
      switch (pass) {
        case 1:
          return [...parts.slice(0, i), lastPart].join('/')
        case 2:
          return parts.slice(0, i).join('/')
        default:
          throw new Error('Invalid pass number')
      }
    }
  for (let pass = 1; pass <= PASSES; pass++) {
    const getKey = getKeyFn(pass)
    const lastPart = parts[parts.length - 1]

    for (let i = parts.length - 1; i >= 0; i--) {
      const key = getKey(i, parts, lastPart)

      const current = tokens.Theme[key]
      if (current) {
        // check if object
        if (!('Value' in current)) {
          // When no mode was provided, we probably came from a primitive value, so it seems like a mistake if we resolve to a non-primitive value
          if (!mode) {
            throw new Error(
              `Central Import: When trying to resolve inheritance for primitive ${tokenName}, a non-primitive value was found.`,
            )
          }

          // check if the mode exists
          if (current[mode] !== undefined && current[mode] !== 'inherit') {
            return current[mode]
          }
        } else if (current.Value !== 'inherit') {
          return current.Value as string | number | boolean
        }
      }
    }
  }

  throw new Error(
    `Central Import: When trying to find a replacement for 'inherit' in ${tokenName}, no value was found`,
  )
}
function centralFullResolve(
  key: string,
  mode: 'Light' | 'Dark',
  collections: CentralTokens,
) {
  let value = key

  while (true) {
    const extracted = extractAliasParts(value)
    if (!extracted) {
      return value
    }

    // check if the collection exists
    const collection = collections[extracted.collection as keyof CentralTokens]
    if (!collection) {
      throw new Error(
        `Central Import: When resolving '${key}', the collection '${extracted.collection}' does not exist`,
      )
    }
    // check if the variable exists
    const variable = collection[extracted.variable]
    if (!variable) {
      throw new Error(
        `Central Import: When resolving '${key}', the variable '${extracted.variable}' does not exist in collection '${extracted.collection}'`,
      )
    }
    // for objects, check if the mode exists
    if (!('Value' in variable)) {
      if (!variable[mode]) {
        throw new Error(
          `Central Import: When resolving '${key}', the mode '${mode}' does not exist in variable '${extracted.variable}'`,
        )
      }
      value = variable[mode] as string
    } else {
      value = variable.Value as string
    }
  }
}
