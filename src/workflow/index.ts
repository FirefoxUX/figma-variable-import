import { VariableCreate } from '@figma/rest-api-spec'
import { FigmaCollections, FigmaVariableValue } from '../figma/types.js'
import { figmaToCulori, getMemoStats, isFigmaAlias, roundTo } from '../utils.js'
import { summary } from './summary.js'
import Config from '../Config.js'
import { formatHex } from '../color.js'
import { ExtraStats } from '../figma/UpdateConstructor.js'

type InfoBoxMessage = {
  type: 'note' | 'tip' | 'important' | 'warning' | 'caution'
  message: string
  code?: string
}

type SlackPayload = {
  heading: string
  message: string
  actionURL: string
}

type JobData = {
  jobId: string
  jobName: string
}

type SummaryData = JobData & {
  stats: ExtraStats
  figCollections: FigmaCollections
}

type ErrorData = JobData & {
  error: string | Error
}

type WorkflowData = SummaryData | ErrorData

class WorkflowLogger {
  private data: WorkflowData[] = []

  constructor() {
    this.setupHeader()
  }

  private writeInfoBoxMessage(info: InfoBoxMessage) {
    summary.addEOL().addRaw(`> [!${info.type.toUpperCase()}]`).addEOL()
    summary.addRaw(`> ${info.message}`).addEOL()
    if (info.code) {
      summary.addEOL().addRaw(`>`).addEOL()
      summary.addEOL().addRaw(`> \`\`\``).addEOL()
      info.code.split('\n').forEach((line) => {
        summary.addRaw(`> ${line}`).addEOL()
      })
      summary.addEOL().addRaw(`> \`\`\``).addEOL()
    }
    summary.addEOL()
  }

  private setupHeader() {
    summary.addHeading('Figma Variable Script Summary', 2)

    if (Config.dryRun) {
      this.writeInfoBoxMessage({
        type: 'note',
        message:
          'This was a dry run. No changes were made to Figma.\nBelow is a summary of the changes that would be made.',
      })
    }
  }

  documentJob(data: WorkflowData) {
    this.data.push(data)
  }

  async finalize() {
    summary.addEOL().addHeading('Jobs', 3)
    summary.addList(
      this.data.map(({ jobId, jobName }) =>
        summary.wrap('a', summary.wrap('strong', jobName), {
          href: `#user-content-job-${jobId}`,
        }),
      ),
      true,
    )
    summary.addEOL().addSeparator().addEOL()
    for (const entry of this.data) {
      const infoMessage = this.getJobInfo(entry)
      await this.createJobSummary(entry, infoMessage)
      await this.createJobSlackMessage(entry, infoMessage)
    }
    this.logMemoizationStats()
    await summary.write()
  }

  private logMemoizationStats() {
    const memoStats = getMemoStats()
    if (memoStats.length > 0) {
      summary.addEOL().addHeading('Memoization stats', 3)
      summary.addTable([
        [
          { data: 'Function', header: true },
          { data: 'Hits', header: true },
          { data: 'Misses', header: true },
          { data: 'Hit rate', header: true },
        ],
        ...memoStats.map((stat) => [
          stat.name.toString(),
          stat.hits.toString(),
          stat.misses.toString(),
          `${
            stat.hits + stat.misses === 0
              ? 'N/A'
              : `${Math.round((stat.hits / (stat.hits + stat.misses)) * 100)}%`
          }`,
        ]),
      ])
      summary.addEOL()
    }
  }

