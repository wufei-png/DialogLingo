import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enrichCandidateBatch } from '../../../src/main/generation/enrichCandidateBatch'
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
  vi.unstubAllGlobals()
  await Promise.all(cleanupPaths.map((path) => rm(path, { recursive: true, force: true })))
  cleanupPaths = []
})

function cliConfig(executablePath: string): Settings['modelBackend']['cli'] {
  return {
    codex: { executablePath, model: '' },
    claude: { executablePath: '', model: '' },
    opencode: { executablePath: '', model: '' },
    timeoutMs: 5_000
  }
}

async function createFakeCodexExecutable() {
  const tempDir = await mkdtemp(join(tmpdir(), 'dialoglingo-fake-codex-'))
  cleanupPaths.push(tempDir)
  const scriptPath = join(tempDir, 'fake-codex.js')
  await writeFile(
    scriptPath,
    [
      '#!/usr/bin/env node',
      "const fs = require('node:fs')",
	      `const payload = ${JSON.stringify(JSON.stringify(SAMPLE_PAYLOAD))}`,
      "const outputIndex = process.argv.indexOf('--output-last-message')",
      'fs.writeFileSync(process.argv[outputIndex + 1], payload)'
    ].join('\n'),
    'utf8'
  )
  await chmod(scriptPath, 0o755)
  return scriptPath
}

describe('enrichCandidateBatch', () => {
  it('selects the OpenAI-compatible API backend', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
	                content: JSON.stringify(SAMPLE_PAYLOAD)
              }
            }
          ]
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const items = await enrichCandidateBatch({
      provider: {
        baseUrl: 'http://localhost:4000',
        apiKey: 'sk-test',
        defaultModel: 'gpt-4o-mini'
      },
      modelBackend: {
        kind: 'openai-compatible',
        cli: cliConfig('')
      },
	      prompt: 'prompt',
	      excerptCount: 1
	    })

	    expect(fetchMock).toHaveBeenCalled()
	    expect(items).toMatchObject(SAMPLE_PAYLOAD)
  })

  it('selects a CLI backend without requiring API provider fields', async () => {
    const executablePath = await createFakeCodexExecutable()

    const items = await enrichCandidateBatch({
      provider: {
        baseUrl: '',
        apiKey: '',
        defaultModel: ''
      },
      modelBackend: {
        kind: 'codex-cli',
        cli: cliConfig(executablePath)
      },
	      prompt: 'prompt',
	      excerptCount: 1
	    })

	    expect(items).toMatchObject(SAMPLE_PAYLOAD)
	  })
	})
