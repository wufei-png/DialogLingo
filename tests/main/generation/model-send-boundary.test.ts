import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enrichCandidateBatch } from '../../../src/main/generation/enrichCandidateBatch'
import { runEnrichmentFromCandidates, type StartMessage } from '../../../src/main/generation/worker'

const canaries = [
  'github_pat_abcdefghijklmnopqrstuvwxyz123456',
  'header-value-87654321',
  'env-value-87654321',
  '/Users/private-person/project-note',
  '/home/another-person/project-note',
  'sk-ant-abcdefghijklmnop',
  'quoted-auth-value-12345',
  'json-auth-value-12345',
  'SYNTHETIC_BASE64_BODY_123456',
  'synthetic-aws-secret-12345',
  'c:\\users\\synthetic-person\\notes.txt',
  'synthetic-github-token-12345'
]
const payload = { excerptResults: [{ items: [] }] }
const directories: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })))
  directories.length = 0
})

function message(kind: 'openai-compatible' | 'codex-cli', enabled: boolean, executablePath = ''): StartMessage {
  return {
    type: 'start', jobId: 'synthetic-job',
    sessions: [{ sessionId: 's1', title: 'synthetic', turns: [] }],
    provider: { baseUrl: 'http://localhost:4000', apiKey: 'synthetic-provider-key', defaultModel: 'test' },
    modelBackend: {
      kind,
      cli: {
        codex: { executablePath, model: '' },
        claude: { executablePath: '', model: '' },
        opencode: { executablePath: '', model: '' },
        timeoutMs: 5_000
      }
    },
    privacy: { redactBeforeRemoteSend: enabled },
    generation: {
      expressionDifficulty: 'average', batchSize: 1, maxItemsPerSession: 2,
      typeBalanceProfile: { targetExpression: 0.5, targetSentence: 0.5, lambda: 0.1 }
    },
    resumeCheckpoint: null
  }
}

async function run(input: {
  message: StartMessage
  customPrompt?: string
  enrich?: typeof enrichCandidateBatch
}) {
  const checkpoints: unknown[] = []
  const candidate = {
    id: 'c1', sessionId: 's1',
    sessionTitle: `Title Authorization: Bearer ${canaries[1]}`,
    sourceSpanRef: 'span-1',
    promptText: `Discuss ${canaries[0]} and API_KEY=${canaries[2]} at ${canaries[3]}`,
    role: 'assistant' as const,
    status: 'pending' as const,
    session: input.message.sessions[0]!
  }
  await runEnrichmentFromCandidates({
    message: input.message,
    candidates: [candidate],
    customPrompt: input.customPrompt,
    runtime: {
      isCancelled: () => false,
      emit: () => {},
      emitCheckpoint: (event) => checkpoints.push(event),
      postJobMessage: () => {},
      enrichCandidateBatch: input.enrich ?? enrichCandidateBatch
    }
  })
  return checkpoints
}

describe('final model send boundary', () => {
  it.each(['default', 'custom'] as const)('filters the final API request with %s template', async (mode) => {
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      requests.push(JSON.parse(options.body as string).messages[1].content)
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }))
    }))
    const checkpoints = await run({
      message: message('openai-compatible', true),
      customPrompt: mode === 'custom'
        ? `Custom ${canaries[4]} and ${canaries[5]}\nAuthorization: Bearer "${canaries[6]}"\n{"Authorization": "Bearer ${canaries[7]}"}\nPRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n${canaries[8]}\n-----END PRIVATE KEY-----"\nAWS_SECRET_ACCESS_KEY=${canaries[9]}\nPath ${canaries[10]}\nGITHUB_TOKEN=${canaries[11]}\n{{INPUT_BATCH}}`
        : undefined
    })
    expect(requests).toHaveLength(1)
    expect(requests[0]).toContain('[redacted-secret]')
    expect(requests[0]).toContain('[redacted-home-path]')
    for (const canary of canaries) {
      expect(requests[0]).not.toContain(canary)
    }
    const stored = JSON.stringify(checkpoints.filter((entry) =>
      typeof entry === 'object' && entry !== null && 'request' in entry
    ).map((entry) => (entry as { request: { prompt: string } }).request.prompt))
    for (const canary of canaries) {
      expect(stored).not.toContain(canary)
    }
  })

  it('sends the filtered prompt through CLI stdin and preserves OFF semantics', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dialoglingo-boundary-'))
    directories.push(directory)
    const executable = join(directory, 'fake-codex.js')
    const capture = join(directory, 'received.txt')
    await writeFile(executable, [
      '#!/usr/bin/env node',
      "const fs = require('node:fs')",
      `fs.writeFileSync(${JSON.stringify(capture)}, fs.readFileSync(0, 'utf8'))`,
      `fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message') + 1], ${JSON.stringify(JSON.stringify(payload))})`
    ].join('\n'))
    await chmod(executable, 0o755)
    await run({ message: message('codex-cli', true, executable), customPrompt: `Use ${canaries[5]}\n{{INPUT_BATCH}}` })
    const filtered = await readFile(capture, 'utf8')
    for (const canary of canaries) {
      expect(filtered).not.toContain(canary)
    }
    await run({ message: message('codex-cli', false, executable), customPrompt: `Use ${canaries[5]}\n{{INPUT_BATCH}}` })
    const unfiltered = await readFile(capture, 'utf8')
    expect(unfiltered).toContain(canaries[0])
    expect(unfiltered).toContain(canaries[1])
    expect(unfiltered).toContain(canaries[5])
  })

  it('does not checkpoint or log provider error text that echoes a request', async () => {
    const checkpoints = await run({
      message: message('openai-compatible', true),
      enrich: async () => { throw new Error(`provider echoed ${canaries[0]}`) }
    })
    const failed = checkpoints.find((entry) =>
      typeof entry === 'object' && entry !== null && 'error' in entry
    )
    const failure = failed as { error: { message: string } }
    expect(failure.error.message).not.toContain(canaries[0])
    expect(failure.error.message).toContain('Model request failed')
  })
})
