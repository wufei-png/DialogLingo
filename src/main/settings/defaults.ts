import type { Settings } from '../../shared/schemas/settings'

export const DEFAULT_SETTINGS: Settings = {
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
}
