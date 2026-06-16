import { z } from 'zod'
import { generationJobStatusSchema } from '../schemas/jobs'

export const jobEventSchema = z.object({
  kind: z.enum(['snapshot', 'phase', 'warning', 'failure', 'completed']),
  jobId: z.string(),
  status: generationJobStatusSchema,
  totalSelectedSessionCount: z.number().int().nonnegative(),
  processedSessionCount: z.number().int().nonnegative(),
  createdItemCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  currentSessionTitle: z.string().nullable(),
  currentBatchLabel: z.string().nullable()
})

export type JobEvent = z.infer<typeof jobEventSchema>

export const scanPhaseSchema = z.enum(['idle', 'scanning', 'completed', 'failed'])

export const scanEventSchema = z.object({
  phase: scanPhaseSchema,
  source: z.enum(['launch', 'manual']).optional(),
  sessionCount: z.number().int().nonnegative().optional(),
  projectCount: z.number().int().nonnegative().optional(),
  message: z.string().optional()
})

export type ScanEvent = z.infer<typeof scanEventSchema>
