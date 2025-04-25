import { LocalVariable } from '@figma/rest-api-spec'
import { Color, rgb } from 'culori'
import {
  FigmaCollections,
  FigmaCollection,
  CentralCollections,
  CentralCollection,
  CentralVariable,
} from './types.js'
import { memoize, isFigmaAlias, figmaToCulori } from './utils.js'

type SearchByCollectionName = { collectionName: string; variableName: string }
type SearchByVariableId = { variableId: string }
type Search = SearchByCollectionName | SearchByVariableId

type Mode = 'Light' | 'Dark' | 'Private'
type VariableValueType = LocalVariable['valuesByMode'][string]

type VariableValueErrorParams = {
  errVariableName: string
  errCollectionName: string
  mode: Mode
}

export function getAndroidModes(
  figmaMobileColors: FigmaCollections,
  figmaAndroidTokens: FigmaCollections,
): CentralCollections {
  const resolveColor = getResolveColor(figmaMobileColors)

  const themeCollectionName = 'Color (M3)'

  // filter to get only variables whose name starts with "State Layers/"
  const opacityVariables = figmaAndroidTokens[themeCollectionName].variables
    .filter((variable) => variable.name.startsWith('State Layers/'))
    .reduce((acc, variable) => {
      const path = variable.name.split('/').map((part) => part.trim())
      const [_, referencedVariableName, opacity] = path
      // [0] = 'State Layers'
      // [1] = Name of referenced variable
      // [2] = 'Opacity-XX'
      // get the opacity as a number
      const opacityNumber = parseFloat(opacity.split('-')[1]) / 100
      if (isNaN(opacityNumber)) {
        throw new Error(
          `When parsing opacity variable, the value for ${opacity} is not a number`,
        )
      }

      const variableName = `In Use/${referencedVariableName}`
      const variableNameFallback = `Not Using (yet)/${referencedVariableName}`

      const resolveWithFallback = (
        mode: 'Light' | 'Dark' | 'Private',
        name: string,
        fallback: string,
      ) => {
        console.log('\n---------------------------------')
        console.log('RESOLVE OPACITY VAR', variableName)
        // first try to resolve the variable
        let color: Color | undefined = undefined
        try {
          color = resolveColor(figmaAndroidTokens, mode, {
            collectionName: themeCollectionName,
            variableName: name,
          })
        } catch (_e) {
          color = resolveColor(figmaAndroidTokens, mode, {
            collectionName: themeCollectionName,
            variableName: fallback,
          })
        }
        const figmaColor = rgb(color)
        figmaColor.alpha = opacityNumber * (figmaColor.alpha ?? 1)
        return figmaColor
      }

      const updatedVariable: CentralVariable = {
        'Acorn / Light': resolveWithFallback(
          'Light',
          variableName,
          variableNameFallback,
        ),
        'Acorn / Dark': resolveWithFallback(
          'Dark',
          variableName,
          variableNameFallback,
        ),
        'Acorn / Private': resolveWithFallback(
          'Private',
          variableName,
          variableNameFallback,
        ),
      }

      acc[variable.name] = updatedVariable

      return acc
    }, {} as CentralCollection)

  const collection: CentralCollections = {
    [themeCollectionName]: opacityVariables,
  }
  return collection
}

const getCollection = memoize(
  (
    collections: FigmaCollections,
    search: Search,
  ): FigmaCollection | undefined => {
    if ('collectionName' in search) {
      return collections[search.collectionName]
    } else {
      return Object.values(collections).find((collection) =>
        collection.collection.variableIds.includes(search.variableId),
      )
    }
  },
  'getCollection',
)

const getModeId = memoize((collection: FigmaCollection, mode: Mode): string => {
  const modesLookup = ['Acorn / Default', mode]
  if (collection.collection.modes.length === 1) {
    return collection.collection.modes[0].modeId
  } else {
    for (const lookup of modesLookup) {
      const foundMode = collection.collection.modes.find(
        (mode) => lookup === mode.name,
      )
      if (foundMode) {
        return foundMode.modeId
      }
    }
  }
  throw new Error(
    `Mode ${mode} not found in collection ${collection.collection.name}`,
  )
}, 'getModeId')

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
    (collections: FigmaCollections, mode: Mode, search: Search): Color => {
      console.log('>>> resolveColor', mode, search)

      const errCollectionName =
        'collectionName' in search
          ? search.collectionName
          : 'Unknown collection'
      const errVariableName =
        'collectionName' in search ? search.variableName : search.variableId

      const collection = getCollection(collections, search)
      if (!collection) {
        throw new Error(
          `Collection ${errCollectionName} not found while resolving ${errVariableName}`,
        )
      }

      console.log(
        '    found collection! has modes',
        collection.collection.modes.length,
      )

      const modeId = getModeId(collection, mode)

      const variableData = getVariableData(collection, search)
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
            console.info('    [!!!] Falling back to figmaMobileColors')
            return resolveColor(fallbackCollections, mode, {
              collectionName: collection.collection.name,
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

      console.log(
        `Resolved color for ${errVariableName} in ${mode}`,
        parsedColor,
      )
      return parsedColor
    },
    'resolveColor',
  )
  return resolveColor
}
