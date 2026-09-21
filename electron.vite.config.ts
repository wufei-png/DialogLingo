import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import {
  DEVELOPMENT_CONTENT_SECURITY_POLICY,
  PACKAGED_CONTENT_SECURITY_POLICY
} from './src/shared/security/csp'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

function contentSecurityPolicyPlugin(isDevelopment: boolean): Plugin {
  const policy = isDevelopment
    ? DEVELOPMENT_CONTENT_SECURITY_POLICY
    : PACKAGED_CONTENT_SECURITY_POLICY

  return {
    name: 'dialoglingo-content-security-policy',
    transformIndexHtml(html) {
      return html.replace('__DIALOG_LINGO_CONTENT_SECURITY_POLICY__', policy)
    }
  }
}

export default defineConfig(({ command }) => ({
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
    build: {
      outDir: 'dist-electron/renderer'
    },
    resolve: {
      alias: {
        '@renderer': path.resolve(rootDir, 'src/renderer/src'),
        '@shared': path.resolve(rootDir, 'src/shared')
      }
    },
    plugins: [react(), contentSecurityPolicyPlugin(command === 'serve')]
  }
}))
