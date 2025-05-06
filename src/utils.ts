import { RGBA, VariableAlias, VariableCreate } from '@figma/rest-api-spec'
import {
  FigmaCollection,
  FigmaCollections,
  FigmaResponseWrapper,
  FigmaResultCollection,
  TypedCentralCollections,
} from './types.js'
import Config from './Config.js'
import { Color, customParse, formatHex8, type Rgb } from './color.js'
import { createHash } from 'crypto'

const FIGMA_API_ENDPOINT = 'https://api.figma.com'

export const FigmaAPIURLs = {
  getLocalVariables: (fileId: string) =>
    `${FIGMA_API_ENDPOINT}/v1/files/${fileId}/variables/local`,
  getPublishedVariables: (fileId: string) =>
    `${FIGMA_API_ENDPOINT}/v1/files/${fileId}/variables/published`,
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
    const data = (await response.json()) as FigmaResponseWrapper<T>
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

// Figma expects values between 0 and 1
export function culoriToFigma(rgba: Rgb): RGBA {
  return {
    r: rgba.r,
    g: rgba.g,
    b: rgba.b,
    a: rgba.alpha ?? 1,
  }
}

// culori expects values between 0 and 255
export function figmaToCulori(rgba: unknown): Rgb | undefined {
  if (
    rgba === null ||
    rgba === undefined ||
    typeof rgba !== 'object' ||
    !('r' in rgba) ||
    !('g' in rgba) ||
    !('b' in rgba) ||
    !('a' in rgba) ||
    typeof rgba.r !== 'number' ||
    typeof rgba.g !== 'number' ||
    typeof rgba.b !== 'number' ||
    typeof rgba.a !== 'number'
  ) {
    return undefined
  }
  return {
    mode: 'rgb',
    r: rgba.r,
    g: rgba.g,
    b: rgba.b,
    alpha: rgba.a,
  }
}

export function compareColors(a: Color, b: Color): boolean {
  return formatHex8(a) === formatHex8(b)
}

// create a symbol as they key for the resovled type
export const SYMBOL_RESOLVED_TYPE = Symbol('resolvedType')

// 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR'
export function determineResolvedType(
  value: string | number | boolean | Rgb,
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
  if (customParse(value as string) !== undefined) {
    return 'COLOR'
  }
  // otherwise, check if its a string
  if (typeof value === 'string') {
    return 'STRING'
  }
  // if none of the above, throw an error
  throw new Error(
    `Could not determine type for value: ${JSON.stringify(value)}`,
  )
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
  value: string | number | boolean | Rgb,
  fileVariables?: FigmaResultCollection,
): VariableCreate['resolvedType'] | null {
  const resolvedType = determineResolvedType(value)
  if (resolvedType !== 'STRING') return resolvedType

  const aliasParts = extractAliasParts(value as string)
  if (aliasParts) {
    const { collection, variable } = aliasParts
    if (collections[collection]?.[variable]) {
      return collections[collection][variable][SYMBOL_RESOLVED_TYPE]
    }
    if (fileVariables && fileVariables[collection]) {
      const variableData = fileVariables[collection][variable]
      if (variableData && 'id' in variableData) {
        const type = variableData.resolvedDataType
        if (type) {
          return type
        }
      }
    }
    return null
  }

  return resolvedType
}

export function roundTo(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals)
  return Math.round((value + Number.EPSILON) * factor) / factor
}

const RECORD_STATS = false
const memoStats = new Map<string, { hits: number; misses: number }>()
function recordMemoStat(name: string, hit: boolean) {
  if (!memoStats.has(name)) {
    memoStats.set(name, { hits: 0, misses: 0 })
  }
  const stats = memoStats.get(name)!
  if (hit) {
    stats.hits++
  } else {
    stats.misses++
  }
}
export function getMemoStats() {
  return Array.from(memoStats.entries()).map(([name, { hits, misses }]) => ({
    name,
    hits,
    misses,
  }))
}

