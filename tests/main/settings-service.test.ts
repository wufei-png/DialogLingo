import { describe, expect, it } from 'vitest'
import {
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
        batchSize: 8,
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
})
