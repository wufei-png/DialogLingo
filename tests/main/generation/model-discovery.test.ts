import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  listSupportedModels,
  normalizeOpenAiModelsUrl
} from '../../../src/main/generation/modelDiscovery'

const cleanupPaths: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(
    cleanupPaths.map((path) => rm(path, { recursive: true, force: true }))
  )
  cleanupPaths.length = 0
})

async function createFakeCliExecutable(stdout: string) {
  const tempDir = await mkdtemp(join(tmpdir(), 'dialoglingo-model-cli-'))
  cleanupPaths.push(tempDir)
  const scriptPath = join(tempDir, 'fake-cli.js')
  await writeFile(
    scriptPath,
    [
      '#!/usr/bin/env node',
      `process.stdout.write(${JSON.stringify(stdout)})`
    ].join('\n'),
    'utf8'
  )
  await chmod(scriptPath, 0o755)
  return scriptPath
}

describe('normalizeOpenAiModelsUrl', () => {
  it('accepts proxy root, v1 base, models URL, and chat completions URL', () => {
    expect(normalizeOpenAiModelsUrl('http://localhost:4000')).toBe(
      'http://localhost:4000/v1/models'
    )
    expect(normalizeOpenAiModelsUrl('http://localhost:4000/v1')).toBe(
      'http://localhost:4000/v1/models'
    )
    expect(normalizeOpenAiModelsUrl('http://localhost:4000/v1/models')).toBe(
      'http://localhost:4000/v1/models'
    )
    expect(
      normalizeOpenAiModelsUrl('http://localhost:4000/v1/chat/completions')
    ).toBe('http://localhost:4000/v1/models')
  })
})

describe('listSupportedModels', () => {
  it('lists OpenAI-compatible models from the current form credentials', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: 'gpt-4o-mini', owned_by: 'openai' },
            { id: 'gpt-5', owned_by: 'openai' }
          ]
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await listSupportedModels({
      backendKind: 'openai-compatible',
      provider: {
        baseUrl: 'http://localhost:4000',
        apiKey: 'sk-test'
      }
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: { authorization: 'Bearer sk-test' }
      })
    )
    expect(response.models.map((model) => model.id)).toEqual([
      'gpt-4o-mini',
      'gpt-5'
    ])
  })

  it('lists Codex CLI models from debug catalog JSON', async () => {
    const executable = await createFakeCliExecutable(
      JSON.stringify({
        models: [
          {
            slug: 'gpt-5.5',
            display_name: 'GPT-5.5',
            visibility: 'list'
          },
          {
            slug: 'codex-auto-review',
            display_name: 'Codex Auto Review',
            visibility: 'hide'
          }
        ]
      })
    )

    const response = await listSupportedModels({
      backendKind: 'codex-cli',
      cli: {
        codex: { executablePath: executable },
        claude: { executablePath: '' },
        opencode: { executablePath: '' },
        timeoutMs: 5_000
      }
    })

    expect(response.models).toEqual([
      {
        id: 'gpt-5.5',
        label: 'GPT-5.5',
        detail: 'list'
      }
    ])
  })

  it('lists OpenCode CLI models from line output', async () => {
    const executable = await createFakeCliExecutable(
      ['openai/gpt-5', 'github-copilot/claude-sonnet-4.5', ''].join('\n')
    )

    const response = await listSupportedModels({
      backendKind: 'opencode-cli',
      cli: {
        codex: { executablePath: '' },
        claude: { executablePath: '' },
        opencode: { executablePath: executable },
        timeoutMs: 5_000
      }
    })

    expect(response.models.map((model) => model.id)).toEqual([
      'openai/gpt-5',
      'github-copilot/claude-sonnet-4.5'
    ])
  })

  it('uses Claude CLI preset aliases when discovery is not exposed', async () => {
    const response = await listSupportedModels({
      backendKind: 'claude-cli',
      cli: {
        codex: { executablePath: '' },
        claude: { executablePath: '' },
        opencode: { executablePath: '' },
        timeoutMs: 5_000
      }
    })

    expect(response.models.map((model) => model.id)).toEqual([
      'sonnet',
      'opus',
      'fable'
    ])
    expect(response.message).toContain('does not expose')
  })
})