  private async createJobSummary(
    data: WorkflowData,
    infoMessage?: InfoBoxMessage,
  ) {
    const { jobId, jobName } = data
    summary
      .addRaw(summary.wrap('h3', jobName, { id: `job-${jobId}` }))
      .addEOL()
      .addEOL()

    if (infoMessage) {
      this.writeInfoBoxMessage(infoMessage)
      summary.addEOL()
    }

    if ('stats' in data) {
      const { stats, figCollections } = data
      // Modes created
      if (stats.modesCreated.length > 0) {
        summary.addHeading('Modes created', 2)
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
      if (stats.variablesCreated.length > 0) {
        summary.addHeading('Variables created', 2)
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
      if (stats.variableValuesUpdated.length > 0) {
        summary.addHeading('Variable values updated', 2)
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
      if (stats.variablesDeprecated.length > 0) {
        summary.addHeading('Variables deprecated', 2)
        const element1 = summary.wrap(
          'p',
          'Variables where a deprecation warning was added to the description.',
        )
        summary.addEOL().addRaw(element1).addEOL()
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
      if (stats.variablesUndeprecated.length > 0) {
        summary.addHeading('Variables undeprecated', 2)
        const element2 = summary.wrap(
          'p',
          'Variables where a deprecation warning was removed from the description.',
        )
        summary.addEOL().addRaw(element2).addEOL()
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
    }
    await summary.write()
  }

  private getJobInfo(data: WorkflowData): InfoBoxMessage | undefined {
    let infoMessage: InfoBoxMessage | undefined
    if ('error' in data) {
      const error = data.error
      const errorMessage =
        typeof error === 'string'
          ? error
          : error.stack || error.message || 'An unknown error occurred.'

      infoMessage = {
        type: 'caution',
        message: 'An error occurred while running the script.',
        code: errorMessage,
      }
    } else if ('stats' in data && data.stats.emptyChangeset === true) {
      infoMessage = {
        type: 'note',
        message: 'No changes were found for this job.',
      }
    } else if (!Config.dryRun && 'stats' in data) {
      const { stats } = data
      if (stats.result === undefined) {
        infoMessage = {
          type: 'warning',
          message:
            'Changes were supposed to be submitted to Figma, but no result was recorded, which indicates a possible error.',
        }
      } else if (typeof stats.result === 'object' && 'error' in stats.result) {
        if (stats.result.error === true) {
          infoMessage = {
            type: 'caution',
            message: `An error occurred while submitting changes to Figma. (Status code: ${stats.result.status})`,
            code: stats.result.message,
          }
        } else {
          infoMessage = {
            type: 'note',
            message: 'Changes were submitted to Figma without any errors. Yay!',
          }
        }
      } else {
        infoMessage = {
          type: 'caution',
          message:
            'An unexpected error occurred while submitting changes to Figma.',
          code: typeof stats.result === 'string' ? stats.result : undefined,
        }
      }
    }
    return infoMessage
  }

  private async createJobSlackMessage(
    data: WorkflowData,
    infoMessage?: InfoBoxMessage,
  ) {
    if ('stats' in data && data.stats.emptyChangeset === true) {
      return
    }

    const webookUrl =
      'stats' in data
        ? Config.slackWebhookUrlSuccess
        : Config.slackWebhookUrlFailure
    if (!webookUrl) {
      return
    }

    let message = ''

    if (infoMessage) {
      message += `[${infoMessage.type.toUpperCase()}] ${infoMessage.message}\n`
      if (infoMessage.code) {
        message += infoMessage.code
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n')
      }
      message += '\n'
    }

    if ('stats' in data) {
      const { stats } = data
      message += 'Overview:\n'
      message += Object.entries({
        '  - Modes created': stats.modesCreated.length,
        '  - Variables created': stats.variablesCreated.length,
        '  - Variable values updated': stats.variableValuesUpdated.length,
        '  - Variables deprecated': stats.variablesDeprecated.length,
        '  - Variables undeprecated': stats.variablesUndeprecated.length,
      })
        .filter(([_, count]) => count > 0)
        .map(([label, count]) => `${label}: ${count}`)
        .join('\n')
    }

    message = message.trim()

    if (!message) {
      return
    }
    await this.sendSlackWebhook(webookUrl, {
      heading: data.jobName,
      message,
      actionURL: getGithubActionURL(),
    })
  }

  private async sendSlackWebhook(webookUrl: string, payload: SlackPayload) {
    // first we need to ensure that all the values in the payload object are strings
    const stringifiedPayload = Object.entries(payload).reduce(
      (acc, [key, value]) => {
        acc[key] = value.toString()
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
        this.writeInfoBoxMessage({
          type: 'warning',
          message: 'An error occurred while sending the Slack webhook.',
          code: res?.statusText.trim() !== '' ? res.statusText : undefined,
        })
        await summary.write()
      } else {
        console.info('Slack webhook sent successfully.')
      }
    } catch (error) {
      console.error('Error sending Slack webhook:', error)
      summary.addSeparator()
      this.writeInfoBoxMessage({
        type: 'warning',
        message: 'An error occurred while sending the Slack webhook.',
        code: (error as Error).toString(),
      })
      await summary.write()
    }
  }
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
  return typeof value === 'object' ? JSON.stringify(value) : value.toString()
}

function getGithubActionURL() {
  const runId = process.env.GITHUB_RUN_ID
  const repo = process.env.GITHUB_REPOSITORY

  if (!runId || !repo) {
    return 'https://github.com'
  }

  return `https://github.com/${repo}/actions/runs/${runId}`
}

export default new WorkflowLogger()
