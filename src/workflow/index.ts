import { VariableCreate } from '@figma/rest-api-spec'
import { FigmaCollections, FigmaVariableValue } from '../types.js'
import { ExtraStats } from '../UpdateConstructor.js'
import { figmaToCulori, isFigmaAlias, roundTo } from '../utils.js'
import { summary } from './summary.js'
import Config from '../Config.js'
import { formatHex } from '../color.js'

type SlackWorkflowStats = Record<keyof Omit<ExtraStats, 'result'>, number> & {
  actionURL: string
}
type SlackErrorPayload = {
  errorMessage: string
  actionURL: string
}

type SummaryData = {
  fileName: string
  stats: ExtraStats
  figCollections: FigmaCollections
}

export async function documentStats(data: SummaryData[]) {
  setGithubWorkflowSummary(data)
  await sendSlackWorkflowStats(data)
}

export async function documentError(error: Error | string) {
  setGithubWorkflowError(error)
  await sendSlackWorkflowError(error)
}

export async function sendSlackWorkflowStats(
  data: SummaryData[],
): Promise<void> {
  if (!Config.slackWebhookUrlSuccess) return

  const numberStats: Record<keyof Omit<ExtraStats, 'result'>, number> = {
    modesCreated: data.reduce(
      (sum, item) => sum + item.stats.modesCreated.length,
      0,
    ),
    variablesCreated: data.reduce(
      (sum, item) => sum + item.stats.variablesCreated.length,
      0,
    ),
    variableValuesUpdated: data.reduce(
      (sum, item) => sum + item.stats.variableValuesUpdated.length,
      0,
    ),
    variablesDeprecated: data.reduce(
      (sum, item) => sum + item.stats.variablesDeprecated.length,
      0,
    ),
    variablesUndeprecated: data.reduce(
      (sum, item) => sum + item.stats.variablesUndeprecated.length,
      0,
    ),
  }

  const total = Object.values(numberStats).reduce((acc, curr) => acc + curr, 0)
  if (total === 0) return

  const payload: SlackWorkflowStats = {
    ...numberStats,
    actionURL: getGithubActionURL(),
  }

  return sendSlackWebhook(Config.slackWebhookUrlSuccess, payload)
}

