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
