import { z } from 'zod'

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
  })
})

export type Settings = z.infer<typeof settingsSchema>
