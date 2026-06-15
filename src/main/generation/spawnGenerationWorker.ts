import { Worker } from 'node:worker_threads'

export function spawnGenerationWorker(onEvent: (event: unknown) => void) {
  const worker = new Worker(new URL('./worker.js', import.meta.url))
  worker.on('message', onEvent)
  return worker
}
