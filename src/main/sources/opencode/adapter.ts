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
  type SourceAdapterOptions,
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

export type OpenCodeAdapterOptions = SourceAdapterOptions & {
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

function asMap(value: unknown): JsonMap | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonMap)
    : null
}

function asMaps(value: unknown): JsonMap[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const map = asMap(entry)
        return map ? [map] : []
      })
    : []
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value)
    }
  }
  return 0
}

function toIsoTimestamp(value: unknown, fallback: number) {
  const numeric = numberValue(value)
  if (numeric > 0) {
    return new Date(numeric).toISOString()
  }
  if (typeof value === 'string' && !/^\d+$/.test(value)) {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString()
    }
  }
  return new Date(fallback).toISOString()
}

function getSessionTime(session: JsonMap, field: 'created' | 'updated') {
  const time = asMap(session.time)
  return session[`${field}At`] ?? time?.[field]
}

function toOpenCodeSummary(
  session: JsonMap,
  locator: string,
  fallbackTime: number
): SessionSummary | null {
  const id = stringValue(session.id, session.sessionID, session.sessionId)
  if (!id) {
    return null
  }
  const created = getSessionTime(session, 'created')
  const updated = getSessionTime(session, 'updated') ?? created
  const archivedAt = numberValue(session.archived, session.archivedAt)

  return {
    id,
    sourceType: 'opencode',
    title: stringValue(session.title, session.name) || id,
    projectPath: stringValue(session.directory, session.cwd, asMap(session.path)?.cwd),
    startedAt: toIsoTimestamp(created, fallbackTime),
    updatedAt: toIsoTimestamp(updated, fallbackTime),
    preview: stringValue(session.title, session.name),
    locator,
    archived: session.isArchived === true || archivedAt > 0
  }
}

function parseSessionList(stdout: string, fallbackTime: number) {
  const parsed = JSON.parse(stdout) as unknown
  const root = asMap(parsed)
  const sessions = Array.isArray(parsed)
    ? asMaps(parsed)
    : asMaps(root?.sessions ?? root?.items ?? root?.data)

  return sessions.flatMap((session) => {
    const id = stringValue(session.id, session.sessionID, session.sessionId)
    const summary = toOpenCodeSummary(session, `opencode-cli:${id}`, fallbackTime)
    return summary ? [summary] : []
  })
}

