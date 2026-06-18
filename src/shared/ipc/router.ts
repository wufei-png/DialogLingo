import { initTRPC } from '@trpc/server'
import { z } from 'zod'
import { settingsSchema } from '../schemas/settings'
import { workbookListTabSchema } from '../schemas/workbook'

const t = initTRPC.create()

export type RouterDeps = {
  settings: {
    get: () => unknown
    save: (next: any) => unknown
    reset: () => unknown
  }
  jobs: {
    getSnapshot: (jobId: string) => unknown
  }
  sessions: {
    search: (input: any) => unknown
    preview: (input: any) => unknown
    rescan: () => Promise<unknown>
  }
  projects: {
    list: () => unknown
  }
  scan: {
    getLaunchStatus: () => {
      phase: 'idle' | 'scanning' | 'completed' | 'failed'
      scanOnLaunch: boolean
      failureMessage: string | null
      launchPlan: {
        shouldScanOnLaunch: boolean
        selectedProjectIds: string[]
        focusedSessionId: string | null
        collapsedGroupIds: string[]
      } | null
    }
  }
  generation: {
    previewPrompt: (input: any) => Promise<unknown>
    start: (input: any) => Promise<unknown>
    resume: (input: any) => Promise<unknown>
    restart: (input: any) => Promise<unknown>
    cancel: (input: any) => Promise<unknown>
  }
  workbook: {
    list: (input: any) => unknown
    previewSource: (input: any) => unknown
    saveItem: (input: any) => Promise<unknown>
    deleteItem: (input: any) => Promise<unknown>
    restoreItem: (input: any) => Promise<unknown>
    revertItem: (input: any) => Promise<unknown>
  }
  exportRuns: {
    run: (input: any) => Promise<unknown>
  }
}

export function buildRouter(deps: RouterDeps) {
  return t.router({
    settingsGet: t.procedure.query(() => deps.settings.get()),
    settingsSave: t.procedure
      .input(settingsSchema)
      .mutation(({ input }) => deps.settings.save(input)),
    settingsReset: t.procedure.mutation(() => deps.settings.reset()),
    jobSnapshot: t.procedure
      .input(z.object({ jobId: z.string() }))
      .query(({ input }) => deps.jobs.getSnapshot(input.jobId)),
    sessionSearch: t.procedure
      .input(
        z.object({
          query: z.string(),
          scope: z.enum(['all', 'titles', 'transcript']),
          groupBy: z.enum(['platform', 'time', 'project']),
          timeRange: z.object({ from: z.string(), to: z.string() }).nullable(),
          projects: z.array(z.string()),
          platforms: z.array(z.enum(['codex', 'claude', 'opencode'])),
          includeArchived: z.boolean()
        })
      )
      .query(({ input }) => deps.sessions.search(input)),
    sessionPreview: t.procedure
      .input(
        z.object({
          sessionId: z.string(),
          query: z.string().default(''),
          scope: z.enum(['all', 'titles', 'transcript']).default('all')
        })
      )
      .query(({ input }) => deps.sessions.preview(input)),
    sessionRescan: t.procedure.mutation(() => deps.sessions.rescan()),
    projectsList: t.procedure.query(() => deps.projects.list()),
    launchScanStatus: t.procedure.query(() => deps.scan.getLaunchStatus()),
    generationPromptPreview: t.procedure
      .input(z.object({ sessionIds: z.array(z.string()) }))
      .query(({ input }) => deps.generation.previewPrompt(input)),
    generationStart: t.procedure
      .input(
        z.object({
          sessionIds: z.array(z.string()),
          promptOverride: z.string().nullable().optional()
        })
      )
      .mutation(({ input }) => deps.generation.start(input)),
    generationResume: t.procedure
      .input(z.object({ jobId: z.string() }))
      .mutation(({ input }) => deps.generation.resume(input)),
    generationRestart: t.procedure
      .input(z.object({ jobId: z.string() }))
      .mutation(({ input }) => deps.generation.restart(input)),
    generationCancel: t.procedure
      .input(z.object({ jobId: z.string() }))
      .mutation(({ input }) => deps.generation.cancel(input)),
    workbookList: t.procedure
      .input(z.object({ workbookId: z.string(), tab: workbookListTabSchema }))
      .query(({ input }) => deps.workbook.list(input)),
    workbookPreviewSource: t.procedure
      .input(
        z.object({
          sessionId: z.string(),
          sourceSpanRef: z.string().nullable().optional(),
          highlightText: z.string().nullable().optional()
        })
      )
      .query(({ input }) => deps.workbook.previewSource(input)),
    workbookSaveItem: t.procedure
      .input(z.object({ itemId: z.string(), currentSnapshot: z.any() }))
      .mutation(({ input }) => deps.workbook.saveItem(input)),
    workbookDeleteItem: t.procedure
      .input(z.object({ itemId: z.string() }))
      .mutation(({ input }) => deps.workbook.deleteItem(input)),
    workbookRestoreItem: t.procedure
      .input(z.object({ itemId: z.string() }))
      .mutation(({ input }) => deps.workbook.restoreItem(input)),
    workbookRevertItem: t.procedure
      .input(z.object({ itemId: z.string() }))
      .mutation(({ input }) => deps.workbook.revertItem(input)),
    exportRun: t.procedure
      .input(z.object({ workbookId: z.string(), request: z.any() }))
      .mutation(({ input }) => deps.exportRuns.run(input)),
    appHealth: t.procedure.query(() => ({ ok: true as const }))
  })
}

export type AppRouter = ReturnType<typeof buildRouter>
