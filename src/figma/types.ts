import {
  LocalVariable,
  LocalVariableCollection,
  PublishedVariable,
  RGBA,
  VariableAlias,
} from '@figma/rest-api-spec'

// ---
// FIGMA
// ---

export type FigmaCollection = {
  collection: LocalVariableCollection
  variables: LocalVariable[]
  toJSON: () => string
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

export type FigmaResponseWrapper<T> = {
  status: number
  error: boolean
  message?: string
  data?: T
}
