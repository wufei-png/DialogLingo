import { z } from 'zod'

export const DEFAULT_SPLIT_RATIO = 0.3
export const DEFAULT_WORKBOOK_SPLIT_RATIO = 0.65
export const MIN_SPLIT_RATIO = 0.16
export const MAX_SPLIT_RATIO = 0.7
export const DEFAULT_CLI_TIMEOUT_MS = 120_000
export const DEFAULT_EXPRESSION_DIFFICULTY = 'average'
export const DEFAULT_BATCH_SIZE = 8
export const DEFAULT_APP_LOCALE = 'en'

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
export const appLocaleSchema = z.enum(['en', 'zh-CN'])

const cliCommandSettingsSchema = z.object({
  executablePath: z.string().default(''),
  model: z.string().default('')
})

const cliModelDiscoverySettingsSchema = z.object({
  executablePath: z.string().default('')
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
    expressionDifficulty: expressionDifficultySchema.default(DEFAULT_EXPRESSION_DIFFICULTY),
    batchSize: z.number().int().positive().default(DEFAULT_BATCH_SIZE),
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
    locale: appLocaleSchema.default(DEFAULT_APP_LOCALE),
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
    locale: DEFAULT_APP_LOCALE,
    splitRatio: DEFAULT_SPLIT_RATIO,
    workbookSplitRatio: DEFAULT_WORKBOOK_SPLIT_RATIO,
    workbookSourcePinned: false
  })
})

export const modelOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string().optional()
})

export const modelListInputSchema = z.object({
  backendKind: modelBackendKindSchema,
  provider: z
    .object({
      baseUrl: z.string(),
      apiKey: z.string()
    })
    .optional(),
  cli: z
    .object({
      codex: cliModelDiscoverySettingsSchema.default({ executablePath: '' }),
      claude: cliModelDiscoverySettingsSchema.default({ executablePath: '' }),
      opencode: cliModelDiscoverySettingsSchema.default({ executablePath: '' }),
      timeoutMs: z.number().int().positive().default(DEFAULT_CLI_TIMEOUT_MS)
    })
    .optional()
})

export const modelListResultSchema = z.object({
  models: z.array(modelOptionSchema),
  message: z.string().nullable(),
  discoveredAt: z.string()
})

export type Settings = z.infer<typeof settingsSchema>
export type ModelBackendKind = z.infer<typeof modelBackendKindSchema>
export type ExpressionDifficulty = z.infer<typeof expressionDifficultySchema>
export type AppLocale = z.infer<typeof appLocaleSchema>
export type ModelOption = z.infer<typeof modelOptionSchema>
export type ModelListInput = z.infer<typeof modelListInputSchema>
export type ModelListResult = z.infer<typeof modelListResultSchema>
