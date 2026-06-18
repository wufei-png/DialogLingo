import { spawn as nodeSpawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ModelBackendKind, Settings } from '../../shared/schemas/settings'
import {
  ModelAdapterError,
  learningItemJsonSchema,
  parseLearningItemContent,
  parseLearningItemPayload
} from './modelAdapter'
import { logger } from '../logging'

export type CliBackendKind = Extract<
  ModelBackendKind,
  'codex-cli' | 'claude-cli' | 'opencode-cli'
>

type CliToolName = 'codex' | 'claude' | 'opencode'

type CliSettings = Settings['modelBackend']['cli']

export type BuiltCliCommand = {
  executable: string
  args: string[]
  stdin: string
  outputPath?: string
}

export type CliCommandResult = {
  stdout: string
  stderr: string
  exitCode: number
  signal: NodeJS.Signals | null
}

function cliToolNameForKind(kind: CliBackendKind): CliToolName {
  switch (kind) {
    case 'codex-cli':
      return 'codex'
    case 'claude-cli':
      return 'claude'
    case 'opencode-cli':
      return 'opencode'
  }
}

function pickExecutable(input: { configuredPath: string; toolName: CliToolName }) {
  const configured = input.configuredPath.trim()
  return configured || input.toolName
}

export function buildCliCommand(input: {
  kind: CliBackendKind
  executable: string
  model: string
  prompt: string
  tempDir: string
  schemaPath: string
  schemaJson: string
  outputPath: string
  promptPath: string
}): BuiltCliCommand {
  const model = input.model.trim()

  if (input.kind === 'codex-cli') {
    const args = [
      '--sandbox',
      'read-only',
      '--ask-for-approval',
      'never'
    ]

    if (model) {
      args.push('-m', model)
    }

    args.push(
      'exec',
      '--skip-git-repo-check',
      '--ephemeral',
      '-C',
      input.tempDir,
      '--output-schema',
      input.schemaPath,
      '--output-last-message',
      input.outputPath,
      '-'
    )

    return {
      executable: input.executable,
      args,
      stdin: input.prompt,
      outputPath: input.outputPath
    }
  }

  if (input.kind === 'claude-cli') {
    const args = [
      '-p',
      '--output-format',
      'json',
      '--input-format',
      'text',
      '--no-session-persistence',
      '--tools',
      ''
    ]

    if (model) {
      args.push('--model', model)
    }

    args.push(
      '--json-schema',
      input.schemaJson,
      'Generate DialogLingo workbook JSON from stdin.'
    )

    return {
      executable: input.executable,
      args,
      stdin: input.prompt
    }
  }

  const args = ['run', '--dir', input.tempDir, '--format', 'json']

  if (model) {
    args.push('--model', model)
  }

  args.push(
    '--file',
    input.promptPath,
    'Return only JSON matching the attached DialogLingo workbook schema.'
  )

  return {
    executable: input.executable,
    args,
    stdin: ''
  }
}

export async function runCliCommand(input: {
  kind?: CliBackendKind
  executable: string
  args: string[]
  cwd: string
  stdin: string
  timeoutMs: number
}) {
  return await new Promise<CliCommandResult>((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false
    let forceKill: NodeJS.Timeout | null = null
    const child = nodeSpawn(input.executable, input.args, {
      cwd: input.cwd,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      forceKill = setTimeout(() => child.kill('SIGKILL'), 1_000)
    }, input.timeoutMs)

    const settle = (callback: () => void) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      if (forceKill) {
        clearTimeout(forceKill)
      }
      callback()
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      logger.debug('generation-cli', 'command spawn failed', {
        backendKind: input.kind ?? 'unknown',
        errorName: error instanceof Error ? error.name : 'unknown'
      })
      settle(() => {
        reject(
          new ModelAdapterError(
            error instanceof Error ? error.message : 'CLI command failed.',
            'model-request-failure'
          )
        )
      })
    })
    child.on('close', (exitCode, signal) => {
      settle(() => {
        if (timedOut) {
          logger.debug('generation-cli', 'command timed out', {
            backendKind: input.kind ?? 'unknown',
            timeoutMs: input.timeoutMs
          })
          reject(new ModelAdapterError('CLI command timed out.', 'provider-timeout'))
          return
        }

        if (exitCode !== 0) {
          logger.debug('generation-cli', 'command exited non-zero', {
            backendKind: input.kind ?? 'unknown',
            exitCode,
            signal,
            stderrBytes: Buffer.byteLength(stderr, 'utf8')
          })
          reject(
            new ModelAdapterError(
              `CLI command failed with exit code ${exitCode ?? signal ?? 'unknown'}: ${stderr.trim()}`,
              'model-request-failure'
            )
          )
          return
        }

        resolve({
          stdout,
          stderr,
          exitCode: exitCode ?? 0,
          signal
        })
      })
    })

    child.stdin.end(input.stdin)
  })
}

