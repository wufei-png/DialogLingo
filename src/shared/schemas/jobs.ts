import { z } from 'zod'

export const generationJobStatusSchema = z.enum([
  'pending',
  'normalizing',
  'mining',
  'enriching',
  'ranking',
  'materializing',
  'completed',
  'failed',
  'cancelled'
])

export const generationBatchExcerptSchema = z.object({
  id: z.string(),
  sessionTitle: z.string(),
  role: z.enum(['user', 'assistant']).optional(),
  promptText: z.string()
})

export const generationInputBatchSchema = z.object({
  batchIndex: z.number().int().nonnegative(),
  excerpts: z.array(generationBatchExcerptSchema)
})

export const generationJobSnapshotSchema = z.object({
  id: z.string(),
  status: generationJobStatusSchema,
  selectedSessionCount: z.number().int().nonnegative(),
  processedSessionCount: z.number().int().nonnegative(),
  createdItemCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  currentSessionTitle: z.string().nullable().optional(),
  currentBatchLabel: z.string().nullable().optional(),
  currentBatchIndex: z.number().int().nonnegative().nullable().optional(),
  completedBatchCount: z.number().int().nonnegative().optional(),
  totalBatchCount: z.number().int().nonnegative().optional(),
  candidateCount: z.number().int().nonnegative().optional(),
  batchSize: z.number().int().positive().optional(),
  inputBatches: z.array(generationInputBatchSchema).optional(),
  lastCheckpoint: z.string().nullable().optional(),
  failedBatchCount: z.number().int().nonnegative().optional(),
  failureReason: z.string().nullable().optional(),
  canResume: z.boolean().optional(),
  resumeBlockedReason: z.string().nullable().optional()
})

export type GenerationJobSnapshot = z.infer<typeof generationJobSnapshotSchema>
export type GenerationInputBatch = z.infer<typeof generationInputBatchSchema>
