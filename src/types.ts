import {
  LocalVariable,
  LocalVariableCollection,
  PublishedVariable,
  RGBA,
  VariableAlias,
  VariableCreate,
} from '@figma/rest-api-spec'
import { SYMBOL_RESOLVED_TYPE } from './utils.js'

// ---
// CENTRAL
// ---

/**
 * A variable is an object where each key is a mode and
 * the value is the value of the variable in that mode
 */
export type CentralVariable = {
  [key: string]: number | boolean | string | any
}
/**
 * Extends the {@link CentralVariable} type by adding the resolved type
 */
export type TypedCentralVariable = {
  [key: string]: number | boolean | string
  [SYMBOL_RESOLVED_TYPE]: VariableCreate['resolvedType']
}

/**
 * A collection is an object where each key is a variable name
 * and the value is the variable object
 */
export type CentralCollection = {
  [key: string]: CentralVariable
}

/**
 * Extends the {@link CentralCollection} type by adding the resolved type
 */
export type TypedCentralCollection = {
  [key: string]: TypedCentralVariable
}

/**
 * An object where each key is a collection name and
 * the value are the variables in that collection
 */
export type CentralCollections = {
  [key: string]: CentralCollection
}

/**
 * An object where each key is a collection name and
 * the value are the typed variables in that collection
 */
export type TypedCentralCollections = {
  [key: string]: TypedCentralCollection
}

// ---
// FIGMA
// ---

export type FigmaCollection = {
  collection: LocalVariableCollection
  variables: LocalVariable[]
}

export type FigmaCollections = {
  [key: string]: FigmaCollection
}

export type FigmaResultCollection = {
  [key: string]: Record<string, PublishedVariable>
}

export type FigmaVariableData = {
  modeId: string
  info: LocalVariable
  value?: FigmaVariableValue
}

export type FigmaVariableValue =
  | string
  | number
  | boolean
  | RGBA
  | VariableAlias
