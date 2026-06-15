import { z } from 'zod'

export const exportFormatSchema = z.enum([
  'anki-package',
  'anki-text-bundle',
  'generic-text-bundle'
])

export const exportRequestSchema = z.object({
  format: exportFormatSchema,
  deckName: z.string(),
  direction: z.enum(['en-zh', 'zh-en', 'bilingual']),
  includeExpressions: z.boolean(),
  includeSentences: z.boolean(),
  tagPrefix: z.string(),
  outputLocation: z.string(),
  keepFlaggedItems: z.boolean().default(false)
})

export type ExportRequest = z.infer<typeof exportRequestSchema>