function extractText(parts: JsonMap[]) {
  return parts
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

function parseExport(
  stdout: string,
  sessionId: string,
  locator: string,
  fallbackTime: number
) {
  const exported = asMap(JSON.parse(stdout))
  if (!exported) {
    return null
  }
  const session = asMap(exported.session) ?? asMap(exported.info)
  const summary = session
    ? toOpenCodeSummary(session, locator, fallbackTime)
    : null
  const messages = asMaps(exported.messages ?? exported.items)
  const turns = messages.flatMap((entry, index) => {
    const message = asMap(entry.info) ?? asMap(entry.message) ?? entry
    const role = stringValue(message.role)
    if (role !== 'user' && role !== 'assistant') {
      return []
    }
    const parts = asMaps(entry.parts ?? message.parts ?? message.content)
    const text = extractText(parts)
    if (!text) {
      return []
    }
    const messageId = stringValue(message.id, message.messageID, message.messageId) || index
    return [
      {
        id: `opencode-cli-turn-${messageId}`,
        role,
        text,
        languageHint: detectLanguageHint(text),
        sourceSpanRef: `opencode-cli:${sessionId}:message:${messageId}`
      } satisfies ConversationTurn
    ]
  })

  if (!summary || summary.id !== sessionId) {
    return null
  }

  return { summary, turns }
}

function modernDatabaseFingerprint(root: string) {
  const stats = fs.statSync(path.join(root, 'opencode.db'))
  return { sizeBytes: stats.size, mtimeMs: stats.mtimeMs }
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
  adapterOptions?: OpenCodeAdapterOptions
): SourceAdapter {
  let diagnostics: SourceDiagnostic[] = []
  const unreadableSessionIds = new Set<string>()
  const runCommand = adapterOptions?.runCommand ?? runOpenCodeCommand

  function addDiagnostic(code: SourceDiagnostic['code'], message: string) {
    diagnostics.push({ sourceType: 'opencode', code, message })
  }

  function markUnreadableSession(
    sessionId: string,
    code: SourceDiagnostic['code'],
    message: string
  ) {
    unreadableSessionIds.add(sessionId)
    addDiagnostic(code, message)
  }

  function getExportCommand() {
    return detectExportCommand(runCommand, path.dirname(root))
  }

  function listModernSessions(filters: SessionFilterInput) {
    const exportCommand = getExportCommand()
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

    const listed = runCommand(['session', 'list', '--format', 'json'], {
      dataHome: path.dirname(root)
    })
    if (listed.exitCode !== 0) {
      addDiagnostic(
        'opencode-cli-output-unsupported',
        'OpenCode CLI 无法列出该现代来源中的会话；未读取该来源。'
      )
      return []
    }
    if (!listed.stdout.trim()) {
      return []
    }

    try {
      return parseSessionList(listed.stdout, Date.now())
        .filter((summary) => matchesSessionFilters(summary, filters))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    } catch {
      addDiagnostic(
        'opencode-cli-output-unsupported',
        'OpenCode CLI 返回了无法识别的会话列表格式；未读取该来源。'
      )
      return []
    }
  }

  return {
    async listSessions(filters: SessionFilterInput) {
      diagnostics = []
      unreadableSessionIds.clear()
      const legacyFiles = walkSessionFiles(root)
      if (legacyFiles.length === 0 && hasModernOpenCodeDatabase(root)) {
        if (!isCliPathBoundToRoot(root)) {
          addDiagnostic(
            'opencode-cli-path-unverified',
            'OpenCode 的现代数据目录无法与该来源路径安全绑定；已跳过 CLI 会话读取。'
          )
          return []
        }

        return listModernSessions(filters)
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
      const legacySessionFile =
        options?.locator && !options.locator.startsWith('opencode-cli:')
          ? options.locator
          : findSessionFile(root, sessionId)
      const usesModernCli =
        hasModernOpenCodeDatabase(root) &&
        isCliPathBoundToRoot(root) &&
        (options?.locator?.startsWith('opencode-cli:') || !legacySessionFile)

      if (usesModernCli) {
        const locator = options?.locator ?? `opencode-cli:${sessionId}`
        const fingerprint = modernDatabaseFingerprint(root)
        const cached = adapterOptions?.cache?.read({
          sourceType: 'opencode',
          locator,
          fingerprint
        })
        if (cached) {
          unreadableSessionIds.delete(sessionId)
          return cached.turns
        }

        const exportCommand = getExportCommand()
        if (!exportCommand) {
          markUnreadableSession(
            sessionId,
            'opencode-cli-export-unsupported',
            'OpenCode CLI 不支持受支持的会话导出命令；未读取该会话。'
          )
          return []
        }
        const exported = runCommand([...exportCommand, sessionId], {
          dataHome: path.dirname(root)
        })
        if (exported.exitCode !== 0) {
          markUnreadableSession(
            sessionId,
            'opencode-cli-output-unsupported',
            'OpenCode CLI 无法导出该会话；未读取该会话。'
          )
          return []
        }
        try {
          const parsed = parseExport(exported.stdout, sessionId, locator, Date.now())
          if (!parsed) {
            markUnreadableSession(
              sessionId,
              'opencode-cli-output-unsupported',
              'OpenCode CLI 返回了无法识别的会话导出格式；未读取该会话。'
            )
            return []
          }
          adapterOptions?.cache?.write({
            sourceType: 'opencode',
            locator,
            fingerprint,
            summary: parsed.summary,
            turns: parsed.turns
          })
          unreadableSessionIds.delete(sessionId)
          return parsed.turns
        } catch {
          markUnreadableSession(
            sessionId,
            'opencode-cli-output-unsupported',
            'OpenCode CLI 返回了无法解析的会话导出；未读取该会话。'
          )
          return []
        }
      }

      const sessionFile = legacySessionFile
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
    },

    shouldSkipSession(sessionId: string) {
      return unreadableSessionIds.has(sessionId)
    }
  }
}
