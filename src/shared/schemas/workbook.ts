import { z } from 'zod'

export const workbookStatusSchema = z.enum(['draft', 'ready', 'failed', 'cancelled'])
export const workbookItemTypeSchema = z.enum(['Expression', 'Sentence'])
export const workbookItemStateSchema = z.enum(['active', 'deleted'])

export const workbookListTabSchema = z.enum(['all', 'expressions', 'sentences', 'deleted'])

export const workbookSourceRefSchema = z.object({
  sessionId: z.string(),
  sourceSpanRef: z.string(),
  excerpt: z.string()
})

export const workbookItemSchema = z.object({
  id: z.string(),
  workbookId: z.string(),
  itemType: workbookItemTypeSchema,
  state: workbookItemStateSchema,
  generatedSnapshot: z.record(z.any()),
  currentSnapshot: z.record(z.any()),
  sourceRefs: z.array(workbookSourceRefSchema)
})

export type WorkbookListTab = z.infer<typeof workbookListTabSchema>
