import Config from './Config.js'
import WorkflowLogger from './workflow/index.js'
import jobs from './jobs.js'
import { getMemoStats } from './utils.js'

async function run() {
  const availableJobs =
    Config.onlyRunJobs === undefined
      ? jobs
      : jobs.filter((job) => Config.onlyRunJobs?.includes(job.id))

  const jobPromises = availableJobs.map(async (job) => {
    try {
      console.info(`Starting job: ${job.name}`)
      const uc = await job.action()
      WorkflowLogger.documentJob({
        jobId: job.id,
        jobName: job.name,
        stats: uc.getStats(),
        figCollections: uc.getFigmaTokens(),
      })
      console.info(`Job completed: ${job.name}`)
    } catch (error) {
      console.error(`Error in job ${job.name}:`, error)
      WorkflowLogger.documentJob({
        jobId: job.id,
        jobName: job.name,
        error: error as string | Error,
      })
    }
  })

  await Promise.all(jobPromises)

  await WorkflowLogger.finalize()
}

run()
  .catch(async (error) => {
    WorkflowLogger.documentJob({
      jobId: 'ROOT',
      jobName: 'Runtime',
      error: error as string | Error,
    })
    await WorkflowLogger.finalize().then(() => {
      throw error
    })
  })
  .finally(() => {
    const memoStats = getMemoStats()
    if (memoStats.length > 0) {
      console.info('Memoization stats:', memoStats)
    }
  })
