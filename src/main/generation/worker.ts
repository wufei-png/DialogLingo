import { parentPort } from 'node:worker_threads'

let cancelled = false

parentPort?.on(
  'message',
  async (
    message:
      | { type: 'start'; jobId: string; sessionIds: string[] }
      | { type: 'cancel'; jobId: string }
  ) => {
    if (message.type === 'cancel') {
      cancelled = true
      return
    }

    for (let index = 0; index < message.sessionIds.length; index += 1) {
      const sessionId = message.sessionIds[index]
      if (cancelled) {
        parentPort?.postMessage({
          kind: 'snapshot',
          jobId: message.jobId,
          status: 'cancelled',
          totalSelectedSessionCount: message.sessionIds.length,
          processedSessionCount: index,
          createdItemCount: 0,
          warningCount: 0,
          failureCount: 0,
          currentSessionTitle: sessionId,
          currentBatchLabel: null
        })
        return
      }

      parentPort?.postMessage({
        kind: 'phase',
        jobId: message.jobId,
        status: 'normalizing',
        totalSelectedSessionCount: message.sessionIds.length,
        processedSessionCount: index,
        createdItemCount: 0,
        warningCount: 0,
        failureCount: 0,
        currentSessionTitle: sessionId,
        currentBatchLabel: null
      })

      parentPort?.postMessage({
        kind: 'phase',
        jobId: message.jobId,
        status: 'mining',
        totalSelectedSessionCount: message.sessionIds.length,
        processedSessionCount: index + 1,
        createdItemCount: 0,
        warningCount: 0,
        failureCount: 0,
        currentSessionTitle: sessionId,
        currentBatchLabel: `candidate batch ${index + 1}`
      })

      parentPort?.postMessage({
        kind: 'phase',
        jobId: message.jobId,
        status: 'enriching',
        totalSelectedSessionCount: message.sessionIds.length,
        processedSessionCount: index + 1,
        createdItemCount: (index + 1) * 4,
        warningCount: 0,
        failureCount: 0,
        currentSessionTitle: sessionId,
        currentBatchLabel: `llm batch ${index + 1}`
      })
    }

    parentPort?.postMessage({
      kind: 'phase',
      jobId: message.jobId,
      status: 'ranking',
      totalSelectedSessionCount: message.sessionIds.length,
      processedSessionCount: message.sessionIds.length,
      createdItemCount: message.sessionIds.length * 4,
      warningCount: 0,
      failureCount: 0,
      currentSessionTitle: null,
      currentBatchLabel: 'type-balance rerank'
    })

    parentPort?.postMessage({
      kind: 'phase',
      jobId: message.jobId,
      status: 'materializing',
      totalSelectedSessionCount: message.sessionIds.length,
      processedSessionCount: message.sessionIds.length,
      createdItemCount: message.sessionIds.length * 4,
      warningCount: 0,
      failureCount: 0,
      currentSessionTitle: null,
      currentBatchLabel: 'write workbook items'
    })

    parentPort?.postMessage({
      kind: 'completed',
      jobId: message.jobId,
      status: 'completed',
      totalSelectedSessionCount: message.sessionIds.length,
      processedSessionCount: message.sessionIds.length,
      createdItemCount: message.sessionIds.length * 4,
      warningCount: 0,
      failureCount: 0,
      currentSessionTitle: null,
      currentBatchLabel: null
    })
  }
)
