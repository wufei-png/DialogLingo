import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow } from 'electron'
import { createIPCHandler } from 'electron-trpc/main'
import { buildRouter } from '../shared/ipc/router'
import { createSettingsService } from './settings/service'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const settings = createSettingsService('dialoglingo.db', {
  runMigrations: true
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    title: 'DialogLingo',
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js')
    }
  })

  const router = buildRouter({
    settings,
    jobs: {
      getSnapshot(jobId: string) {
        return {
          id: jobId,
          status: 'pending',
          selectedSessionCount: 0,
          processedSessionCount: 0,
          createdItemCount: 0,
          warningCount: 0,
          failureCount: 0
        }
      }
    },
    sessions: {
      search: () => [],
      preview: () => ({ turns: [], snippet: null }),
      rescan: async () => ({
        ok: true as const,
        rescannedAt: new Date().toISOString()
      })
    },
    generation: {
      start: async (input: { sessionIds: string[] }) => ({
        jobId: 'pending-job',
        requestedSessionIds: input.sessionIds
      }),
      cancel: async (input: { jobId: string }) => ({
        ok: true as const,
        jobId: input.jobId
      })
    },
    workbook: {
      list: () => [],
      saveItem: async (input: { itemId: string }) => ({
        ok: true as const,
        itemId: input.itemId
      }),
      deleteItem: async (input: { itemId: string }) => ({
        ok: true as const,
        itemId: input.itemId
      }),
      restoreItem: async (input: { itemId: string }) => ({
        ok: true as const,
        itemId: input.itemId
      }),
      revertItem: async (input: { itemId: string }) => ({
        ok: true as const,
        itemId: input.itemId
      })
    },
    exportRuns: {
      run: async (input: { workbookId: string }) => ({
        ok: true as const,
        workbookId: input.workbookId
      })
    }
  })

  createIPCHandler({
    router,
    windows: [win]
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
