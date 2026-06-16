import { z } from 'zod'

export const DEFAULT_SPLIT_RATIO = 0.2
export const MIN_SPLIT_RATIO = 0.16
export const MAX_SPLIT_RATIO = 0.7

export const settingsSchema = z.object({
  provider: z.object({
    baseUrl: z.string(),
    apiKey: z.string(),
    defaultModel: z.string()
  }),
  generation: z.object({
    defaultLanguageDirection: z.enum(['en-zh', 'zh-en', 'bilingual']),
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
      .default(DEFAULT_SPLIT_RATIO)
  }).default({
    splitRatio: DEFAULT_SPLIT_RATIO
  })
})

export type Settings = z.infer<typeof settingsSchema>
