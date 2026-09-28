import fs, { promises as fsPromises } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

export const OPENCODE_OUTPUT_LIMIT_BYTES = 32 * 1024 * 1024
export const OPENCODE_COMMAND_TIMEOUT_MS = 15_000

export type OpenCodeCommandResult = {
  exitCode: number | null
  stdout: string
  stderr?: string
  failure?: 'spawn-error' | 'timeout' | 'output-too-large'
}

export type OpenCodeCommandRunner = (
  args: string[],
  options: { dataHome: string; databasePath: string }
) => Promise<OpenCodeCommandResult>

export async function runOpenCodeCommand(
  args: string[],
  options: { dataHome: string; databasePath: string },
  executable = 'opencode',
  limits: { outputBytes?: number; timeoutMs?: number } = {}
): Promise<OpenCodeCommandResult> {
  const outputLimit = limits.outputBytes ?? OPENCODE_OUTPUT_LIMIT_BYTES
  const timeoutMs = limits.timeoutMs ?? OPENCODE_COMMAND_TIMEOUT_MS
  let tempDir: string | null = null
  let output: FileHandle | null = null

  try {
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'dialoglingo-opencode-'))
    await fsPromises.chmod(tempDir, 0o700)
    const outputPath = path.join(tempDir, 'stdout.json')
    output = await fsPromises.open(outputPath, 'w+', 0o600)
    let stderr = ''

    const childResult = new Promise<Pick<OpenCodeCommandResult, 'exitCode' | 'failure'>>(
      (resolve) => {
        let failure: OpenCodeCommandResult['failure']
        const child = spawn(executable, args, {
          env: {
            ...process.env,
            XDG_DATA_HOME: options.dataHome,
            OPENCODE_DB: options.databasePath
          },
          stdio: ['ignore', output!.fd, 'pipe']
        })
        child.stderr?.on('data', (chunk: Buffer) => {
          if (stderr.length < 64 * 1024) {
            stderr += chunk.toString('utf8').slice(0, 64 * 1024 - stderr.length)
          }
        })
        child.once('error', () => {
          failure = 'spawn-error'
        })

        const timeout = setTimeout(() => {
          failure ??= 'timeout'
          child.kill('SIGKILL')
        }, timeoutMs)
        const outputMonitor = setInterval(() => {
          if (failure) {
            return
          }
          try {
            if (fs.fstatSync(output!.fd).size > outputLimit) {
              failure = 'output-too-large'
              child.kill('SIGKILL')
            }
          } catch {
            failure = 'spawn-error'
            child.kill('SIGKILL')
          }
        }, 25)

        child.once('close', (exitCode) => {
          clearTimeout(timeout)
          clearInterval(outputMonitor)
          resolve({ exitCode: failure ? null : exitCode, failure })
        })
      }
    )

    // A regular file avoids the installed OpenCode CLI's silent pipe truncation.
    // On POSIX, unlink it immediately while the parent and child retain open handles.
    if (process.platform !== 'win32') {
      await fsPromises.unlink(outputPath).catch(() => {})
    }

    const result = await childResult
    if (result.failure) {
      return { ...result, stdout: '', stderr }
    }

    const size = (await output.stat()).size
    if (size > outputLimit) {
      return { exitCode: null, stdout: '', stderr, failure: 'output-too-large' }
    }

    const buffer = Buffer.alloc(size)
    let offset = 0
    while (offset < size) {
      const { bytesRead } = await output.read(buffer, offset, size - offset, offset)
      if (bytesRead === 0) {
        return { exitCode: null, stdout: '', stderr, failure: 'spawn-error' }
      }
      offset += bytesRead
    }
    return { exitCode: result.exitCode, stdout: buffer.toString('utf8'), stderr }
  } catch {
    return { exitCode: null, stdout: '', failure: 'spawn-error' }
  } finally {
    await output?.close().catch(() => {})
    if (tempDir) {
      await fsPromises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}
