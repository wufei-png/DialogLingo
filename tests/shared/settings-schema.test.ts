import { describe, expect, it } from 'vitest'
import { DEFAULT_SPLIT_RATIO, settingsSchema } from '../../src/shared/schemas/settings'

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
  it('adds a compact 1:4 split ratio default to legacy settings', () => {
    const parsed = settingsSchema.parse(LEGACY_SETTINGS)

    expect(DEFAULT_SPLIT_RATIO).toBe(0.2)
    expect(parsed.ui.splitRatio).toBe(DEFAULT_SPLIT_RATIO)
  })
})
