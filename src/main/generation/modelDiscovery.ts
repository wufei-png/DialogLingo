import { tmpdir } from 'node:os'
import {
  DEFAULT_CLI_TIMEOUT_MS,
  type ModelListInput,
  type ModelListResult,
  type ModelOption
} from '../../shared/schemas/settings'
import { runCliCommand } from './cliClient'

const DEFAULT_MODEL_DISCOVERY_TIMEOUT_MS = 20_000

const CLAUDE_STATIC_MODELS: ModelOption[] = [
  {
    id: 'sonnet',
    label: 'sonnet',
    detail: 'Claude CLI alias'
  },
  {
    id: 'opus',
    label: 'opus',
    detail: 'Claude CLI alias'
  },
  {
    id: 'fable',
    label: 'fable',
    detail: 'Claude CLI alias'
  }
]

function pickExecutable(value: string | undefined, fallback: string) {
  const configured = value?.trim()
  return configured || fallback
}

function result(models: ModelOption[], message: string | null = null): ModelListResult {
  return {
    models,
    message,
    discoveredAt: new Date().toISOString()
  }
}

function uniqueOptions(options: ModelOption[]) {
  const seen = new Set<string>()
  const unique: ModelOption[] = []

  for (const option of options) {
    const id = option.id.trim()
    if (!id || seen.has(id)) {
      continue
    }

    seen.add(id)
    unique.push({
      ...option,
      id,
      label: option.label.trim() || id
    })
  }

  return unique
}

export function normalizeOpenAiModelsUrl(baseUrl: string) {
  const trimmed = baseUrl.trim()
  if (!trimmed) {
    throw new Error('OpenAI-compatible base URL is required before listing models.')
  }

  const url = new URL(trimmed)
  let normalizedPath = url.pathname.replace(/\/+$/, '')

  if (normalizedPath.endsWith('/models')) {
    url.pathname = normalizedPath
    return url.toString()
  }

  if (normalizedPath.endsWith('/chat/completions')) {
    normalizedPath = normalizedPath.slice(0, -'/chat/completions'.length)
  }

  if (normalizedPath.endsWith('/v1')) {
    url.pathname = `${normalizedPath}/models`
    return url.toString()
  }

  url.pathname = `${normalizedPath}/v1/models`.replace(/^\/?/, '/')
  return url.toString()
}

async function listOpenAiCompatibleModels(input: ModelListInput) {
  const provider = input.provider
  if (!provider?.baseUrl.trim() || !provider.apiKey.trim()) {
    throw new Error('OpenAI-compatible base URL and API key are required before listing models.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    DEFAULT_MODEL_DISCOVERY_TIMEOUT_MS
  )

  try {
    const response = await fetch(normalizeOpenAiModelsUrl(provider.baseUrl), {
      method: 'GET',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${provider.apiKey.trim()}`
      }
    })

    if (!response.ok) {
      throw new Error(`OpenAI-compatible model list failed with HTTP ${response.status}.`)
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: unknown; owned_by?: unknown }>
      models?: Array<{ id?: unknown; name?: unknown }>
    }
    const sourceModels = Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.models)
        ? payload.models
        : []
    const models = sourceModels
      .map((model) => {
        const id = typeof model.id === 'string'
          ? model.id
          : 'name' in model && typeof model.name === 'string'
            ? model.name
            : ''
        const owner =
          'owned_by' in model && typeof model.owned_by === 'string'
            ? model.owned_by
            : undefined

        return {
          id,
          label: id,
          detail: owner
        }
      })
      .filter((model) => model.id)
      .sort((left, right) => left.id.localeCompare(right.id))

    return result(uniqueOptions(models))
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('OpenAI-compatible model list timed out.')
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function parseCodexModels(stdout: string) {
  const payload = JSON.parse(stdout) as {
    models?: Array<{
      slug?: unknown
      display_name?: unknown
      visibility?: unknown
    }>
  }
  const models = Array.isArray(payload.models) ? payload.models : []

  return uniqueOptions(
    models
      .filter((model) => model.visibility === 'list')
      .map((model) => {
        const id = typeof model.slug === 'string' ? model.slug : ''
        const label =
          typeof model.display_name === 'string' && model.display_name.trim()
            ? model.display_name
            : id

        return {
          id,
          label,
          detail:
            typeof model.visibility === 'string' ? model.visibility : undefined
        }
      })
      .filter((model) => model.id)
  )
}

function parseOpenCodeModels(stdout: string) {
  return uniqueOptions(
    stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('opencode '))
      .map((line) => ({
        id: line,
        label: line
      }))
  )
}

async function listCliModels(input: ModelListInput) {
  const cli = input.cli ?? {
    codex: { executablePath: '' },
    claude: { executablePath: '' },
    opencode: { executablePath: '' },
    timeoutMs: DEFAULT_CLI_TIMEOUT_MS
  }
  const timeoutMs = cli.timeoutMs || DEFAULT_CLI_TIMEOUT_MS

  if (input.backendKind === 'codex-cli') {
    const executable = pickExecutable(cli.codex.executablePath, 'codex')
    const command = await runCliCommand({
      kind: 'codex-cli',
      executable,
      args: ['debug', 'models'],
      cwd: tmpdir(),
      stdin: '',
      timeoutMs
    })

    return result(parseCodexModels(command.stdout))
  }

  if (input.backendKind === 'opencode-cli') {
    const executable = pickExecutable(cli.opencode.executablePath, 'opencode')
    const command = await runCliCommand({
      kind: 'opencode-cli',
      executable,
      args: ['models'],
      cwd: tmpdir(),
      stdin: '',
      timeoutMs
    })

    return result(parseOpenCodeModels(command.stdout))
  }

  return result(
    CLAUDE_STATIC_MODELS,
    'Claude CLI does not expose a model discovery command. Choose a preset alias or type a full model name.'
  )
}

export async function listSupportedModels(input: ModelListInput) {
  if (input.backendKind === 'openai-compatible') {
    return await listOpenAiCompatibleModels(input)
  }

  return await listCliModels(input)
}
