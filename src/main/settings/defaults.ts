import type { Settings } from '../../shared/schemas/settings'
import {
  DEFAULT_EXPRESSION_DIFFICULTY,
  DEFAULT_MODEL_BACKEND,
  DEFAULT_SPLIT_RATIO,
  DEFAULT_WORKBOOK_SPLIT_RATIO
} from '../../shared/schemas/settings'

export const DEFAULT_SETTINGS: Settings = {
  provider: {
    baseUrl: '',
    apiKey: '',
    defaultModel: ''
  },
  modelBackend: {
    kind: DEFAULT_MODEL_BACKEND.kind,
    cli: {
      codex: {
        executablePath: DEFAULT_MODEL_BACKEND.cli.codex.executablePath,
        model: DEFAULT_MODEL_BACKEND.cli.codex.model
      },
      claude: {
        executablePath: DEFAULT_MODEL_BACKEND.cli.claude.executablePath,
        model: DEFAULT_MODEL_BACKEND.cli.claude.model
      },
      opencode: {
        executablePath: DEFAULT_MODEL_BACKEND.cli.opencode.executablePath,
        model: DEFAULT_MODEL_BACKEND.cli.opencode.model
      },
      timeoutMs: DEFAULT_MODEL_BACKEND.cli.timeoutMs
    }
  },
  generation: {
    defaultLanguageDirection: 'bilingual',
    expressionDifficulty: DEFAULT_EXPRESSION_DIFFICULTY,
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
  },
  ui: {
    splitRatio: DEFAULT_SPLIT_RATIO,
    workbookSplitRatio: DEFAULT_WORKBOOK_SPLIT_RATIO,
    workbookSourcePinned: false
  }
}
