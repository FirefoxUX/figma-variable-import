/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { readFileSync } from 'fs'
import YAML from 'yaml'
import { VDCollection, VDCollections } from '../core/vd.js'

type ExperimentalTokens = {
  colors?: Record<string, { Value: string | number | boolean }>
  primitives?: Record<string, { Value: string | number | boolean }>
  components?: Record<string, { Value: string | number | boolean }>
  theme?: Record<
    string,
    {
      Light: string | number | boolean
      Dark: string | number | boolean
      HCM: string | number | boolean
    }
  >
  operatingSystem?: VDCollection
  surface?: VDCollection
  tabGroupTheme?: VDCollection
}

/**
 * Loads experimental configuration files and merges them with the provided base collections.
 * Experimental configs can add new tokens or override existing ones.
 * Tokens with value 'delete' in all modes will be removed from the final result.
 *
 * @param baseCollections - The base VDCollections to merge experimental configs into
 * @returns A new VDCollections object with experimental overrides applied and deletions removed
 */
export function mergeExperimentalConfigs(
  baseCollections: VDCollections,
): VDCollections {
  const experimental = loadExperimentalConfigs()

  // Create a deep copy of base collections to avoid mutations
  const result: VDCollections = JSON.parse(JSON.stringify(baseCollections))

  // Merge Colors collection. Same model as the other collections: experimental
  // adds/overrides on top of central. Use shorthand-delete normalization with a
  // single 'Value' mode (Colors are scalar primitives, not multi-mode).
  if (experimental.colors && Object.keys(experimental.colors).length > 0) {
    if (!result.Colors) {
      result.Colors = {}
    }
    const normalizedColors = normalizeShorthandDeletions(
      experimental.colors,
      result.Colors,
    )
    result.Colors = {
      ...result.Colors,
      ...normalizedColors,
    }
  }

  // Merge Primitives collection
  if (
    experimental.primitives &&
    Object.keys(experimental.primitives).length > 0
  ) {
    if (!result.Primitives) {
      result.Primitives = {}
    }
    const normalizedPrimitives = normalizeShorthandDeletions(
      experimental.primitives,
      result.Primitives,
    )
    result.Primitives = {
      ...result.Primitives,
      ...normalizedPrimitives,
    }
  }

  // Merge Components collection
  if (
    experimental.components &&
    Object.keys(experimental.components).length > 0
  ) {
    if (!result.Components) {
      result.Components = {}
    }
    const normalizedComponents = normalizeShorthandDeletions(
      experimental.components,
      result.Components,
    )
    result.Components = {
      ...result.Components,
      ...normalizedComponents,
    }
  }

  // Merge Theme collection
  if (experimental.theme && Object.keys(experimental.theme).length > 0) {
    if (!result.Theme) {
      result.Theme = {}
    }
    const normalizedTheme = normalizeShorthandDeletions(
      experimental.theme,
      result.Theme,
    )
    result.Theme = {
      ...result.Theme,
      ...normalizedTheme,
    }
  }

  // Merge Operating System collection
  if (
    experimental.operatingSystem &&
    Object.keys(experimental.operatingSystem).length > 0
  ) {
    if (!result['Operating System']) {
      result['Operating System'] = {}
    }
    const normalizedOS = normalizeShorthandDeletions(
      experimental.operatingSystem,
      result['Operating System'],
    )
    result['Operating System'] = {
      ...result['Operating System'],
      ...normalizedOS,
    }
  }

  // Merge Surface collection
  if (experimental.surface && Object.keys(experimental.surface).length > 0) {
    if (!result.Surface) {
      result.Surface = {}
    }
    const normalizedSurface = normalizeShorthandDeletions(
      experimental.surface,
      result.Surface,
    )
    result.Surface = {
      ...result.Surface,
      ...normalizedSurface,
    }
  }

  // Define Tab Group Theme collection wholesale (no central counterpart)
  if (
    experimental.tabGroupTheme &&
    Object.keys(experimental.tabGroupTheme).length > 0
  ) {
    result['Tab Group Theme'] = experimental.tabGroupTheme
  }

  // Remove any tokens marked for deletion across all collections
  return removeDeletedTokens(result)
}

/**
 * Removes tokens that have 'delete' as the value in all modes.
 * This processes the collections after all merging is complete.
 */
