import { contextBridge, ipcRenderer } from 'electron'
import { exposeElectronTRPC } from 'electron-trpc/main'
import { jobEventSchema } from '../shared/ipc/events'

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
