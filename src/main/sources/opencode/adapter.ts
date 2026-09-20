import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  detectLanguageHint,
  matchesSessionFilters,
  type ConversationTurn,
  type SessionFilterInput,
  type SessionSummary,
  type SourceAdapter,
  type SourceDiagnostic
} from '../types'
import { logger } from '../../logging'

type JsonMap = Record<string, unknown>

export type OpenCodeCommandResult = {
  exitCode: number | null
  stdout: string
}

export type OpenCodeCommandRunner = (
  args: string[],
  options: { dataHome: string }
) => OpenCodeCommandResult

export type OpenCodeAdapterOptions = {
  runCommand?: OpenCodeCommandRunner
}

function runOpenCodeCommand(
  args: string[],
  options: { dataHome: string }
): OpenCodeCommandResult {
  const result = spawnSync('opencode', args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      XDG_DATA_HOME: options.dataHome
    }
  })

  return {
    exitCode: result.error ? null : result.status,
    stdout: result.stdout ?? ''
  }
}

function walkSessionFiles(root: string) {
  const sessionsRoot = path.join(root, 'storage', 'session')
  if (!fs.existsSync(sessionsRoot)) {
    logger.debug('source-adapter', 'opencode session directory missing')
    return []
  }

  const files: string[] = []
  for (const bucket of fs.readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!bucket.isDirectory()) {
      continue
    }

    const bucketPath = path.join(sessionsRoot, bucket.name)
    for (const fileName of fs.readdirSync(bucketPath)) {
      if (fileName.endsWith('.json')) {
        files.push(path.join(bucketPath, fileName))
      }
    }
  }

  return files
}

function readJson(filePath: string): JsonMap {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as JsonMap
}

function readMessageText(root: string, messageId: string) {
  const partsDir = path.join(root, 'storage', 'part', messageId)
  if (!fs.existsSync(partsDir)) {
    logger.debug('source-adapter', 'opencode message parts missing', {
      messageId
    })
    return ''
  }

  return fs
    .readdirSync(partsDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => readJson(path.join(partsDir, fileName)))
    .sort((left, right) => {
      const leftTime = Number((left.time as JsonMap | undefined)?.start ?? 0)
      const rightTime = Number((right.time as JsonMap | undefined)?.start ?? 0)
      return leftTime - rightTime
    })
    .flatMap((part) => {
      if (part.type === 'text' && typeof part.text === 'string') {
        return [part.text.trim()]
      }
      return []
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

function findSessionFile(root: string, sessionId: string) {
  return walkSessionFiles(root).find((filePath) => readJson(filePath).id === sessionId) ?? null
}

function hasModernOpenCodeDatabase(root: string) {
  return fs.existsSync(path.join(root, 'opencode.db'))
}

function isCliPathBoundToRoot(root: string) {
  return path.basename(path.resolve(root)) === 'opencode'
}

function detectExportCommand(
  runCommand: OpenCodeCommandRunner,
  dataHome: string
) {
  const current = runCommand(['export', '--help'], { dataHome })
  if (current.exitCode === 0) {
    return ['export']
  }

  const newer = runCommand(['session', 'export', '--help'], { dataHome })
  if (newer.exitCode === 0) {
    return ['session', 'export']
  }

  return null
}

export function createOpenCodeAdapter(
  root: string,
  options?: OpenCodeAdapterOptions
): SourceAdapter {
  let diagnostics: SourceDiagnostic[] = []
  const runCommand = options?.runCommand ?? runOpenCodeCommand

  function addDiagnostic(code: SourceDiagnostic['code'], message: string) {
    diagnostics.push({ sourceType: 'opencode', code, message })
  }

  return {
    async listSessions(filters: SessionFilterInput) {
      diagnostics = []
      const legacyFiles = walkSessionFiles(root)
      if (legacyFiles.length === 0 && hasModernOpenCodeDatabase(root)) {
        if (!isCliPathBoundToRoot(root)) {
          addDiagnostic(
            'opencode-cli-path-unverified',
            'OpenCode 的现代数据目录无法与该来源路径安全绑定；已跳过 CLI 会话读取。'
          )
          return []
        }

        const exportCommand = detectExportCommand(runCommand, path.dirname(root))
        if (!exportCommand) {
          const probe = runCommand(['--version'], { dataHome: path.dirname(root) })
          addDiagnostic(
            probe.exitCode === null
              ? 'opencode-cli-unavailable'
              : 'opencode-cli-export-unsupported',
            probe.exitCode === null
              ? '检测到 OpenCode 现代数据，但找不到可用的 opencode CLI；未读取该来源。'
              : '检测到 OpenCode 现代数据，但 CLI 不支持受支持的会话导出命令；未读取该来源。'
          )
          return []
        }

        addDiagnostic(
          'opencode-cli-output-unsupported',
          '检测到 OpenCode 现代数据和可用导出 CLI；当前版本尚未识别其会话导出格式。'
        )
        return []
      }

      return legacyFiles
        .flatMap((filePath) => {
          const session = readJson(filePath)
          const archivedAt = Number(session.archived ?? 0)
          if (!filters.includeArchived && archivedAt > 0) {
            return []
          }

          const createdAt = Number((session.time as JsonMap | undefined)?.created ?? 0)
          const updatedAt = Number((session.time as JsonMap | undefined)?.updated ?? createdAt)

          return [
            {
              id: String(session.id ?? ''),
              sourceType: 'opencode' as const,
              title: String(session.title ?? path.basename(filePath, '.json')),
              projectPath: String(session.directory ?? ''),
              startedAt: new Date(createdAt || Date.now()).toISOString(),
              updatedAt: new Date(updatedAt || createdAt || Date.now()).toISOString(),
              preview: String(session.title ?? ''),
              locator: filePath,
              archived: archivedAt > 0
            }
          ]
        })
        .filter((summary) => matchesSessionFilters(summary, filters))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    },

    async readSession(sessionId: string, options?: { locator?: string }) {
      const sessionFile = options?.locator ?? findSessionFile(root, sessionId)
      if (!sessionFile) {
        logger.debug('source-adapter', 'opencode session file missing', {
          sessionId
        })
        return []
      }

      const messagesDir = path.join(root, 'storage', 'message', sessionId)
      if (!fs.existsSync(messagesDir)) {
        logger.debug('source-adapter', 'opencode message directory missing', {
          sessionId
        })
        return []
      }

      return fs
        .readdirSync(messagesDir)
        .filter((fileName) => fileName.endsWith('.json'))
        .map((fileName) => readJson(path.join(messagesDir, fileName)))
        .sort((left, right) => {
          const leftTime = Number((left.time as JsonMap | undefined)?.created ?? 0)
          const rightTime = Number((right.time as JsonMap | undefined)?.created ?? 0)
          return leftTime - rightTime
        })
        .flatMap((message, index) => {
          const role = String(message.role ?? '')
          if (role !== 'user' && role !== 'assistant') {
            return []
          }

          const messageId = String(message.id ?? '')
          const text =
            readMessageText(root, messageId) ||
            String((message.summary as JsonMap | undefined)?.title ?? '').trim()

          if (!text) {
            return []
          }

          return [
            {
              id: `opencode-turn-${index}`,
              role,
              text,
              languageHint: detectLanguageHint(text),
              sourceSpanRef: `${messagesDir}/${messageId}`
            } satisfies ConversationTurn
          ]
        })
    },

    getDiagnostics() {
      return diagnostics
    }
  }
}
