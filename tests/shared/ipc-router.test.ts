import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/main/settings/defaults'
import { buildRouter, type RouterDeps } from '../../src/shared/ipc/router'
import type { ExportRunInput, IpcSettings } from '../../src/shared/schemas/ipc'

const snapshot = {
  sourceText: 'source',
  targetText: 'target',
  gloss: 'gloss',
  explanation: 'explanation',
  contextText: 'context',
  quizPrompt: 'quiz',
  quizAnswer: 'answer',
  tags: ['tag']
}

function createDeps() {
  const settingsSave = vi.fn((next: IpcSettings) => next)
  const exportRun = vi.fn(async (input: ExportRunInput) => ({
    ok: true,
    input
  }))
  const workbookSaveItem = vi.fn(async (input: Parameters<RouterDeps['workbook']['saveItem']>[0]) => input)

  const deps: RouterDeps = {
    settings: {
      get: () => DEFAULT_SETTINGS,
      save: settingsSave,
      reset: () => DEFAULT_SETTINGS
    },
    modelCatalog: {
      list: vi.fn(async () => ({ models: [], message: null, discoveredAt: 'now' }))
    },
    jobs: {
      getSnapshot: vi.fn(() => ({ id: 'job', status: 'pending' }))
    },
    sessions: {
      search: vi.fn(() => []),
      preview: vi.fn(() => ({})),
      rescan: vi.fn(async () => ({ ok: true }))
    },
    projects: {
      list: vi.fn(() => [])
    },
    scan: {
      getLaunchStatus: vi.fn(() => ({
        phase: 'idle' as const,
        scanOnLaunch: true,
        hasIndexedSessions: false,
        failureMessage: null,
        launchPlan: null
      }))
    },
    generation: {
      previewPrompt: vi.fn(async () => ({})),
      start: vi.fn(async () => ({})),
      resume: vi.fn(async () => ({})),
      restart: vi.fn(async () => ({})),
      cancel: vi.fn(async () => ({}))
    },
    workbook: {
      list: vi.fn(() => []),
      previewSource: vi.fn(() => ({})),
      saveItem: workbookSaveItem,
      deleteItem: vi.fn(async () => ({})),
      restoreItem: vi.fn(async () => ({})),
      revertItem: vi.fn(async () => ({}))
    },
    exportRuns: {
      run: exportRun,
      defaultOutputLocation: vi.fn(() => '/tmp'),
      chooseOutputDirectory: vi.fn(async () => ({
        cancelled: true,
        outputLocation: null
      }))
    }
  }

  return { deps, exportRun, workbookSaveItem, settingsSave }
}

const authorized = {
  ipc: { authorized: true, reason: null }
}

describe('privileged IPC router', () => {
  it('rejects an unauthorized context before a service is called', async () => {
    const { deps } = createDeps()
    const router = buildRouter(deps)
    const caller = router.createCaller({
      ipc: { authorized: false, reason: 'unknown-webContents' }
    })

    await expect(caller.appHealth()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(deps.projects.list).not.toHaveBeenCalled()
  })

  it('rejects extra export fields before the export service is called', async () => {
    const { deps, exportRun } = createDeps()
    const router = buildRouter(deps)
    const caller = router.createCaller(authorized)

    await expect(
      caller.exportRun({
        workbookId: 'workbook-1',
        request: {
          format: 'anki-text-bundle',
          deckName: 'DialogLingo',
          direction: 'bilingual',
          includeExpressions: true,
          includeSentences: true,
          tagPrefix: 'dialoglingo',
          outputLocation: '/tmp',
          unexpected: 'do not accept'
        } as never
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(exportRun).not.toHaveBeenCalled()
  })

  it('rejects extra top-level settings fields before persistence', async () => {
    const { deps } = createDeps()
    const router = buildRouter(deps)
    const caller = router.createCaller(authorized)

    await expect(
      caller.settingsSave({ ...DEFAULT_SETTINGS, unexpected: true } as never)
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(deps.settings.save).not.toHaveBeenCalled()
  })

  it('rejects settings values outside the IPC bounds before persistence', async () => {
    const { deps } = createDeps()
    const router = buildRouter(deps)
    const caller = router.createCaller(authorized)

    await expect(
      caller.settingsSave({
        ...DEFAULT_SETTINGS,
        generation: {
          ...DEFAULT_SETTINGS.generation,
          boundedConcurrency: 65
        }
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(deps.settings.save).not.toHaveBeenCalled()
  })

  it('bounds workbook snapshots and still passes valid workbook and export calls', async () => {
    const { deps, exportRun, workbookSaveItem } = createDeps()
    const router = buildRouter(deps)
    const caller = router.createCaller(authorized)

    await expect(
      caller.workbookSaveItem({
        itemId: 'item-1',
        currentSnapshot: { ...snapshot, unexpected: 'reject me' } as never,
        baseVersion: 0
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(workbookSaveItem).not.toHaveBeenCalled()

    await caller.workbookSaveItem({
      itemId: 'item-1',
      currentSnapshot: snapshot,
      baseVersion: 0
    })
    expect(workbookSaveItem).toHaveBeenCalledOnce()

    await caller.exportRun({
      workbookId: 'workbook-1',
      request: {
        format: 'anki-text-bundle',
        deckName: 'DialogLingo',
        direction: 'bilingual',
        includeExpressions: true,
        includeSentences: true,
        tagPrefix: 'dialoglingo',
        outputLocation: '/tmp'
      }
    })
    expect(exportRun).toHaveBeenCalledOnce()
  })
})
