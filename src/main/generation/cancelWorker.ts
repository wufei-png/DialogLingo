export type GenerationWorkerCancelTarget = {
  postMessage: (message: unknown) => unknown
}

export function requestGenerationCancel(
  worker: GenerationWorkerCancelTarget | undefined,
  jobId: string
) {
  if (!worker) {
    return {
      workerFound: false,
      cancelled: false
    }
  }

  worker.postMessage({
    type: 'cancel',
    jobId
  })

  return {
    workerFound: true,
    cancelled: true
  }
}
