import { LocalVariable } from '@figma/rest-api-spec'
import { Rgb } from '../core/color.js'
import { FigmaCollections, FigmaCollection } from '../core/figma/types.js'
import {
  memoize,
  isFigmaAlias,
  figmaToCulori,
  getVisibleCollectionByName,
  getCollectionsByName,
} from '../core/utils.js'
import { VDCollections, VDVariable, VDCollection } from '../core/vd.js'

type AndroidConfig = { themeCollectionName: string }

type SearchByCollectionName = { collectionName: string; variableName: string }
type SearchByVariableId = { variableId: string }
type Search = SearchByCollectionName | SearchByVariableId

type VariableValueType = LocalVariable['valuesByMode'][string]

type VariableValueErrorParams = {
  errVariableName: string
  errCollectionName: string
  mode: string
}

const OPACITY_LEAF = /^Opacity-(\d+)$/

export function getAndroidModes(
  figmaAndroidTokens: FigmaCollections,
  figmaMobileColors: FigmaCollections,
  androidConfig: AndroidConfig,
): VDCollections {
  const { themeCollectionName } = androidConfig

  const themeCollection = getVisibleCollectionByName(
    figmaAndroidTokens,
    themeCollectionName,
  )

  if (!themeCollection) {
    throw new Error(
      `The collection '${themeCollectionName}' is missing in the figma file. Please add it to the figma file before running the script again.`,
    )
  }

  const resolveColor = getResolveColor(figmaMobileColors)
  const modes = themeCollection.collection.modes.map((m) => m.name)
  const variableNames = new Set(themeCollection.variables.map((v) => v.name))

  const updated: VDCollection = {}
  for (const variable of themeCollection.variables) {
    const parts = variable.name.split('/').map((p) => p.trim())
    const leafMatch = OPACITY_LEAF.exec(parts[parts.length - 1])
    if (!leafMatch) continue

    const opacityFactor = parseInt(leafMatch[1], 10) / 100
    if (isNaN(opacityFactor)) {
      throw new Error(
        `When parsing opacity variable ${variable.name}, the opacity value is not a number`,
      )
    }

    const refName = parts[parts.length - 2]
    const target = variableNames.has(refName)
      ? refName
      : variableNames.has(`${refName} [Deprecated]`)
        ? `${refName} [Deprecated]`
        : null
    if (!target) {
      console.warn(
        `Skipping ${variable.name}: reference '${refName}' not found in collection '${themeCollectionName}'`,
      )
      continue
    }

    const valuesByMode: VDVariable = {}
    for (const mode of modes) {
      const color = resolveColor(figmaAndroidTokens, mode, {
        collectionName: themeCollectionName,
        variableName: target,
      })
      valuesByMode[mode] = {
        ...color,
        alpha: opacityFactor * (color.alpha ?? 1),
      }
    }
    updated[variable.name] = valuesByMode
  }

  return { [themeCollectionName]: updated }
}

const getCollections = memoize(
  (collections: FigmaCollections, search: Search): FigmaCollection[] => {
    if ('collectionName' in search) {
      return getCollectionsByName(collections, search.collectionName)
    } else {
      const result = Object.values(collections).find((collection) =>
        collection.collection.variableIds.includes(search.variableId),
      )
      if (result) {
        return [result]
      }
    }
    return []
  },
  'getCollection',
)

const getModeId = memoize(
  (collection: FigmaCollection, mode: string): string => {
    if (collection.collection.modes.length === 1) {
      return collection.collection.modes[0].modeId
    }
    const foundMode = collection.collection.modes.find((m) => m.name === mode)
    if (foundMode) {
      return foundMode.modeId
    }
    throw new Error(
      `Mode ${mode} not found in collection ${collection.collection.name}`,
    )
  },
  'getModeId',
)

const getVariableData = memoize(
  (collection: FigmaCollection, search: Search): LocalVariable | undefined => {
    if ('collectionName' in search) {
      return collection.variables.find(
        (variable) => variable.name === search.variableName,
      )
    } else {
      return collection.variables.find(
        (variable) => variable.id === search.variableId,
      )
    }
  },
  'getVariableData',
)

const getVariableValue = (
  variableData: LocalVariable,
  modeId: string,
  errParams: VariableValueErrorParams,
): VariableValueType => {
  const variableValue = variableData.valuesByMode[modeId]
  if (!variableValue) {
    throw new Error(
      `Variable ${errParams.errVariableName} not found in collection ${errParams.errCollectionName} for mode ${errParams.mode}`,
    )
  }
  return variableValue
}

export const getResolveColor = (fallbackCollections: FigmaCollections) => {
  const resolveColor = memoize(
    (collections: FigmaCollections, mode: string, search: Search): Rgb => {
      const errCollectionName =
        'collectionName' in search
          ? search.collectionName
          : 'Unknown collection'
      const errVariableName =
        'collectionName' in search ? search.variableName : search.variableId

      const foundCollections = getCollections(collections, search)
      if (foundCollections.length <= 0) {
        throw new Error(
          `Collection ${errCollectionName} not found while resolving ${errVariableName}`,
        )
      }

      for (const foundCollection of foundCollections) {
        const modeId = getModeId(foundCollection, mode)

        const variableData = getVariableData(foundCollection, search)
        if (!variableData) {
          throw new Error(
            `Variable ${errVariableName} not found in collection ${errCollectionName}`,
          )
        }

        const variableValue = getVariableValue(variableData, modeId, {
          errVariableName,
          errCollectionName,
          mode,
        })

        if (isFigmaAlias(variableValue)) {
          try {
            return resolveColor(collections, mode, {
              variableId: variableValue.id,
            })
          } catch (e) {
            if (collections !== fallbackCollections) {
              return resolveColor(fallbackCollections, mode, {
                collectionName: foundCollection.collection.name,
                variableName: variableData.name,
              })
            }
            throw e
          }
        }

        if (
          variableValue === null ||
          typeof variableValue !== 'object' ||
          !('r' in variableValue) ||
          !('g' in variableValue) ||
          !('b' in variableValue) ||
          !('a' in variableValue)
        ) {
          throw new Error(
            `Variable ${errVariableName} in collection ${errCollectionName} is not a color`,
          )
        }

        const parsedColor = figmaToCulori(variableValue)
        if (!parsedColor) {
          throw new Error(
            `Variable ${errVariableName} in collection ${errCollectionName} is not a valid color`,
          )
        }

        return parsedColor
      }
      throw new Error(
        `Variable ${errVariableName} not found in collection ${errCollectionName}`,
      )
    },
    'resolveColor',
  )
  return resolveColor
}
