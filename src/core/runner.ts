import type { CoreConfig, Job } from './types.js'
import WorkflowLogger from './workflow/index.js'
import { getMemoStats } from './utils.js'

export async function run(config: CoreConfig, jobs: Job[]) {
  const logger = new WorkflowLogger({
    slackWebhookUrlSuccess: config.slackWebhookUrlSuccess,
    slackWebhookUrlFailure: config.slackWebhookUrlFailure,
  })

  async function execute() {
    const availableJobs =
      config.onlyRunJobs === undefined
        ? jobs.filter((job) => !job.manualOnly)
        : jobs.filter((job) => config.onlyRunJobs?.includes(job.id))

    const jobPromises = availableJobs.map(async (job) => {
      try {
        console.info(`Starting job: ${job.name}`)
        const result = await job.action()

        logger.documentJob({
          jobId: job.id,
          jobName: job.name,
          dryRun: job.dryRun,
          stats: result.getStats(),
          figCollections: result.getFigmaTokens(),
        })
        console.info(`Job completed: ${job.name}`)
      } catch (error) {
        console.error(`Error in job ${job.name}:`, error)
        logger.documentJob({
          jobId: job.id,
          jobName: job.name,
          dryRun: job.dryRun,
          error: error as string | Error,
        })
      }
    })

    await Promise.all(jobPromises)

    await logger.finalize()
  }

  await execute()
    .catch(async (error) => {
      logger.documentJob({
        jobId: 'ROOT',
        jobName: 'Runtime',
        dryRun: false,
        error: error as string | Error,
      })
      await logger.finalize().then(() => {
        throw error
      })
    })
    .finally(() => {
      const memoStats = getMemoStats()
      if (memoStats.length > 0) {
        console.info('Memoization stats:', memoStats)
      }
    })
}
