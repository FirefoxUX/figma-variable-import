import { readFileSync } from 'fs'
import YAML from 'yaml'
import type { CoreConfig } from '../core/types.js'
import { parseFigmaUrl } from '../core/utils.js'

export type MozillaConfig = CoreConfig & {
  figmaIdNovaStyles?: string
  figmaIdAndroidComponents?: string
  figmaIdMobileStyles?: string
  centralCurrentColorAlias: string
  centralSource: {
    colors: string
    primitives: string
    components: string
    theme: string
    designTokens: string
  }
  android: {
    themeCollectionName: string
  }
}

export function get<K extends keyof MozillaConfig>(
  config: MozillaConfig,
  name: K,
): NonNullable<MozillaConfig[K]> {
  const value = config[name]
  if (value === undefined || value === null) {
    throw new Error(`Error loading config item: ${String(name)} is not defined`)
  }
  return value
}

export function loadMozillaConfig(
  configPath = './config/config.yaml',
): MozillaConfig {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const rawConfig = YAML.parse(readFileSync(configPath, 'utf8'))
  const config = rawConfig as {
    env?: Record<string, string | undefined>
    centralCurrentColorAlias: string
    centralSource: MozillaConfig['centralSource']
    android: MozillaConfig['android']
  }

  if (!config.env) {
    config.env = {}
  }

  // The Nova Styles file is the destination for code→Figma sync.
  // The Action input keeps its historical name FIGMA_URL_EXPERIMENTAL_DESKTOP_STYLES
  // to avoid renaming the GitHub Actions secret; the internal config name reflects
  // the current job naming.
  const figmaIdNovaStyles = parseFigmaUrl(
    'FIGMA_URL_EXPERIMENTAL_DESKTOP_STYLES',
    config.env.FIGMA_URL_EXPERIMENTAL_DESKTOP_STYLES ||
      process.env.INPUT_FIGMA_URL_EXPERIMENTAL_DESKTOP_STYLES,
  )
  const figmaIdAndroidComponents = parseFigmaUrl(
    'FIGMA_URL_ANDROID_COMPONENTS',
    config.env.FIGMA_URL_ANDROID_COMPONENTS ||
      process.env.INPUT_FIGMA_URL_ANDROID_COMPONENTS,
  )
  const figmaIdMobileStyles = parseFigmaUrl(
    'FIGMA_URL_MOBILE_STYLES',
    config.env.FIGMA_URL_MOBILE_STYLES ||
      process.env.INPUT_FIGMA_URL_MOBILE_STYLES,
  )

  const centralCurrentColorAlias = config.centralCurrentColorAlias
  const centralSource = config.centralSource

  // Environment variables (can be overriden by config.yaml)
  const figmaAccessToken =
    config.env.FIGMA_ACCESS_TOKEN ?? process.env.INPUT_FIGMA_ACCESS_TOKEN
  const slackWebhookUrlSuccess: string | undefined =
    config.env.SLACK_WEBHOOK_SUCCESS || process.env.INPUT_SLACK_WEBHOOK_SUCCESS
  const slackWebhookUrlFailure: string | undefined =
    config.env.SLACK_WEBHOOK_FAILURE || process.env.INPUT_SLACK_WEBHOOK_FAILURE
  const dryRun =
    parseDryRun(config.env.DRY_RUN) ?? parseDryRun(process.env.INPUT_DRY_RUN)

  let onlyRunJobs: string[] | undefined
  const onlyRunJobsValue: string | undefined =
    config.env.ONLY_RUN_JOBS || process.env.INPUT_ONLY_RUN_JOBS
  if (onlyRunJobsValue && onlyRunJobsValue.toLowerCase() !== 'all') {
    const array = onlyRunJobsValue
      .split(',')
      .map((job: string) => job.trim())
      .filter((job: string) => job !== '')
    onlyRunJobs = array.length > 0 ? array : undefined
  }

  const android = config.android

  // Validation
  validateAndroidConfig(android)

  if (centralCurrentColorAlias === undefined) {
    throw new Error(
      'Error loading config: centralCurrentColorAlias is undefined',
    )
  }
  if (centralSource === undefined) {
    throw new Error('Error loading config: centralSource is undefined')
  }
  if (
    centralSource.colors === undefined ||
    centralSource.primitives === undefined ||
    centralSource.components === undefined ||
    centralSource.theme === undefined ||
    centralSource.designTokens === undefined
  ) {
    throw new Error('Error loading config: centralSource is not valid')
  }
  if (figmaAccessToken === undefined) {
    throw new Error('Error loading config: figmaAccessToken is undefined')
  }

  return {
    figmaAccessToken,
    dryRun,
    slackWebhookUrlSuccess,
    slackWebhookUrlFailure,
    onlyRunJobs,
    figmaIdNovaStyles,
    figmaIdAndroidComponents,
    figmaIdMobileStyles,
    centralCurrentColorAlias,
    centralSource,
    android,
  }
}

// Returns undefined for anything that isn't an explicit true/false, so jobs
// can fall back to their own per-job defaults (see src/mozilla/jobs.ts).
function parseDryRun(raw: unknown): boolean | undefined {
  if (raw === true || raw === 'true') return true
  if (raw === false || raw === 'false') return false
  return undefined
}

function validateAndroidConfig(android: MozillaConfig['android']) {
  if (!android) {
    throw new Error('Error loading config: android config is undefined')
  }

  const requiredFields = ['themeCollectionName'] as const

  for (const field of requiredFields) {
    if (!android[field] || android[field] === '') {
      throw new Error(
        `Error loading config: android.${field} is not defined or empty`,
      )
    }
  }
}
