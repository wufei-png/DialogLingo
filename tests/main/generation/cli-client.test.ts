import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildCliCommand,
  enrichCliCandidateBatch,
  parseCliResponse,
  runCliCommand
} from '../../../src/main/generation/cliClient'
import { ModelAdapterError } from '../../../src/main/generation/modelAdapter'
import type { Settings } from '../../../src/shared/schemas/settings'

const SAMPLE_ITEM = {
  itemType: 'Expression',
  sourceText: 'ship it',
  targetText: 'release it',
  gloss: 'ship',
  contextText: 'We can ship it today.',
  explanation: 'A common product phrase.',
  quizPrompt: 'What does ship it mean?',
  quizAnswer: 'Release it.',
  tags: ['product']
}

const SAMPLE_PAYLOAD = { excerptResults: [{ items: [SAMPLE_ITEM] }] }

let cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(cleanupPaths.map((path) => rm(path, { recursive: true, force: true })))
  cleanupPaths = []
})

function cliSettings(executablePath: string): Settings['modelBackend']['cli'] {
  return {
    codex: { executablePath, model: 'codex-model' },
    claude: { executablePath, model: 'claude-model' },
    opencode: { executablePath, model: 'opencode-model' },
    timeoutMs: 5_000
  }
}

async function createFakeCliExecutable() {
  const tempDir = await mkdtemp(join(tmpdir(), 'dialoglingo-fake-cli-'))
  cleanupPaths.push(tempDir)
  const scriptPath = join(tempDir, 'fake-cli.js')
  await writeFile(
    scriptPath,
    [
      '#!/usr/bin/env node',
      "const fs = require('node:fs')",
      `const payload = ${JSON.stringify(JSON.stringify(SAMPLE_PAYLOAD))}`,
      "const outputIndex = process.argv.indexOf('--output-last-message')",
      'if (outputIndex >= 0) {',
      '  fs.writeFileSync(process.argv[outputIndex + 1], payload)',
      '} else {',
      '  process.stdout.write(JSON.stringify({ result: payload }))',
      '}'
    ].join('\n'),
    'utf8'
  )
  await chmod(scriptPath, 0o755)
  return scriptPath
}

describe('buildCliCommand', () => {
  it('builds Codex, Claude, and OpenCode commands without shell templates', () => {
    const common = {
      executable: 'tool',
      model: 'model-a',
      prompt: 'prompt',
      tempDir: '/tmp/dialoglingo',
      schemaPath: '/tmp/dialoglingo/schema.json',
      schemaJson: '{"type":"object"}',
      outputPath: '/tmp/dialoglingo/last-message.json',
      promptPath: '/tmp/dialoglingo/prompt.txt'
    }

    const codex = buildCliCommand({ ...common, kind: 'codex-cli' })
    expect(codex.args).toEqual([
      '--sandbox',
      'read-only',
      '--ask-for-approval',
      'never',
      '-m',
      'model-a',
      'exec',
      '--skip-git-repo-check',
      '--ephemeral',
      '-C',
      '/tmp/dialoglingo',
      '--output-schema',
      '/tmp/dialoglingo/schema.json',
      '--output-last-message',
      '/tmp/dialoglingo/last-message.json',
      '-'
    ])
    expect(codex.stdin).toBe('prompt')

    const claude = buildCliCommand({ ...common, kind: 'claude-cli' })
    expect(claude.args).toContain('--json-schema')
    expect(claude.args).toContain('--no-session-persistence')
    expect(claude.stdin).toBe('prompt')

    const opencode = buildCliCommand({ ...common, kind: 'opencode-cli' })
    expect(opencode.args).toContain('--file')
    expect(opencode.args).toContain('/tmp/dialoglingo/prompt.txt')
    expect(opencode.stdin).toBe('')
  })
})

describe('runCliCommand', () => {
  it('captures stdout from a successful command', async () => {
    const result = await runCliCommand({
      executable: process.execPath,
      args: ['-e', "process.stdin.pipe(process.stdout)"],
      cwd: tmpdir(),
      stdin: 'hello',
      timeoutMs: 5_000
    })

    expect(result.stdout).toBe('hello')
    expect(result.exitCode).toBe(0)
  })

  it('classifies missing commands, non-zero exits, and timeouts', async () => {
    await expect(
      runCliCommand({
        executable: 'dialoglingo-definitely-missing-command',
        args: [],
        cwd: tmpdir(),
        stdin: '',
        timeoutMs: 500
      })
    ).rejects.toMatchObject({
      reason: 'model-request-failure'
    } satisfies Partial<ModelAdapterError>)

    await expect(
      runCliCommand({
        executable: process.execPath,
        args: ['-e', "process.stderr.write('bad'); process.exit(2)"],
        cwd: tmpdir(),
        stdin: '',
        timeoutMs: 5_000
      })
    ).rejects.toMatchObject({
      reason: 'model-request-failure'
    } satisfies Partial<ModelAdapterError>)

    await expect(
      runCliCommand({
        executable: process.execPath,
        args: ['-e', 'setTimeout(() => {}, 5000)'],
        cwd: tmpdir(),
        stdin: '',
        timeoutMs: 20
      })
    ).rejects.toMatchObject({
      reason: 'provider-timeout'
    } satisfies Partial<ModelAdapterError>)
  })
})

describe('parseCliResponse', () => {
  it('accepts direct and wrapped JSON payloads', () => {
    expect(parseCliResponse(JSON.stringify(SAMPLE_PAYLOAD), { excerptCount: 1 }))
      .toMatchObject(SAMPLE_PAYLOAD)
    expect(
      parseCliResponse(JSON.stringify({ result: JSON.stringify(SAMPLE_PAYLOAD) }), {
        excerptCount: 1
      })
    ).toMatchObject(SAMPLE_PAYLOAD)
  })

  it('rejects the old flat items payload', () => {
    expect(() =>
      parseCliResponse(JSON.stringify({ items: [SAMPLE_ITEM] }), { excerptCount: 1 })
    ).toThrow('excerptResults')
  })

  it('rejects invalid JSON payloads', () => {
    expect(() => parseCliResponse('not json')).toThrow('Unexpected token')
  })
})

describe('enrichCliCandidateBatch', () => {
  it('materializes workbook items from Codex, Claude, and OpenCode CLI output', async () => {
    const executablePath = await createFakeCliExecutable()

    await expect(
      enrichCliCandidateBatch({
        kind: 'codex-cli',
        cli: cliSettings(executablePath),
        prompt: 'prompt',
        excerptCount: 1
      })
    ).resolves.toMatchObject(SAMPLE_PAYLOAD)

    await expect(
      enrichCliCandidateBatch({
        kind: 'claude-cli',
        cli: cliSettings(executablePath),
        prompt: 'prompt',
        excerptCount: 1
      })
    ).resolves.toMatchObject(SAMPLE_PAYLOAD)

    await expect(
      enrichCliCandidateBatch({
        kind: 'opencode-cli',
        cli: cliSettings(executablePath),
        prompt: 'prompt',
        excerptCount: 1
      })
    ).resolves.toMatchObject(SAMPLE_PAYLOAD)
  })
})
