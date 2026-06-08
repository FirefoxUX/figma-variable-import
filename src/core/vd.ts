import { type Rgb } from './color.js'
import { VariableCreate } from '@figma/rest-api-spec'

// VD - Variable Description Format
// This format organizes variables in a way similar to Figma's UI:
// - Variables are grouped into collections.
// - Each collection contains multiple variables.
// - Each variable can have multiple modes, with values of type number, boolean, string, or color (Rgb).
// - Variables can be aliased by referencing other variables using the format: {Collection Name$variable Name}.
//   (Note: casing and spaces matter.)
// - Variables can be marked for deletion using the string 'delete' as the value.
// The format is designed to be both human-friendly and machine-readable.

// Symbol used as a key for the resolved type on typed VD variables
export const SYMBOL_RESOLVED_TYPE = Symbol('resolvedType')

export type VDVariableValue = number | boolean | string | Rgb

/**
 * An object where each key is a collection name and
 * the value are the variables in that collection
 */
export type VDCollections = {
  [key: string]: VDCollection
}

/**
 * A collection is an object where each key is a variable name
 * and the value is the variable object
 */
export type VDCollection = {
  [key: string]: VDVariable
}

/**
 * A variable is an object where each key is a mode and
 * the value is the value of the variable in that mode
 */
export type VDVariable = {
  [key: string]: VDVariableValue
}

/**
 * Result from calculating a VD diff, including both the diff
 * and metadata about which variables are net-new
 */
export type VDDiffResult = {
  diff: VDCollections
  newVariables: Record<string, Set<string>>
}

/**
 * An object where each key is a collection name and
 * the value are the typed variables in that collection
 */
export type TypedVDCollections = {
  [key: string]: TypedVDCollection
}

/**
 * Extends the {@link VDCollection} type by adding the resolved type
 */
export type TypedVDCollection = {
  [key: string]: TypedVDVariable
}

/**
 * Extends the {@link VDVariable} type by adding the resolved type
 */
export type TypedVDVariable = VDVariable & {
  [SYMBOL_RESOLVED_TYPE]: VariableCreate['resolvedType']
}

const REFERENCE_REGEX = /{([^$]+)\$([^}]+)}/

export function isVdReference(value: VDVariableValue): boolean {
  if (typeof value !== 'string') return false
  return REFERENCE_REGEX.test(value)
}

export function extractVdReference(
  value: string | number | boolean,
): { collection: string; variable: string } | null {
  if (typeof value !== 'string') return null
  const match = REFERENCE_REGEX.exec(value)
  if (match) {
    return {
      collection: match[1],
      variable: match[2],
    }
  }
  return null
}

export function isVdDelete(value: VDVariableValue): boolean {
  return typeof value === 'string' && value === 'delete'
}
