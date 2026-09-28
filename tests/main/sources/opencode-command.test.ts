import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  OPENCODE_COMMAND_TIMEOUT_MS,
  OPENCODE_OUTPUT_LIMIT_BYTES,
  runOpenCodeCommand
} from '../../../src/main/sources/opencode/command'

const options = {
  dataHome: '/isolated/opencode-data',
  databasePath: path.join('/isolated/opencode-data', 'opencode', 'opencode.db')
}

const originalDatabasePath = process.env.OPENCODE_DB

afterEach(() => {
  if (originalDatabasePath === undefined) {
    delete process.env.OPENCODE_DB
  } else {
    process.env.OPENCODE_DB = originalDatabasePath
  }
})

describe('OpenCode command runner', () => {
  it('binds the selected database and reads a complete large export from a regular file', async () => {
    process.env.OPENCODE_DB = '/wrong/database.db'
    const result = await runOpenCodeCommand(
      [
        '-e',
        `const fs = require('node:fs'); process.stdout.write(JSON.stringify({
          databasePath: process.env.OPENCODE_DB,
          dataHome: process.env.XDG_DATA_HOME,
          regularFile: fs.fstatSync(1).isFile(),
          text: 'x'.repeat(2 * 1024 * 1024)
        }))`
      ],
      options,
      process.execPath
    )

    expect(result.exitCode).toBe(0)
    expect(result.failure).toBeUndefined()
    expect(JSON.parse(result.stdout)).toMatchObject({
      databasePath: options.databasePath,
      dataHome: options.dataHome,
      regularFile: true
    })
    expect(result.stdout.length).toBeGreaterThan(2 * 1024 * 1024)
  })

  it('stops output above the configured limit', async () => {
    const result = await runOpenCodeCommand(
      ['-e', "process.stdout.write('x'.repeat(4096))"],
      options,
      process.execPath,
      { outputBytes: 1024 }
    )

    expect(result).toMatchObject({
      exitCode: null,
      stdout: '',
      failure: 'output-too-large'
    })
  })

  it('captures bounded help text written to stderr', async () => {
    const result = await runOpenCodeCommand(
      ['-e', "process.stderr.write('opencode export [sessionID]')"],
      options,
      process.execPath
    )

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: '',
      stderr: 'opencode export [sessionID]'
    })
  })

  it('stops a command that exceeds its deadline', async () => {
    const result = await runOpenCodeCommand(
      ['-e', 'setTimeout(() => {}, 10_000)'],
      options,
      process.execPath,
      { timeoutMs: 100 }
    )

    expect(result).toMatchObject({ exitCode: null, stdout: '', failure: 'timeout' })
  })

  it('reports a missing executable', async () => {
    const result = await runOpenCodeCommand(
      [],
      options,
      path.join(options.dataHome, 'missing-opencode')
    )

    expect(result).toMatchObject({ exitCode: null, stdout: '', failure: 'spawn-error' })
  })

  it('uses the confirmed default output and time limits', () => {
    expect(OPENCODE_OUTPUT_LIMIT_BYTES).toBe(32 * 1024 * 1024)
    expect(OPENCODE_COMMAND_TIMEOUT_MS).toBe(15_000)
  })
})
