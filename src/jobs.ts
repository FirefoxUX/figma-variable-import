import { GetLocalVariablesResponse } from '@figma/rest-api-spec'
import { getAndroidModes } from './android.js'
import { getCentralCollectionValues } from './central-import.js'
import Config from './Config.js'
import { HCM_MAP } from './imports.js'
import { normalizeFigmaTokens } from './normalizeFigmaTokens.js'
import { constructRelativeData } from './relative-transform.js'
import { CentralCollections } from './types.js'
import UpdateConstructor from './UpdateConstructor.js'
import { memoize, fetchFigmaAPI, FigmaAPIURLs } from './utils.js'

// ----
// Memoized functions
// ----

const memoGetFigmaTokensFromFile = memoize(
  (url: string) =>
    fetchFigmaAPI<GetLocalVariablesResponse>(url).then(({ meta }) =>
      normalizeFigmaTokens(meta),
    ),
  'fetchFigmaAPI',
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
        FigmaAPIURLs.getLocalVariables(Config.get('figmaIdDesktopStyles')),
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
        Config.get('figmaIdDesktopStyles'),
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
        FigmaAPIURLs.getLocalVariables(Config.get('figmaIdFirefoxColors')),
      )
      const centralData = await memoGetCentralCollectionValues()

      const colorsCollections: CentralCollections = {
        Colors: centralData.central.Colors,
      }

      const ucColor = new UpdateConstructor(
        figmaColorsTokens,
        Config.get('figmaIdFirefoxColors'),
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
      // Get the Figma tokens from the file
      const figmaAndroidTokens = await memoGetFigmaTokensFromFile(
        FigmaAPIURLs.getLocalVariables(Config.get('figmaIdAndroidComponents')),
      )
      // The Figma API does not always return all variables, so we need to
      // download the tokens from the file where colors come from as a fallback
      const figmaMobileColors = await memoGetFigmaTokensFromFile(
        FigmaAPIURLs.getLocalVariables(Config.get('figmaIdMobileStyles')),
      )

      const collection = getAndroidModes(figmaMobileColors, figmaAndroidTokens)

      const ucColor = new UpdateConstructor(
        figmaAndroidTokens,
        Config.get('figmaIdAndroidComponents'),
      )

      ucColor.constructUpdate(collection)
      await ucColor.submitChanges(Config.dryRun)

      return ucColor
    },
  },
]