function collectStringCandidates(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStringCandidates(item))
  }

  if (!value || typeof value !== 'object') {
    return []
  }

  const record = value as Record<string, unknown>
  const candidates: string[] = []
  // CLI tools wrap final text differently; collect common wrapper fields before
  // falling back to raw JSON slice extraction.
  for (const key of ['result', 'content', 'text', 'message', 'output', 'response']) {
    candidates.push(...collectStringCandidates(record[key]))
  }

  if (Array.isArray(record.choices)) {
    for (const choice of record.choices) {
      if (choice && typeof choice === 'object') {
        const choiceRecord = choice as Record<string, unknown>
        candidates.push(...collectStringCandidates(choiceRecord.message))
      }
    }
  }

  return candidates
}

function extractJsonSlice(text: string) {
  const objectStart = text.indexOf('{')
  const arrayStart = text.indexOf('[')
  const starts = [objectStart, arrayStart].filter((index) => index >= 0)
  if (starts.length === 0) {
    return null
  }

  const start = Math.min(...starts)
  const end = text[start] === '[' ? text.lastIndexOf(']') : text.lastIndexOf('}')
  if (end <= start) {
    return null
  }
  return text.slice(start, end + 1)
}

function promptWithJsonContract(prompt: string) {
  return [
    prompt,
    '',
    'Return JSON in this exact shape:',
    '{"items":[{"itemType":"Expression","sourceText":"...","targetText":"...","gloss":"...","contextText":"...","explanation":"...","quizPrompt":"...","quizAnswer":"...","tags":["..."]}]}'
  ].join('\n')
}

export function parseCliResponse(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new ModelAdapterError('CLI command produced no output.', 'invalid-structured-payload')
  }

  try {
    return parseLearningItemPayload(JSON.parse(trimmed))
  } catch {
    // Continue with wrapper-field and markdown/text extraction below.
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    for (const candidate of collectStringCandidates(parsed)) {
      try {
        return parseLearningItemContent(candidate)
      } catch {
        // Try the next candidate.
      }
    }
  } catch {
    // Raw text may still contain a JSON payload.
  }

  const jsonSlice = extractJsonSlice(trimmed)
  if (jsonSlice) {
    return parseLearningItemContent(jsonSlice)
  }

  return parseLearningItemContent(trimmed)
}

async function readOutputFile(path: string) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

export async function enrichCliCandidateBatch(input: {
  kind: CliBackendKind
  cli: CliSettings
  prompt: string
}) {
  const toolName = cliToolNameForKind(input.kind)
  const toolSettings = input.cli[toolName]
  const executable = pickExecutable({
    configuredPath: toolSettings.executablePath,
    toolName
  })
  const tempDir = await mkdtemp(join(tmpdir(), 'dialoglingo-cli-'))
  const schemaPath = join(tempDir, 'schema.json')
  const outputPath = join(tempDir, 'last-message.json')
  const promptPath = join(tempDir, 'prompt.txt')
  const schemaJson = JSON.stringify(learningItemJsonSchema())
  const cliPrompt = promptWithJsonContract(input.prompt)

  try {
    await writeFile(schemaPath, schemaJson, 'utf8')
    await writeFile(promptPath, cliPrompt, 'utf8')
    const command = buildCliCommand({
      kind: input.kind,
      executable,
      model: toolSettings.model,
      prompt: cliPrompt,
      tempDir,
      schemaPath,
      schemaJson,
      outputPath,
      promptPath
    })
    const result = await runCliCommand({
      kind: input.kind,
      executable: command.executable,
      args: command.args,
      cwd: tempDir,
      stdin: command.stdin,
      timeoutMs: input.cli.timeoutMs
    })
    const outputFileContent = command.outputPath
      ? await readOutputFile(command.outputPath)
      : ''
    return parseCliResponse(outputFileContent || result.stdout)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
