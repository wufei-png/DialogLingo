import { createRequire } from 'node:module'
import { contextBridge, ipcRenderer } from 'electron'
import { jobEventSchema } from '../shared/ipc/events'

const require = createRequire(import.meta.url)
const { exposeElectronTRPC } = require('electron-trpc/main') as {
  exposeElectronTRPC: () => void
}

process.once('loaded', () => {
  exposeElectronTRPC()

  contextBridge.exposeInMainWorld('dialoglingoJobs', {
    subscribe(callback: (event: unknown) => void) {
      const handler = (_event: unknown, payload: unknown) => {
        callback(jobEventSchema.parse(payload))
      }

      ipcRenderer.on('dialoglingo:job-event', handler)

      return () => {
        ipcRenderer.removeListener('dialoglingo:job-event', handler)
      }
    }
  })
})
