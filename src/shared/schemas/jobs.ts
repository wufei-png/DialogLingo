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

export const generationJobSnapshotSchema = z.object({
  id: z.string(),
  status: generationJobStatusSchema,
  selectedSessionCount: z.number().int().nonnegative(),
  processedSessionCount: z.number().int().nonnegative(),
  createdItemCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative()
})

export type GenerationJobSnapshot = z.infer<typeof generationJobSnapshotSchema>
