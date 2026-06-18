import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APP_LOCALE,
  DEFAULT_CLI_TIMEOUT_MS,
  DEFAULT_EXPRESSION_DIFFICULTY,
  DEFAULT_SPLIT_RATIO,
  DEFAULT_WORKBOOK_SPLIT_RATIO,
  settingsSchema
} from '../../src/shared/schemas/settings'

const LEGACY_SETTINGS = {
  provider: {
    baseUrl: '',
    apiKey: '',
    defaultModel: ''
  },
  generation: {
    defaultLanguageDirection: 'bilingual',
    batchSize: 8,
    boundedConcurrency: 2,
    maxItemsPerSession: 50,
    typeBalanceProfile: {
      targetExpression: 0.6,
      targetSentence: 0.4,
      lambda: 0.1
    }
  },
  privacy: {
    redactBeforeRemoteSend: true,
    flaggedItemExportPolicy: 'warn'
  },
  scan: {
    pathOverrides: [],
    scanOnLaunch: true,
    includeArchivedSessions: false
  }
} as const

describe('settingsSchema', () => {
  it('adds compact layout and model backend defaults to legacy settings', () => {
    const parsed = settingsSchema.parse(LEGACY_SETTINGS)

    expect(DEFAULT_SPLIT_RATIO).toBe(0.3)
    expect(parsed.ui.locale).toBe(DEFAULT_APP_LOCALE)
    expect(parsed.ui.splitRatio).toBe(DEFAULT_SPLIT_RATIO)
    expect(parsed.ui.workbookSplitRatio).toBe(DEFAULT_WORKBOOK_SPLIT_RATIO)
    expect(parsed.ui.workbookSourcePinned).toBe(false)
    expect(parsed.generation.expressionDifficulty).toBe(DEFAULT_EXPRESSION_DIFFICULTY)
    expect(parsed.modelBackend).toMatchObject({
      kind: 'openai-compatible',
      cli: {
        codex: { executablePath: '', model: '' },
        claude: { executablePath: '', model: '' },
        opencode: { executablePath: '', model: '' },
        timeoutMs: DEFAULT_CLI_TIMEOUT_MS
      }
    })
  })

  it('rejects unknown expression difficulty values', () => {
    expect(() =>
      settingsSchema.parse({
        ...LEGACY_SETTINGS,
        generation: {
          ...LEGACY_SETTINGS.generation,
          expressionDifficulty: 'expert'
        }
      })
    ).toThrow()
  })

  it('rejects unknown app locale values', () => {
    expect(() =>
      settingsSchema.parse({
        ...LEGACY_SETTINGS,
        ui: {
          locale: 'fr'
        }
      })
    ).toThrow()
  })
})
