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

// Source text anchors the provenance highlight, so it travels with a snapshot
// but is never accepted as an editable value by the workbook service.
export const workbookSnapshotSchema = z.object({
  sourceText: z.string(),
  targetText: z.string(),
  gloss: z.string(),
  explanation: z.string(),
  contextText: z.string(),
  quizPrompt: z.string(),
  quizAnswer: z.string(),
  tags: z.array(z.string()),
  flagged: z.boolean().optional()
}).strict()

export const workbookItemSchema = z.object({
  id: z.string(),
  workbookId: z.string(),
  itemType: workbookItemTypeSchema,
  state: workbookItemStateSchema,
  generatedSnapshot: workbookSnapshotSchema,
  currentSnapshot: workbookSnapshotSchema,
  sourceRefs: z.array(workbookSourceRefSchema),
  editVersion: z.number().int().nonnegative()
})

export type WorkbookListTab = z.infer<typeof workbookListTabSchema>
export type WorkbookSnapshot = z.infer<typeof workbookSnapshotSchema>
