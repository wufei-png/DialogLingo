import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_EXPRESSION_DIFFICULTY,
  DEFAULT_SPLIT_RATIO,
  DEFAULT_WORKBOOK_SPLIT_RATIO
} from '../../src/shared/schemas/settings'
import { createSettingsService } from '../../src/main/settings/service'

describe('createSettingsService', () => {
  it('returns defaults when the database is empty', () => {
    const service = createSettingsService(':memory:', { runMigrations: true })

    expect(service.get()).toMatchObject({
      provider: { baseUrl: '', apiKey: '', defaultModel: '' },
      modelBackend: {
        kind: 'openai-compatible',
        cli: {
          timeoutMs: 120000
        }
      },
      generation: {
        expressionDifficulty: DEFAULT_EXPRESSION_DIFFICULTY,
        batchSize: DEFAULT_BATCH_SIZE,
        boundedConcurrency: 2,
        maxItemsPerSession: 50
      },
      privacy: {
        redactBeforeRemoteSend: true,
        flaggedItemExportPolicy: 'warn'
      },
      scan: {
        scanOnLaunch: true,
        includeArchivedSessions: false
      },
      ui: {
        splitRatio: DEFAULT_SPLIT_RATIO,
        workbookSplitRatio: DEFAULT_WORKBOOK_SPLIT_RATIO,
        workbookSourcePinned: false
      }
    })
  })

  it('resets persisted settings to defaults', () => {
    const service = createSettingsService(':memory:', { runMigrations: true })

    service.save({
      ...service.get(),
      provider: {
        baseUrl: 'https://example.com',
        apiKey: 'sk-test',
        defaultModel: 'gpt-test'
      },
      generation: {
        ...service.get().generation,
        batchSize: 4
      }
    })

    const reset = service.reset()

    expect(reset).toMatchObject({
      provider: { baseUrl: '', apiKey: '', defaultModel: '' },
      generation: { batchSize: DEFAULT_BATCH_SIZE }
    })
    expect(service.get()).toEqual(reset)
  })
})
