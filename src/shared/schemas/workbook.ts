import { z } from 'zod'

export const workbookStatusSchema = z.enum(['draft', 'ready', 'failed', 'cancelled'])
export const workbookItemTypeSchema = z.enum(['Expression', 'Sentence'])
export const workbookItemStateSchema = z.enum(['active', 'deleted'])

export const workbookListTabSchema = z.enum(['all', 'expressions', 'sentences', 'deleted'])

export type WorkbookListTab = z.infer<typeof workbookListTabSchema>
