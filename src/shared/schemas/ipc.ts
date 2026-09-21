import { z } from 'zod'
import { exportRequestSchema } from './export'
import { ipcSettingsSchema, modelListInputSchema } from './settings'
import { workbookListTabSchema } from './workbook'

const ipcIdentifierSchema = z.string().trim().min(1).max(512)
const ipcTextSchema = z.string().max(100_000)
const ipcShortTextSchema = z.string().max(4_096)
const ipcPathSchema = z.string().trim().min(1).max(4_096)

const boundedWorkbookSnapshotSchema = z
  .object({
    sourceText: ipcTextSchema,
    targetText: ipcTextSchema,
    gloss: ipcTextSchema,
    explanation: ipcTextSchema,
    contextText: ipcTextSchema,
    quizPrompt: ipcTextSchema,
    quizAnswer: ipcTextSchema,
    tags: z.array(ipcShortTextSchema).max(100),
    flagged: z.boolean().optional()
  })
  .strict()

export const noIpcInputSchema = z.undefined()

export const jobSnapshotInputSchema = z
  .object({ jobId: ipcIdentifierSchema })
  .strict()

export const sessionSearchInputSchema = z
  .object({
    query: z.string().max(4_096),
    scope: z.enum(['all', 'titles', 'transcript']),
    groupBy: z.enum(['platform', 'time', 'project']),
    timeRange: z
      .object({
        from: ipcShortTextSchema,
        to: ipcShortTextSchema
      })
      .strict()
      .nullable(),
    projects: z.array(ipcIdentifierSchema).max(5_000),
    platforms: z.array(z.enum(['codex', 'claude', 'opencode'])).max(3),
    includeArchived: z.boolean()
  })
  .strict()

export const sessionPreviewInputSchema = z
  .object({
    sessionId: ipcIdentifierSchema,
    query: z.string().max(4_096).default(''),
    scope: z.enum(['all', 'titles', 'transcript']).default('all')
  })
  .strict()

export const generationRunInputSchema = z
  .object({
    sessionIds: z.array(ipcIdentifierSchema).min(1).max(5_000),
    promptOverride: z.string().max(100_000).nullable().optional()
  })
  .strict()

export const generationJobInputSchema = z
  .object({ jobId: ipcIdentifierSchema })
  .strict()

export const workbookListInputSchema = z
  .object({
    workbookId: ipcIdentifierSchema,
    tab: workbookListTabSchema
  })
  .strict()

export const workbookPreviewSourceInputSchema = z
  .object({
    sessionId: ipcIdentifierSchema,
    sourceSpanRef: ipcShortTextSchema.nullable().optional(),
    highlightText: ipcTextSchema.nullable().optional()
  })
  .strict()

export const workbookSaveItemInputSchema = z
  .object({
    itemId: ipcIdentifierSchema,
    currentSnapshot: boundedWorkbookSnapshotSchema,
    baseVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
  })
  .strict()

export const workbookItemActionInputSchema = z
  .object({ itemId: ipcIdentifierSchema })
  .strict()

export const workbookRevertInputSchema = z
  .object({
    itemId: ipcIdentifierSchema,
    baseVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
  })
  .strict()

export const exportRunInputSchema = z
  .object({
    workbookId: ipcIdentifierSchema,
    request: exportRequestSchema
  })
  .strict()

export const exportChooseOutputDirectoryInputSchema = z
  .object({
    currentPath: ipcPathSchema.nullable().optional(),
    title: z.string().trim().min(1).max(256).optional()
  })
  .strict()

export const ipcSettingsSaveSchema = ipcSettingsSchema
export const ipcModelListInputSchema = modelListInputSchema.strict()

export type GenerationJobInput = z.infer<typeof generationJobInputSchema>
export type GenerationRunInput = z.infer<typeof generationRunInputSchema>
export type IpcModelListInput = z.infer<typeof ipcModelListInputSchema>
export type IpcSettings = z.infer<typeof ipcSettingsSaveSchema>
export type SessionPreviewInput = z.infer<typeof sessionPreviewInputSchema>
export type SessionSearchInput = z.infer<typeof sessionSearchInputSchema>
export type WorkbookListInput = z.infer<typeof workbookListInputSchema>
export type WorkbookPreviewSourceInput = z.infer<
  typeof workbookPreviewSourceInputSchema
>
export type WorkbookSaveItemInput = z.infer<typeof workbookSaveItemInputSchema>
export type WorkbookItemActionInput = z.infer<typeof workbookItemActionInputSchema>
export type WorkbookRevertInput = z.infer<typeof workbookRevertInputSchema>
export type ExportRunInput = z.infer<typeof exportRunInputSchema>
export type ExportChooseOutputDirectoryInput = z.infer<
  typeof exportChooseOutputDirectoryInputSchema
>
