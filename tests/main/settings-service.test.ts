import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { unlinkSync } from 'node:fs'
import {
  DEFAULT_APP_LOCALE,
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
        locale: DEFAULT_APP_LOCALE,
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

  it('persists real-backed generation, privacy, and scan settings', () => {
    const service = createSettingsService(':memory:', { runMigrations: true })
    const current = service.get()

    const saved = service.save({
      ...current,
      generation: {
        ...current.generation,
        batchSize: 16,
        boundedConcurrency: current.generation.boundedConcurrency,
        maxItemsPerSession: 12,
        typeBalanceProfile: {
          targetExpression: 0.7,
          targetSentence: 0.3,
          lambda: 0.25
        }
      },
      privacy: {
        ...current.privacy,
        redactBeforeRemoteSend: false,
        flaggedItemExportPolicy: 'block'
      },
      scan: {
        ...current.scan,
        scanOnLaunch: false,
        includeArchivedSessions: true
      }
    })

    expect(saved.generation).toMatchObject({
      batchSize: 16,
      boundedConcurrency: current.generation.boundedConcurrency,
      maxItemsPerSession: 12,
      typeBalanceProfile: {
        targetExpression: 0.7,
        targetSentence: 0.3,
        lambda: 0.25
      }
    })
    expect(saved.privacy.flaggedItemExportPolicy).toBe('block')
    expect(service.get().privacy.redactBeforeRemoteSend).toBe(false)
    expect(saved.scan).toMatchObject({
      scanOnLaunch: false,
      includeArchivedSessions: true
    })
    expect(service.get()).toEqual(saved)
  })

  it('retains the privacy switch after reopening the settings database', () => {
    const filename = `${process.env.TMPDIR ?? '/tmp'}/dialoglingo-settings-${randomUUID()}.db`
    let first: ReturnType<typeof createSettingsService> | undefined
    let reopened: ReturnType<typeof createSettingsService> | undefined
    try {
      first = createSettingsService(filename, { runMigrations: true })
      first.save({
        ...first.get(),
        privacy: { ...first.get().privacy, redactBeforeRemoteSend: false }
      })
      reopened = createSettingsService(filename)
      expect(reopened.get().privacy.redactBeforeRemoteSend).toBe(false)
    } finally {
      reopened?.close()
      first?.close()
      // The database is only a synthetic settings fixture.
      unlinkSync(filename)
    }
  })

  it('persists the selected app locale', () => {
    const service = createSettingsService(':memory:', { runMigrations: true })
    const current = service.get()

    const saved = service.save({
      ...current,
      ui: {
        ...current.ui,
        locale: 'zh-CN'
      }
    })

    expect(saved.ui.locale).toBe('zh-CN')
    expect(service.get().ui.locale).toBe('zh-CN')
  })
})