/**
 * A utility function to memoize the results of a given function. This helps to cache
 * the results of expensive function calls and return the cached result when the same
 * inputs occur again.
 *
 * @template T - The type of the function to be memoized.
 * @param fn - The function to be memoized. It must be a pure function to ensure
 * consistent results for the same inputs.
 * @param givenName - An optional name for the memoized function. If not provided,
 * the function's name or a name derived from the stack trace will be used.
 * @returns A memoized version of the input function `fn`.
 *
 * @throws {Error} If the serialized key for the arguments exceeds MEMOIZATION_LIMIT characters.
 * This is to prevent excessive memory usage or performance degradation.
 *
 * @remarks
 * - The function uses a `Map` to store cached results, with the serialized arguments
 * as the key.
 * - If the function returns a `Promise`, the memoized version will cache the pending
 * promise and update the cache once the promise resolves.
 * - If the result is an object or array, the same reference will be returned! Make
 * sure to use immutable data structures or deep clone the result if you want to
 * avoid side effects.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  givenName?: string,
): T {
  const cache = new Map<string, ReturnType<T> | Promise<ReturnType<T>>>()

  const fnName = givenName || fn.name || getNameFromStackTrace(new Error())

  const memoizedFn: (...args: Parameters<T>) => ReturnType<T> = (
    ...args: Parameters<T>
  ): ReturnType<T> => {
    const key = quickHash(args)

    if (cache.has(key)) {
      if (RECORD_STATS) {
        recordMemoStat(fnName, true)
      }
      const cachedValue = cache.get(key)!
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return cachedValue as ReturnType<T>
    }
    if (RECORD_STATS) {
      recordMemoStat(fnName, false)
    }
    const result = fn(...args) as ReturnType<T> | Promise<ReturnType<T>>
    if (result instanceof Promise) {
      // Store the pending promise and update cache once resolved
      const promise = result.then((res) => {
        cache.set(key, res)
        return res
      })
      cache.set(key, promise)
      // Prevent multiple calls while waiting
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return promise as ReturnType<T>
    } else {
      cache.set(key, result)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return result
    }
  }

  return memoizedFn as T
}

function getNameFromStackTrace(error: Error): string {
  const stack = error.stack
  if (!stack) return 'Unknown function'

  const lines = stack.split('\n')
  const match = lines[1].match(/at (\w+)/)
  return match ? match[1] : 'Unknown function'
}

/**
 * Retrieves an array of Figma collections that match the specified name.
 * Optionally filters the collections to include only those that are visible in the Figma file.
 *
 * @param collections - An object containing Figma collections, where the keys are collection IDs
 * and the values are the corresponding collection objects.
 * @param name - The name of the collections to retrieve.
 * @param onlyVisible - A boolean indicating whether to include only collections that are visible
 * (i.e., not hidden from publishing). Defaults to `false`.
 * @returns An array of Figma collections that match the specified name, sorted such that
 * collections with `hiddenFromPublishing = false` appear first.
 */
export function getCollectionsByName(
  collections: FigmaCollections,
  name: string,
  onlyVisible = false,
): FigmaCollection[] {
  return Object.values(collections)
    .filter(
      (collection) =>
        collection.collection.name === name &&
        (!onlyVisible || !collection.collection.hiddenFromPublishing),
    )
    .sort((a, b) => {
      // sort so hiddenFromPublishing = false comes first
      const aHidden = a.collection.hiddenFromPublishing
      const bHidden = b.collection.hiddenFromPublishing
      if (aHidden && !bHidden) {
        return 1
      }
      if (!aHidden && bHidden) {
        return -1
      }
      return 0
    })
}

export function getVisibleCollectionByName(
  collections: FigmaCollections,
  name: string,
): FigmaCollection | undefined {
  const visibleCollections = getCollectionsByName(collections, name, true)
  if (visibleCollections.length === 0) {
    return undefined
  }
  if (visibleCollections.length > 1) {
    throw new Error(
      `Found multiple visible collections with the name '${name}'. Can't proceed due to ambiguity.`,
    )
  }
  return visibleCollections[0]
}

/**
 * Generates a quick hash for a given input using the SHA-1 algorithm and encodes it in Base64.
 *
 * @param input - The input to hash, which can be a string, number, or object.
 *                If the input is an object, it will be serialized to a JSON string.
 * @returns A Base64-encoded hash string representing the input.
 */
export function quickHash(input: string | number | object): string {
  const data =
    typeof input === 'string' || typeof input === 'number'
      ? String(input)
      : JSON.stringify(input)

  return createHash('sha1').update(data).digest('base64')
}
