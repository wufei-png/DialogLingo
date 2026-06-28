import { describe, expect, it } from 'vitest'
import { requestGenerationCancel } from '../../../src/main/generation/cancelWorker'

describe('requestGenerationCancel', () => {
  it('treats postMessage without a return value as a delivered cancel request', () => {
    const messages: unknown[] = []

    const result = requestGenerationCancel(
      {
        postMessage: (message) => {
          messages.push(message)
          return undefined
        }
      },
      'job-1'
    )

    expect(result).toEqual({
      workerFound: true,
      cancelled: true
    })
    expect(messages).toEqual([
      {
        type: 'cancel',
        jobId: 'job-1'
      }
    ])
  })

  it('returns false when there is no worker to receive the cancel request', () => {
    expect(requestGenerationCancel(undefined, 'job-1')).toEqual({
      workerFound: false,
      cancelled: false
    })
  })
})