export function setGithubWorkflowSummary(data: SummaryData[]) {
  summary.addHeading('Central > Figma Variable Import Summary', 2)

  for (const [index, { fileName, stats, figCollections }] of data.entries()) {
    summary.addHeading(fileName, 3)

    if (Config.dryRun) {
      summary.addEOL().addRaw('> [!NOTE]').addEOL()
      summary
        .addRaw(
          '> This was a dry run. The changes were not submitted to Figma.',
        )
        .addEOL()
    } else if (stats.result === undefined) {
      summary.addEOL().addRaw('> [!WARNING]').addEOL()
      summary
        .addRaw(
          '> Changes were supposed to be submitted to Figma, but no result was recorded, which indicates a possible error.',
        )
        .addEOL()
    } else if (typeof stats.result === 'object' && 'error' in stats.result) {
      if (stats.result.error === true) {
        summary.addEOL().addRaw('> [!CAUTION]').addEOL()
        summary
          .addRaw(
            `> An error occurred while submitting changes to Figma. (Status code: ${stats.result.status})`,
          )
          .addEOL()
        if (stats.result.message) {
          summary.addEOL().addRaw(`>`).addEOL()
          summary.addEOL().addRaw(`> \`\`\``).addEOL()
          stats.result.message.split('\n').forEach((line) => {
            summary.addEOL().addRaw(`> ${line}`).addEOL()
          })
          summary.addEOL().addRaw(`> \`\`\``).addEOL()
        }
      } else {
        summary.addEOL().addRaw('> [!NOTE]').addEOL()
        summary
          .addRaw('> Changes were submitted to Figma without any errors.')
          .addEOL()
      }
    } else {
      summary.addEOL().addRaw('> [!CAUTION]').addEOL()
      summary.addRaw(
        '> An unexpected error occurred while submitting changes to Figma.',
      )
      // if stats.result is a string, add it to the summary
      if (typeof stats.result === 'string') {
        summary.addRaw(`>`).addEOL()
        summary.addRaw(`> \`\`\``).addEOL()
        stats.result.split('\n').forEach((line) => {
          summary.addRaw(`> ${line}`).addEOL()
        })
        summary.addRaw(`> \`\`\``).addEOL()
      }
    }
    summary.addEOL()

    // Modes created
    summary.addEOL().addHeading('Modes created', 4)
    if (stats.modesCreated.length === 0) {
      const element = summary.wrap('p', 'No modes were created.')
      summary.addEOL().addRaw(element).addEOL()
    } else {
      const element = summary.wrap(
        'p',
        `The following ${stats.modesCreated.length} modes were created:`,
      )
      summary.addEOL().addRaw(element).addEOL()
      // create a table with the collection and mode name
      summary.addTable([
        [
          { data: 'Collection', header: true },
          { data: 'Mode created', header: true },
        ],
        ...stats.modesCreated.map((mode) => [mode.collection, mode.mode]),
      ])
    }

    // Variables created
    summary.addEOL().addHeading('Variables created', 4)
    if (stats.variablesCreated.length === 0) {
      const element = summary.wrap('p', 'No variables were created.')
      summary.addEOL().addRaw(element).addEOL()
    } else {
      const element = summary.wrap(
        'p',
        `The following ${stats.variablesCreated.length} variables were created:`,
      )
      summary.addEOL().addRaw(element).addEOL()
      // create a table with the collection, variable name and resolved type
      summary.addTable([
        [
          { data: 'Collection', header: true },
          { data: 'Variable', header: true },
          { data: 'Type', header: true },
        ],
        ...stats.variablesCreated.map((variable) => [
          variable.collection,
          summary.wrap('strong', variable.variable),
          variable.resolvedType,
        ]),
      ])
    }

    // Variable values updated
    summary.addEOL().addHeading('Variable values updated', 4)
    if (stats.variableValuesUpdated.length === 0) {
      const element = summary.wrap('p', 'No variable values were updated.')
      summary.addEOL().addRaw(element).addEOL()
    } else {
      const element = summary.wrap(
        'p',
        `The following ${stats.variableValuesUpdated.length} variable values were updated:`,
      )
      summary.addEOL().addRaw(element).addEOL()
      // create a table with the collection, variable name, mode, old value and new value
      summary.addTable([
        [
          { data: 'Collection', header: true },
          { data: 'Variable', header: true },
          { data: 'Mode', header: true },
          { data: 'Old value', header: true },
          { data: 'New value', header: true },
        ],
        ...stats.variableValuesUpdated.map((variable) => [
          variable.collection,
          summary.wrap('strong', variable.variable),
          variable.mode,
          variable.oldValue !== undefined
            ? summary.wrap(
                'code',
                formatFigmaVariableValue(
                  variable.oldValue,
                  variable.resolvedType,
                  figCollections,
                ),
              )
            : '',
          summary.wrap(
            'code',
            formatFigmaVariableValue(
              variable.newValue,
              variable.resolvedType,
              figCollections,
            ),
          ),
        ]),
      ])
    }

    // Variables deprecated
    summary.addEOL().addHeading('Variables deprecated', 4)
    const element1 = summary.wrap(
      'p',
      'Variables where a deprecation warning was added to the description.',
    )
    summary.addEOL().addRaw(element1).addEOL()
    if (stats.variablesDeprecated.length === 0) {
      const element = summary.wrap('p', 'No variables were deprecated.')
      summary.addEOL().addRaw(element).addEOL()
    } else {
      const element = summary.wrap(
        'p',
        `The following ${stats.variablesDeprecated.length} variables were deprecated:`,
      )
      summary.addEOL().addRaw(element).addEOL()
      // create a table with the collection and variable name
      summary.addTable([
        [
          { data: 'Collection', header: true },
          { data: 'Variable', header: true },
        ],
        ...stats.variablesDeprecated.map((variable) => [
          variable.collection,
          variable.variable,
        ]),
      ])
    }

    // Variables undeprecated
    summary.addEOL().addHeading('Variables undeprecated', 4)
    const element2 = summary.wrap(
      'p',
      'Variables where a deprecation warning was removed from the description.',
    )
    summary.addEOL().addRaw(element2).addEOL
    if (stats.variablesUndeprecated.length === 0) {
      const element = summary.wrap('p', 'No variables were undeprecated.')
      summary.addEOL().addRaw(element).addEOL()
    } else {
      // create a table with the collection and variable name
      summary.addTable([
        [
          { data: 'Collection', header: true },
          { data: 'Variable', header: true },
        ],
        ...stats.variablesUndeprecated.map((variable) => [
          variable.collection,
          variable.variable,
        ]),
      ])
    }

    if (index < data.length - 1) {
      summary.addEOL().addSeparator().addEOL()
    }
  }

  summary.write()
}

