import { describe, expect, it } from 'vitest'
import { DEFAULT_SPLIT_RATIO } from '../../src/shared/schemas/settings'
import { createSettingsService } from '../../src/main/settings/service'

describe('createSettingsService', () => {
  it('returns defaults when the database is empty', () => {
    const service = createSettingsService(':memory:', { runMigrations: true })

    expect(service.get()).toMatchObject({
      provider: { baseUrl: '', apiKey: '', defaultModel: '' },
      generation: {
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
        splitRatio: DEFAULT_SPLIT_RATIO
      }
    })
  })
})
