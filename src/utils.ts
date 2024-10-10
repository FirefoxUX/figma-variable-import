import { RGBA, VariableAlias, VariableCreate } from '@figma/rest-api-spec'
import tinycolor from 'tinycolor2'
import { TypedCentralCollections } from './types.js'
import Config from './Config.js'

const FIGMA_API_ENDPOINT = 'https://api.figma.com'

export const FigmaAPIURLs = {
  getVariables: (fileId: string) =>
    `${FIGMA_API_ENDPOINT}/v1/files/${fileId}/variables/local`,
  postVariables: (fileId: string) =>
    `${FIGMA_API_ENDPOINT}/v1/files/${fileId}/variables`,
}

export async function fetchFigmaAPI<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = {
    'X-FIGMA-TOKEN': Config.figmaAccessToken,
    ...options.headers,
  }

  const finalOptions: RequestInit = {
    ...options,
    headers,
  }

  try {
    const response = await fetch(url, finalOptions)
    const data = await response.json()
    if (data.error === true) {
      throw new Error(
        `When fetching Figma API, an error occurred: ${data.message}`,
      )
    }

    return data as T
  } catch (error) {
    console.error('Error fetching Figma API:', error)
    throw error
  }
}

export function roundTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function isFigmaAlias(
  value: string | number | boolean | RGBA | VariableAlias | undefined,
): value is VariableAlias {
  return value !== undefined && typeof value === 'object' && 'type' in value
}

// Figm expects values between 0 and 1
export function normalizeRGBA(rgba: RGBA) {
  return {
    r: rgba.r / 255,
    g: rgba.g / 255,
    b: rgba.b / 255,
    a: roundTwoDecimals(rgba.a),
  }
}

// tinycolors2 expects values between 0 and 255
export function denormalizeRGBA(rgba: RGBA) {
  return {
    r: Math.floor(rgba.r * 255),
    g: Math.floor(rgba.g * 255),
    b: Math.floor(rgba.b * 255),
    a: rgba.a,
  }
}

// create a symbol as they key for the resovled type
export const SYMBOL_RESOLVED_TYPE = Symbol('resolvedType')

// 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR'
export function determineResolvedType(
  value: string | number | boolean,
): VariableCreate['resolvedType'] {
  // check if it's a boolean
  if (typeof value === 'boolean') {
    return 'BOOLEAN'
  }
  // then check if it's a number
  if (!isNaN(Number(value))) {
    return 'FLOAT'
  }
  // then check if it's a color
  if (tinycolor(value as string).isValid()) {
    return 'COLOR'
  }
  // otherwise, check if its a string
  if (typeof value === 'string') {
    return 'STRING'
  }
  // if none of the above, throw an error
  throw new Error(`Could not determine type for value: ${value}`)
}

const ALIAS_REGEX = /{([^$]+)\$([^}]+)}/

export function isCentralAlias(value: string | number | boolean): boolean {
  if (typeof value !== 'string') return false
  return ALIAS_REGEX.test(value)
}

export function extractAliasParts(
  value: string | number | boolean,
): { collection: string; variable: string } | null {
  if (typeof value !== 'string') return null
  const match = ALIAS_REGEX.exec(value)
  if (match) {
    return {
      collection: match[1],
      variable: match[2],
    }
  }
  return null
}

export function determineResolvedTypeWithAlias(
  collections: TypedCentralCollections,
  value: string | number | boolean,
): VariableCreate['resolvedType'] | null {
  const resolvedType = determineResolvedType(value)
  if (resolvedType !== 'STRING') return resolvedType

  const aliasParts = extractAliasParts(value as string)
  if (aliasParts) {
    const { collection, variable } = aliasParts
    if (collections[collection]?.[variable]) {
      return collections[collection][variable][SYMBOL_RESOLVED_TYPE]
    }
    return null
  }

  return resolvedType
}

export function roundTo(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals)
  return Math.round((value + Number.EPSILON) * factor) / factor
}
