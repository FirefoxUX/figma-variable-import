import { getAndroidModes } from './android.js'
import { getCentralCollectionValues } from './central-import.js'
import { mergeExperimentalConfigs } from './experimental-import.js'
import { HCM_MAP } from './imports.js'
import { constructRelativeData } from './relative-transform.js'
import { memoize } from '../core/utils.js'
import {
  getFigmaCollections,
  submitVDCollections,
} from '../core/figma/index.js'
import type { VDCollections } from '../core/vd.js'
import type { Job } from '../core/types.js'
import { get, type MozillaConfig } from './config.js'

export function createMozillaJobs(config: MozillaConfig): Job[] {
  // ----
  // Memoized functions
  // ----

  const memoGetFigmaTokensFromFile = memoize(
    (fileId: string) => getFigmaCollections(fileId, config.figmaAccessToken),
    'fetchFigmaAPI',
  )
  const memoGetCentralCollectionValues = memoize(() =>
    getCentralCollectionValues(
      config.centralSource,
      config.centralCurrentColorAlias,
    ),
  )

  // ----
  // Per-job dry-run defaults
  // ----
  // NOVA_STYLES is dry-run by default (drift check only — writes happen via
  // apply-nova-styles.yaml). ANDROID_M3_MODES writes on the cron.

  const androidDryRun = config.dryRun ?? false
  const novaDryRun = config.dryRun ?? true

  // ----
  // Jobs
  // ----

  return [
    {
      id: 'ANDROID_M3_MODES',
      name: 'Update Android M3 modes',
      dryRun: androidDryRun,
      action: async () => {
        // Get the Figma tokens from the file
        const figmaAndroidTokens = await memoGetFigmaTokensFromFile(
          get(config, 'figmaIdAndroidComponents'),
        )
        // The Figma API does not always return all variables, so we need to
        // download the tokens from the file where colors come from as a fallback
        const figmaMobileColors = await memoGetFigmaTokensFromFile(
          get(config, 'figmaIdMobileStyles'),
        )

        const collection = getAndroidModes(
          figmaAndroidTokens,
          figmaMobileColors,
          config.android,
        )

        return submitVDCollections(
          get(config, 'figmaIdAndroidComponents'),
          figmaAndroidTokens,
          collection,
          {
            handleDeprecation: false,
            dryRun: androidDryRun,
            figmaAccessToken: config.figmaAccessToken,
          },
        )
      },
    },

    {
      id: 'NOVA_STYLES',
      name: 'Sync tokens to Nova Styles',
      dryRun: novaDryRun,
      action: async () => {
        const figmaTokens = await memoGetFigmaTokensFromFile(
          get(config, 'figmaIdNovaStyles'),
        )

        const centralData = await memoGetCentralCollectionValues()
        const relativeData = constructRelativeData(centralData.relative)

        const baseCollections: VDCollections = {
          'HCM Theme': HCM_MAP,
          Colors: centralData.central.Colors,
          Primitives: centralData.central.Primitives,
          Components: centralData.central.Components,
          Theme: centralData.central.Theme,
          ...relativeData,
        }

        const tokensCollections = mergeExperimentalConfigs(baseCollections)

        return submitVDCollections(
          get(config, 'figmaIdNovaStyles'),
          figmaTokens,
          tokensCollections,
          {
            handleDeprecation: true,
            dryRun: novaDryRun,
            figmaAccessToken: config.figmaAccessToken,
          },
        )
      },
    },
  ]
}
