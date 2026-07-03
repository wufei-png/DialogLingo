import { describe, expect, it } from 'vitest'
import {
  getWorkbookActiveProgressPercent,
  getProgressPercent,
  getWorkbookProgressPercent
} from '../../src/renderer/src/features/workbook/workbookProgressModel'

describe('workbookProgressModel', () => {
  it('clamps basic progress percentages', () => {
    expect(getProgressPercent(1, 4)).toBe(25)
    expect(getProgressPercent(5, 4)).toBe(100)
    expect(getProgressPercent(1, 0)).toBe(0)
  })

  it('uses session progress before LLM enrichment batches exist', () => {
    expect(
      getWorkbookProgressPercent({
        status: 'mining',
        processedSessionCount: 1,
        selectedSessionCount: 4,
        completedBatchCount: 0,
        totalBatchCount: 3
      })
    ).toBe(25)
  })

  it('uses completed LLM batches once enrichment starts', () => {
    expect(
      getWorkbookProgressPercent({
        status: 'enriching',
        processedSessionCount: 4,
        selectedSessionCount: 4,
        completedBatchCount: 1,
        totalBatchCount: 4
      })
    ).toBe(25)
  })

  it('can show the active batch extent separately from completed progress', () => {
    const snapshot = {
      status: 'enriching',
      processedSessionCount: 1,
      selectedSessionCount: 1,
      completedBatchCount: 3,
      totalBatchCount: 5,
      currentBatchIndex: 3
    }

    expect(getWorkbookProgressPercent(snapshot)).toBe(60)
    expect(getWorkbookActiveProgressPercent(snapshot)).toBe(80)
  })
})
