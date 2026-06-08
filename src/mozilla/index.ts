import { run } from '../core/index.js'
import { loadMozillaConfig } from './config.js'
import { createMozillaJobs } from './jobs.js'

const config = loadMozillaConfig()
const jobs = createMozillaJobs(config)

void run(config, jobs)