function setGithubWorkflowError(error: string | Error) {
  const errorMessage =
    typeof error === 'string'
      ? error
      : error.stack || error.message || 'An unknown error occurred.'

  summary.addEOL().addHeading('Central>Figma Variable Import Summary', 2)
  summary.addEOL().addRaw('> [!CAUTION]').addEOL()
  summary
    .addEOL()
    .addRaw('> An error occurred while running the script.')
    .addEOL()
  summary.addEOL().addRaw(`>`).addEOL()
  summary.addEOL().addRaw(`> \`\`\``).addEOL()
  errorMessage.split('\n').forEach((line) => {
    summary.addEOL().addRaw(`> ${line}`).addEOL()
  })
  summary.addEOL().addRaw(`> \`\`\``).addEOL()
  summary.write()
}

async function sendSlackWorkflowError(error: string | Error): Promise<void> {
  if (!Config.slackWebhookUrlFailure) return

  const payload: SlackErrorPayload = {
    errorMessage: typeof error === 'string' ? error : error.message,
    actionURL: getGithubActionURL(),
  }

  return sendSlackWebhook(Config.slackWebhookUrlFailure, payload)
}

// ----
// Helper functions
// ----

function formatFigmaVariableValue(
  value: FigmaVariableValue,
  resolvedType: VariableCreate['resolvedType'],
  figCollections: FigmaCollections,
): string {
  if (value === undefined) {
    return '(not set)'
  }

  if (isFigmaAlias(value)) {
    // find the name of the alias by looking up the id in the figma collection
    for (const collection of Object.values(figCollections)) {
      for (const variable of collection.variables) {
        if (variable.id === value.id) {
          return `ALIAS(${variable.name})`
        }
      }
    }
    // Hmm, we couldn't find the alias in the figma collection (concering)
    console.warn(
      `When creating the summary: Alias with id ${value.id} not found in figma collection`,
    )
    // we'll just return the id then
    return `ALIAS(${value.id})`
  }
  // if color, denormalizeRGBA and open in culori
  if (resolvedType === 'COLOR' && typeof value === 'object' && 'r' in value) {
    const denormalized = figmaToCulori(value)
    // we want to return the hex and the alpha value seperated (e.g. #000000 24%)
    // the percentage should be rounded to two decimal places
    if (denormalized === undefined) {
      throw new Error(
        `When creating the summary: Could not denormalize color value ${JSON.stringify(
          value,
        )}`,
      )
    }
    return `${formatHex(denormalized).toUpperCase()} ${roundTo((denormalized.alpha === undefined ? 1 : denormalized.alpha) * 100, 2)}%`
  }
  // if a float, round to to four decimal places
  if (resolvedType === 'FLOAT') {
    return roundTo(value as number, 4).toString()
  }
  return value.toString()
}

async function sendSlackWebhook(
  webookUrl: string,
  payload: Record<string, unknown>,
) {
  // first we need to ensure that all the values in the payload object are strings
  const stringifiedPayload = Object.entries(payload).reduce(
    (acc, [key, value]) => {
      acc[key] = (value as string).toString()
      return acc
    },
    {} as Record<string, string>,
  )

  console.info('Sending Slack webhook:', JSON.stringify(stringifiedPayload))

  try {
    const res = await fetch(webookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(stringifiedPayload),
    })
    if (!res.ok) {
      console.error('Error sending Slack webhook:', res.statusText)
      summary.addSeparator()
      summary.addEOL().addRaw('> [!WARNING]').addEOL()
      summary
        .addRaw('> An error occurred while sending the Slack webhook.')
        .addEOL()
      // if there is a status text, we add it to the summary
      if (res?.statusText.trim() !== '') {
        summary.addEOL().addRaw(`> \`\`\``).addEOL()
        summary.addEOL().addRaw(`> ${res.statusText}`).addEOL()
        summary.addEOL().addRaw(`> \`\`\``).addEOL()
      }
      summary.write()
    } else {
      console.info('Slack webhook sent successfully.')
    }
  } catch (error) {
    console.error('Error sending Slack webhook:', error)
    summary.addSeparator()
    summary.addEOL().addRaw('> [!WARNING]').addEOL()
    summary
      .addRaw('> An error occurred while sending the Slack webhook.')
      .addEOL()
    summary
      .addRaw(`> Error Message: \`${(error as Error).toString()}\``)
      .addEOL()
    summary.write()
  }
}

function getGithubActionURL() {
  const runId = process.env.GITHUB_RUN_ID
  const repo = process.env.GITHUB_REPOSITORY

  if (!runId || !repo) {
    return 'https://github.com'
  }

  return `https://github.com/${repo}/actions/runs/${runId}`
}
