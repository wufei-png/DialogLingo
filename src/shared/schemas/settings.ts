import { z } from 'zod'

export const DEFAULT_SPLIT_RATIO = 0.2
export const DEFAULT_WORKBOOK_SPLIT_RATIO = 0.65
export const MIN_SPLIT_RATIO = 0.16
export const MAX_SPLIT_RATIO = 0.7
export const DEFAULT_CLI_TIMEOUT_MS = 120_000
export const DEFAULT_EXPRESSION_DIFFICULTY = 'average'

export const DEFAULT_MODEL_BACKEND = {
  kind: 'openai-compatible',
  cli: {
    codex: {
      executablePath: '',
      model: ''
    },
    claude: {
      executablePath: '',
      model: ''
    },
    opencode: {
      executablePath: '',
      model: ''
    },
    timeoutMs: DEFAULT_CLI_TIMEOUT_MS
  }
} as const

export const modelBackendKindSchema = z.enum([
  'openai-compatible',
  'codex-cli',
  'claude-cli',
  'opencode-cli'
])
export const expressionDifficultySchema = z.enum(['easy', 'average', 'hard'])

const cliCommandSettingsSchema = z.object({
  executablePath: z.string().default(''),
  model: z.string().default('')
})

export const modelBackendSchema = z
  .object({
    kind: modelBackendKindSchema.default(DEFAULT_MODEL_BACKEND.kind),
    cli: z
      .object({
        codex: cliCommandSettingsSchema.default(DEFAULT_MODEL_BACKEND.cli.codex),
        claude: cliCommandSettingsSchema.default(DEFAULT_MODEL_BACKEND.cli.claude),
        opencode: cliCommandSettingsSchema.default(DEFAULT_MODEL_BACKEND.cli.opencode),
        timeoutMs: z.number().int().positive().default(DEFAULT_CLI_TIMEOUT_MS)
      })
      .default(DEFAULT_MODEL_BACKEND.cli)
  })
  .default(DEFAULT_MODEL_BACKEND)

export const settingsSchema = z.object({
  provider: z.object({
    baseUrl: z.string(),
    apiKey: z.string(),
    defaultModel: z.string()
  }),
  modelBackend: modelBackendSchema,
  generation: z.object({
    defaultLanguageDirection: z.enum(['en-zh', 'zh-en', 'bilingual']),
    expressionDifficulty: expressionDifficultySchema.default(DEFAULT_EXPRESSION_DIFFICULTY),
    batchSize: z.number().int().positive(),
    boundedConcurrency: z.number().int().positive(),
    maxItemsPerSession: z.number().int().positive(),
    typeBalanceProfile: z.object({
      targetExpression: z.number().min(0).max(1),
      targetSentence: z.number().min(0).max(1),
      lambda: z.number().min(0)
    })
  }),
  privacy: z.object({
    redactBeforeRemoteSend: z.boolean(),
    flaggedItemExportPolicy: z.enum(['block', 'warn'])
  }),
  scan: z.object({
    pathOverrides: z.array(
      z.object({
        platform: z.string(),
        path: z.string()
      })
    ),
    scanOnLaunch: z.boolean(),
    includeArchivedSessions: z.boolean()
  }),
  ui: z.object({
    splitRatio: z
      .number()
      .min(MIN_SPLIT_RATIO)
      .max(MAX_SPLIT_RATIO)
      .default(DEFAULT_SPLIT_RATIO),
    workbookSplitRatio: z
      .number()
      .min(MIN_SPLIT_RATIO)
      .max(MAX_SPLIT_RATIO)
      .default(DEFAULT_WORKBOOK_SPLIT_RATIO),
    workbookSourcePinned: z.boolean().default(false)
  }).default({
    splitRatio: DEFAULT_SPLIT_RATIO,
    workbookSplitRatio: DEFAULT_WORKBOOK_SPLIT_RATIO,
    workbookSourcePinned: false
  })
})

export type Settings = z.infer<typeof settingsSchema>
export type ModelBackendKind = z.infer<typeof modelBackendKindSchema>
export type ExpressionDifficulty = z.infer<typeof expressionDifficultySchema>
