import { jobEventSchema } from '../../shared/ipc/events'
import { spawnGenerationWorker } from './spawnGenerationWorker'

export async function runGenerationJob(input: {
  jobId: string
  sessionIds: string[]
  settings: {
    provider: {
      baseUrl: string
      apiKey: string
      defaultModel: string
    }
  }
  emit: (event: unknown) => void
}) {
  const worker = spawnGenerationWorker((event) => {
    input.emit(jobEventSchema.parse(event))
  })

  worker.postMessage({
    type: 'start',
    jobId: input.jobId,
    sessionIds: input.sessionIds,
    provider: input.settings.provider
  })

  return worker
}
