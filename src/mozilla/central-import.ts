import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { customParse, Color, formatHex8 } from '../core/color.js'
import { THEME_MAP } from './imports.js'
import { extractVdReference } from '../core/vd.js'

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
  components: Record<string, RawPrimitiveValue>
  theme: Record<string, RawThemeValue>
}

type PrimitiveTokens = { Value: string | number | boolean }
type ThemeTokens = {
  Light: string | number | boolean
  Dark: string | number | boolean
  HCM: string | number | boolean
}

export type CentralTokens = {
  Colors: Record<string, PrimitiveTokens>
  Primitives: Record<string, PrimitiveTokens>
  Components: Record<string, PrimitiveTokens>
  Theme: Record<string, ThemeTokens>
}

type CentralAndRelativeTokens = {
  central: CentralTokens
  relative: Record<string, PrimitiveTokens>
}

type CentralSourceConfig = {
  colors: string
  primitives: string
  components: string
  theme: string
}

async function fetchJson<T>(url: string): Promise<T> {
  if (url.startsWith('file://')) {
    const buf = await readFile(fileURLToPath(url), 'utf8')
    return JSON.parse(buf) as T
  }
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`)
  }
  return (await res.json()) as T
}

export async function getCentralCollectionValues(
  centralSource: CentralSourceConfig,
  centralCurrentColorAlias: string,
): Promise<CentralAndRelativeTokens> {
  const result = await downloadFromCentral(centralSource)
    .then(normalizeNames)
    .then(mergeStaticTokens)
    .then((tokens) => replaceTextColor(tokens, centralCurrentColorAlias))
    .then(filterRelativeUnits)

  return result
}

/**
 * Downloads data from the central source specified in the configuration.
 *
 * @returns {Promise<RawCentralTokens>} A promise that resolves to the raw central tokens.
 */
async function downloadFromCentral(centralSource: CentralSourceConfig) {
  // download each json from the links in centralSource with Promise.all.
  // Both https:// and file:// URLs are supported via fetchJson.
  try {
    const [colors, primitives, components, theme] = await Promise.all([
      fetchJson<Record<string, RawPrimitiveValue>>(centralSource.colors),
      fetchJson<Record<string, RawPrimitiveValue>>(centralSource.primitives),
      fetchJson<Record<string, RawPrimitiveValue>>(centralSource.components),
      fetchJson<Record<string, RawThemeValue>>(centralSource.theme),
    ])
    const rawCentralTokens: RawCentralTokens = {
      colors,
      primitives,
      components,
      theme,
    }
    return rawCentralTokens
  } catch (error) {
    throw new Error(
      `Central Import: When downloading from central, the download failed: ${error?.toString()}`,
      { cause: error },
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

  // primitives, components and color values just need to be wrapped in an object
  const wrapPrimitiveMap = (m: Record<string, RawPrimitiveValue>) =>
    Object.fromEntries(
      Object.entries(m).map(([key, value]) => [key, { Value: value }]),
    )
  const wrappedPrimitives = wrapPrimitiveMap(rawCentralTokens.primitives)
  const wrappedComponents = wrapPrimitiveMap(rawCentralTokens.components)
  const wrappedColors = wrapPrimitiveMap(rawCentralTokens.colors)

  return {
    Colors: wrappedColors,
    Primitives: wrappedPrimitives,
    Components: wrappedComponents,
    Theme: themeTokens,
  }
}

function replaceTextColor(
  tokens: CentralTokens,
  centralCurrentColorAlias: string,
): CentralTokens {
  const colorMixTf = new ColorMix(tokens, centralCurrentColorAlias)

  const potentiallyFix = (
    value: string,
    mode: 'Light' | 'Dark' | 'HCM' | undefined,
    tokenName: string,
  ) => {
    if (value === 'inherit') {
      return tryResolveInheritance(
        tokens,
        tokenName,
        mode,
        centralCurrentColorAlias,
      )
    }
    if (value === 'currentColor') {
      return centralCurrentColorAlias
    }
    if (colorMixTf.isColorMix(value)) {
      if (mode === 'Light' || mode === 'Dark') {
        return colorMixTf.replaceColorMix(mode, value)
      }
      throw new Error(
        `Token '${tokenName}': color-mix '${value}' is not supported in mode '${mode}'. ` +
          `currentColor requires Light or Dark mode context — if this is a primitive (modeless) token, ` +
          `it must be promoted to a theme token (mode-shaped object with light/dark keys) in the Firefox source.`,
      )
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

function mergeStaticTokens(tokens: CentralTokens): CentralTokens {
  return {
    ...tokens,
    Theme: {
      ...THEME_MAP,
      ...tokens.Theme,
    },
  }
}

function filterRelativeUnits(tokens: CentralTokens): CentralAndRelativeTokens {
  const relativeTokens: Record<string, PrimitiveTokens> = {}
  let newlyAdded: number

  do {
    newlyAdded = 0
    for (const [collectionName, collection] of Object.entries(tokens)) {
      for (const entry of Object.entries(collection)) {
        const tokenName = entry[0]
        const token = entry[1] as PrimitiveTokens | ThemeTokens
        const isRelative = (value: string) => {
          // Treat as relative only if the value is a *clean* single reference
          // (e.g. "{Primitives$space/xsmall}"). CSS shorthands like
          // "{Primitives$space/xsmall} {Primitives$space/large}" are not eligible —
          // they don't translate to a single Figma variable value.
          const cleanReference = /^\{[^$]+\$[^}]+\}$/.test(value)
          if (cleanReference) {
            const extracted = extractVdReference(value)
            return (
              extracted !== null &&
              relativeTokens[extracted.variable] !== undefined
            )
          }
          if (
            value.endsWith('rem') ||
            value.endsWith('em') ||
            value.endsWith('%')
          ) {
            return true
          }
          // calc() expressions that contain em/rem (or reference relative
          // tokens) are evaluated per OS / surface by relative-transform.
          if (value.startsWith('calc(')) {
            if (/[\d.]+r?em\b/.test(value)) return true
            const refs = value.match(/\{[^$]+\$([^}]+)\}/g) || []
            return refs.some((r) => {
              const ext = extractVdReference(r)
              return ext !== null && relativeTokens[ext.variable] !== undefined
            })
          }
          return false
        }

        if ('Value' in token && typeof token.Value === 'string') {
          const isRel = isRelative(token.Value)
          if (isRel) {
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
          const themeToken = token

          for (const mode of ['Light', 'Dark', 'HCM'] as const) {
            const value = themeToken[mode]
            if (typeof value === 'string') {
              const isRel = isRelative(value)
              if (isRel) {
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

// Accepts color-mix in any of the common interpolation color spaces. Since the
// second color is `transparent`, the interpolation space doesn't affect the
// result — we always get currentColor at N% alpha — so we don't need separate
// math per space.
const COLOR_MIX_REGEX =
  /color-mix\(in (?:srgb|lch|oklch|hsl|oklab|lab|display-p3), currentColor (\d+)%?, transparent\)/

/**
 * Class to replace color-mix functions with an actual color based on the mode.
 */
class ColorMix {
  token: string
  light: Color
  dark: Color

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

  isColorMix(str: string) {
    return COLOR_MIX_REGEX.test(str)
  }

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

function tryResolveInheritance(
  tokens: CentralTokens,
  tokenName: string,
  mode: 'Light' | 'Dark' | 'HCM' | undefined,
  fallback: string,
): string | number | boolean {
  const parts = tokenName.split('/')

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
        if (!('Value' in current)) {
          if (!mode) {
            // Primitive context found a multi-mode theme parent — can't pick
            // a single value. Fall back to the text-color alias (matches CSS
            // semantics: `inherit` ≈ surrounding text color).
            return fallback
          }

          if (current[mode] !== undefined && current[mode] !== 'inherit') {
            return current[mode]
          }
        } else if (current.Value !== 'inherit') {
          return current.Value as string | number | boolean
        }
      }
    }
  }

  // Path-walk exhausted without finding a concrete parent value. The CSS
  // semantics of `inherit` are "use whatever the parent context provides" —
  // for our purposes that's the central text-color alias.
  return fallback
}
function centralFullResolve(
  key: string,
  mode: 'Light' | 'Dark',
  collections: CentralTokens,
) {
  let value = key

  while (true) {
    const extracted = extractVdReference(value)
    if (!extracted) {
      return value
    }

    const collection = collections[extracted.collection as keyof CentralTokens]
    if (!collection) {
      throw new Error(
        `Central Import: When resolving '${key}', the collection '${extracted.collection}' does not exist`,
      )
    }
    const variable = collection[extracted.variable]
    if (!variable) {
      throw new Error(
        `Central Import: When resolving '${key}', the variable '${extracted.variable}' does not exist in collection '${extracted.collection}'`,
      )
    }
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