function removeDeletedTokens(collections: VDCollections): VDCollections {
  const result: VDCollections = {}

  for (const [collectionName, collection] of Object.entries(collections)) {
    result[collectionName] = {}

    for (const [variableName, variable] of Object.entries(collection)) {
      // Check if all mode values are 'delete'
      const allValuesAreDelete = Object.values(variable).every(
        (value) => value === 'delete',
      )

      // Only include the variable if it's not marked for deletion
      if (!allValuesAreDelete) {
        result[collectionName][variableName] = variable
      }
    }
  }

  return result
}

/**
 * Normalizes shorthand deletion syntax in experimental configs.
 * Converts `variableName: 'delete'` to `variableName: { Mode1: 'delete', Mode2: 'delete', ... }`
 * based on the modes present in the base collection.
 */
function normalizeShorthandDeletions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  collection: Record<string, any>,
  baseCollection?: VDCollection,
): VDCollection {
  const normalized: VDCollection = {}

  for (const [variableName, variable] of Object.entries(collection)) {
    // If variable is the string 'delete', expand it to all modes
    if (typeof variable === 'string' && variable === 'delete') {
      // Get modes from base collection if available
      const baseModes = baseCollection?.[variableName]
        ? Object.keys(baseCollection[variableName])
        : ['Light', 'Dark', 'HCM'] // Default modes

      const deletionMarker: Record<string, string> = {}
      for (const mode of baseModes) {
        deletionMarker[mode] = 'delete'
      }
      normalized[variableName] = deletionMarker
    } else {
      normalized[variableName] = variable
    }
  }

  return normalized
}

/**
 * Loads all experimental configuration files from the config/experimental directory.
 * Returns an object containing parsed experimental tokens for each collection type.
 */
function loadExperimentalConfigs(): ExperimentalTokens {
  const experimental: ExperimentalTokens = {}

  try {
    const colorsYaml = readFileSync('./config/experimental/colors.yaml', 'utf8')
    const colorsData = YAML.parse(colorsYaml)
    if (colorsData && typeof colorsData === 'object') {
      experimental.colors = colorsData as Record<
        string,
        { Value: string | number | boolean }
      >
    }
  } catch (_error) {
    // File might not exist or be empty, that's okay
  }

  try {
    const primitivesYaml = readFileSync(
      './config/experimental/primitives.yaml',
      'utf8',
    )
    const primitivesData = YAML.parse(primitivesYaml)
    if (primitivesData && typeof primitivesData === 'object') {
      experimental.primitives = primitivesData as Record<
        string,
        { Value: string | number | boolean }
      >
    }
  } catch (_error) {
    // File might not exist or be empty, that's okay
  }

  try {
    const componentsYaml = readFileSync(
      './config/experimental/components.yaml',
      'utf8',
    )
    const componentsData = YAML.parse(componentsYaml)
    if (componentsData && typeof componentsData === 'object') {
      experimental.components = componentsData as Record<
        string,
        { Value: string | number | boolean }
      >
    }
  } catch (_error) {
    // File might not exist or be empty, that's okay
  }

  try {
    const themeYaml = readFileSync('./config/experimental/theme.yaml', 'utf8')
    const themeData = YAML.parse(themeYaml)
    if (themeData && typeof themeData === 'object') {
      experimental.theme = themeData as Record<
        string,
        {
          Light: string | number | boolean
          Dark: string | number | boolean
          HCM: string | number | boolean
        }
      >
    }
  } catch (_error) {
    // File might not exist or be empty, that's okay
  }

  try {
    const osYaml = readFileSync(
      './config/experimental/operating-system.yaml',
      'utf8',
    )
    const osData = YAML.parse(osYaml)
    if (osData && typeof osData === 'object') {
      experimental.operatingSystem = osData as VDCollection
    }
  } catch (_error) {
    // File might not exist or be empty, that's okay
  }

  try {
    const surfaceYaml = readFileSync(
      './config/experimental/surface.yaml',
      'utf8',
    )
    const surfaceData = YAML.parse(surfaceYaml)
    if (surfaceData && typeof surfaceData === 'object') {
      experimental.surface = surfaceData as VDCollection
    }
  } catch (_error) {
    // File might not exist or be empty, that's okay
  }

  try {
    const tabGroupThemeYaml = readFileSync(
      './config/experimental/tab-group-theme.yaml',
      'utf8',
    )
    const tabGroupThemeData = YAML.parse(tabGroupThemeYaml)
    if (tabGroupThemeData && typeof tabGroupThemeData === 'object') {
      experimental.tabGroupTheme = tabGroupThemeData as VDCollection
    }
  } catch (_error) {
    // File might not exist or be empty, that's okay
  }

  return experimental
}
