import type UpdateConstructor from './figma/UpdateConstructor.js'

export type CoreConfig = {
  figmaAccessToken: string
  // undefined = use each job's own default; true/false = global override
  dryRun: boolean | undefined
  slackWebhookUrlSuccess?: string
  slackWebhookUrlFailure?: string
  onlyRunJobs?: string[]
}

export type Job = {
  id: string
  name: string
  manualOnly?: boolean
  dryRun: boolean
  action: () => Promise<UpdateConstructor>
}
