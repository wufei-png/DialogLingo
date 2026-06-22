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
  currentBatchLabel: z.string().nullable(),
  lastCheckpoint: z.string().nullable().optional(),
  canResume: z.boolean().optional(),
  resumeBlockedReason: z.string().nullable().optional(),
  failedBatchCount: z.number().int().nonnegative().optional(),
  failureReason: z
    .enum([
      'missing-provider-config',
      'provider-timeout',
      'model-request-failure',
      'invalid-structured-payload'
    ])
    .nullable()
    .optional()
})

export type JobEvent = z.infer<typeof jobEventSchema>

export const scanPhaseSchema = z.enum(['idle', 'scanning', 'completed', 'failed'])

export const launchPlanSchema = z.object({
  shouldScanOnLaunch: z.boolean(),
  selectedProjectIds: z.array(z.string()),
  focusedSessionId: z.string().nullable(),
  collapsedGroupIds: z.array(z.string())
})

export type LaunchPlan = z.infer<typeof launchPlanSchema>

export const scanEventSchema = z.object({
  phase: scanPhaseSchema,
  source: z.enum(['launch', 'manual']).optional(),
  sessionCount: z.number().int().nonnegative().optional(),
  projectCount: z.number().int().nonnegative().optional(),
  message: z.string().optional(),
  launchPlan: launchPlanSchema.optional()
})

export type ScanEvent = z.infer<typeof scanEventSchema>

export const launchScanStatusSchema = z.object({
  phase: scanPhaseSchema,
  scanOnLaunch: z.boolean(),
  hasIndexedSessions: z.boolean(),
  failureMessage: z.string().nullable(),
  launchPlan: launchPlanSchema.nullable()
})

export type LaunchScanStatus = z.infer<typeof launchScanStatusSchema>
