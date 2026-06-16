import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  main: {
    build: {
      outDir: 'dist-electron/main',
      rollupOptions: {
        input: {
          index: path.resolve(rootDir, 'src/main/index.ts'),
          worker: path.resolve(rootDir, 'src/main/generation/worker.ts')
        },
        output: {
          entryFileNames: '[name].js'
        }
      }
    }
  },
  preload: {
    build: {
      outDir: 'dist-electron/preload',
      externalizeDeps: false,
      rollupOptions: {
        external: ['electron'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': path.resolve(rootDir, 'src/renderer/src'),
        '@shared': path.resolve(rootDir, 'src/shared')
      }
    },
    plugins: [react()]
  }
})
