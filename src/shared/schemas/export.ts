import { z } from 'zod'

export const exportFormatSchema = z.enum([
  'anki-package',
  'anki-text-bundle',
  'generic-text-bundle'
])

export const exportRequestSchema = z.object({
  format: exportFormatSchema,
  deckName: z.string().trim().min(1).max(256),
  outputName: z.string().trim().min(1).max(256).optional(),
  direction: z.enum(['en-zh', 'zh-en', 'bilingual']),
  includeExpressions: z.boolean(),
  includeSentences: z.boolean(),
  tagPrefix: z.string().max(256),
  outputLocation: z.string().trim().min(1).max(4_096),
  keepFlaggedItems: z.boolean().default(false)
}).strict()

export type ExportRequest = z.infer<typeof exportRequestSchema>
