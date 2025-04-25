import {
  GetLocalVariablesResponse,
  GetPublishedVariablesResponse,
  LocalVariable,
} from '@figma/rest-api-spec'
import { getCentralCollectionValues } from 'central-import.js'
import { Color, rgb } from 'color.js'
import Config from 'Config.js'
import { HCM_MAP } from 'imports.js'
import {
  normalizeFigmaPublishedTokens,
  normalizeFigmaTokens,
} from 'normalizeFigmaTokens.js'
import { constructRelativeData } from 'relative-transform.js'
import {
  CentralCollection,
  CentralCollections,
  CentralVariable,
  FigmaCollection,
  FigmaCollections,
} from 'types.js'
import UpdateConstructor from 'UpdateConstructor.js'
import { inspect } from 'util'
import {
  memoize,
  fetchFigmaAPI,
  FigmaAPIURLs,
  isFigmaAlias,
  figmaToCulori,
  culoriToFigma,
} from 'utils.js'

// ----
// Memoized functions
// ----

const memoGetFigmaTokensFromFile = memoize((url: string) =>
  fetchFigmaAPI<GetLocalVariablesResponse>(url).then(({ meta }) =>
    normalizeFigmaTokens(meta),
  ),
)
const memoGetCentralCollectionValues = memoize(getCentralCollectionValues)

// ----
// Jobs
// ----

export default [
  {
    id: 'DESKTOP_STYLES',
    name: 'Central tokens to desktop styles',
    action: async () => {
      const figmaTokens = await memoGetFigmaTokensFromFile(
        FigmaAPIURLs.getLocalVariables(Config.figmaIdDesktopStyles),
      )

      const centralData = await memoGetCentralCollectionValues()
      const relativeData = constructRelativeData(centralData.relative)

      const tokensCollections: CentralCollections = {
        'HCM Theme': HCM_MAP,
        ...centralData.central,
        ...relativeData,
      }

      const ucTokens = new UpdateConstructor(
        figmaTokens,
        Config.figmaIdDesktopStyles,
      )
      ucTokens.constructUpdate(tokensCollections, true)
      await ucTokens.submitChanges(Config.dryRun)

      return ucTokens
    },
  },

  {
    id: 'FX_COLORS',
    name: 'Import color palette to Firefox Colors',
    action: async () => {
      const figmaColorsTokens = await memoGetFigmaTokensFromFile(
        FigmaAPIURLs.getLocalVariables(Config.figmaIdFirefoxColors),
      )
      const centralData = await memoGetCentralCollectionValues()

      const colorsCollections: CentralCollections = {
        Colors: centralData.central.Colors,
      }

      const ucColor = new UpdateConstructor(
        figmaColorsTokens,
        Config.figmaIdFirefoxColors,
      )

      ucColor.constructUpdate(colorsCollections, true)
      await ucColor.submitChanges(Config.dryRun)

      return ucColor
    },
  },

  {
    id: 'ANDROID_M3_MODES',
    name: 'Create Android M3 modes',
    action: async () => {
      const figmaAndroidTokens = await memoGetFigmaTokensFromFile(
        FigmaAPIURLs.getLocalVariables(Config.figmaIdAndroidComponents),
      )
      const figmaMobileColors = await memoGetFigmaTokensFromFile(
        FigmaAPIURLs.getLocalVariables(Config.figmaIdMobileStyles),
      )

      // Object.values(figmaAndroidTokens).forEach(c => console.log(c.collection))
      // console.info(inspect(figmaAndroidTokens, { depth: null, colors: true }))

      const themeCollectionName = 'Color (M3)'
      const referenceMode = 'Acorn / Default'
      const targetModes = ['Light', 'Dark', 'Private']

      const resolveColor = memoize(
        (
          collections: FigmaCollections,
          mode: 'Light' | 'Dark' | 'Private',
          search:
            | { collectionName: string; variableName: string }
            | {
                variableId: string
              },
        ): Color => {
          let collection: FigmaCollection | undefined

          console.log('>>> resolveColor', mode, search)

          const errCollectionName =
            'collectionName' in search
              ? search.collectionName
              : 'Unknown collection'
          const errVariableName =
            'collectionName' in search ? search.variableName : search.variableId

          if ('collectionName' in search) {
            collection = collections[search.collectionName]
          } else {
            collection = Object.values(collections).find((collection) =>
              collection.collection.variableIds.includes(search.variableId),
            )
          }

          if (!collection) {
            throw new Error(
              `Collection ${errCollectionName} not found while resolving ${errVariableName}`,
            )
          }

          const modesLookup = [referenceMode, mode]
          let modeId
          console.log(
            '    found collection! has modes',
            collection.collection.modes.length,
          )
          // if there is only one mode, get the ID of the first mode
          if (collection.collection.modes.length === 1) {
            modeId = collection.collection.modes[0].modeId
          } else {
            // else we look if one of the modes in the lookup is in the collection (prioritized in order)
            for (const lookup of modesLookup) {
              const foundMode = collection.collection.modes.find(
                (mode) => lookup === mode.name,
              )
              if (foundMode) {
                modeId = foundMode.modeId
                break
              }
            }
          }
          if (!modeId) {
            throw new Error(
              `Mode ${mode} not found in collection ${errCollectionName}`,
            )
          }

          let variableData: LocalVariable | undefined = undefined

          if ('collectionName' in search) {
            variableData = collection.variables.find(
              (variable) => variable.name === search.variableName,
            )
          } else {
            variableData = collection.variables.find(
              (variable) => variable.id === search.variableId,
            )
          }

          if (!variableData) {
            throw new Error(
              `Variable ${errVariableName} not found in collection ${errCollectionName}`,
            )
          }

          const variableValue = variableData.valuesByMode[modeId]
          if (!variableValue) {
            throw new Error(
              `Variable ${errVariableName} not found in collection ${errCollectionName} for mode ${mode}`,
            )
          }

          if (isFigmaAlias(variableValue)) {
            try {
              return resolveColor(collections, mode, {
                variableId: variableValue.id,
              })
            } catch (e) {
              if (collections !== figmaMobileColors) {
                // try fallback tokens
                console.info('    [!!!] Falling back to figmaMobileColors')
                return resolveColor(figmaMobileColors, mode, {
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
      )

      const getModeName = (mode: string) => `Acorn / ${mode}`

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
            } catch (e) {
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

      const ucColor = new UpdateConstructor(
        figmaAndroidTokens,
        Config.figmaIdFirefoxColors,
      )

      ucColor.constructUpdate(collection)
      await ucColor.submitChanges(Config.dryRun)

      return ucColor
    },
  },
]
