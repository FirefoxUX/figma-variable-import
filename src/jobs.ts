import { GetLocalVariablesResponse } from '@figma/rest-api-spec'
import { getCentralCollectionValues } from 'central-import.js'
import Config from 'Config.js'
import { HCM_MAP } from 'imports.js'
import { normalizeFigmaTokens } from 'normalizeFigmaTokens.js'
import { constructRelativeData } from 'relative-transform.js'
import { CentralCollections } from 'types.js'
import UpdateConstructor from 'UpdateConstructor.js'
import { memoize, fetchFigmaAPI, FigmaAPIURLs } from 'utils.js'

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
    name: 'Update Desktop Styles',
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
      ucTokens.constructUpdate(tokensCollections)
      await ucTokens.submitChanges(Config.dryRun)

      return ucTokens
    },
  },

  {
    id: 'FX_COLORS',
    name: 'Update Firefox Colors file',
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

      ucColor.constructUpdate(colorsCollections)
      await ucColor.submitChanges(Config.dryRun)

      return ucColor
    },
  },
]
