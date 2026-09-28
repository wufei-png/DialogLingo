import fs from 'node:fs'
import path from 'node:path'
import {
  runOpenCodeCommand,
  type OpenCodeCommandResult,
  type OpenCodeCommandRunner
} from './command'
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

const GLOBAL_SESSION_QUERY = `
  select id, title, directory,
    time_created as createdAt,
    time_updated as updatedAt,
    time_archived as archivedAt
  from session
  order by time_updated desc, id desc
`

export type { OpenCodeCommandResult, OpenCodeCommandRunner } from './command'

export type OpenCodeAdapterOptions = SourceAdapterOptions & {
  runCommand?: OpenCodeCommandRunner
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

function parseGlobalSessionList(stdout: string, fallbackTime: number) {
  const parsed = JSON.parse(stdout) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('OpenCode database query returned a non-array result')
  }

  return parsed.map((row) => {
    const session = asMap(row)
    if (
      !session ||
      typeof session.id !== 'string' ||
      !session.id.trim() ||
      typeof session.title !== 'string' ||
      typeof session.directory !== 'string' ||
      !session.directory.trim() ||
      typeof session.createdAt !== 'number' ||
      !Number.isFinite(session.createdAt) ||
      typeof session.updatedAt !== 'number' ||
      !Number.isFinite(session.updatedAt) ||
      !('archivedAt' in session) ||
      (session.archivedAt !== null &&
        (typeof session.archivedAt !== 'number' || !Number.isFinite(session.archivedAt)))
    ) {
      throw new Error('OpenCode database query returned an invalid session row')
    }
    const id = session.id
    const summary = toOpenCodeSummary(session, `opencode-cli:${id}`, fallbackTime)
    if (!summary) {
      throw new Error('OpenCode database query returned a session without an ID')
    }
    return summary
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
  const database = fs.statSync(path.join(root, 'opencode.db'))
  const walPath = path.join(root, 'opencode.db-wal')
  let wal: fs.Stats | null = null
  try {
    wal = fs.statSync(walPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
  return {
    sizeBytes: database.size + (wal?.size ?? 0),
    mtimeMs: Math.max(database.mtimeMs, wal?.mtimeMs ?? 0)
  }
}

async function detectExportCommand(
  runCommand: OpenCodeCommandRunner,
  options: { dataHome: string; databasePath: string }
) {
  const current = await runCommand(['export', '--help'], options)
  if (current.failure) {
    return { command: null, failure: current.failure }
  }
  if (
    current.exitCode === 0 &&
    /^\s*opencode export(?:\s|$)/m.test(current.stderr || current.stdout)
  ) {
    return { command: ['export'] }
  }

  const newer = await runCommand(['session', 'export', '--help'], options)
  if (newer.failure) {
    return { command: null, failure: newer.failure }
  }
  if (
    newer.exitCode === 0 &&
    /^\s*opencode session export(?:\s|$)/m.test(newer.stderr || newer.stdout)
  ) {
    return { command: ['session', 'export'] }
  }

  return { command: null }
}

export function createOpenCodeAdapter(
  root: string,
  adapterOptions?: OpenCodeAdapterOptions
): SourceAdapter {
  let diagnostics: SourceDiagnostic[] = []
  const unreadableSessionIds = new Set<string>()
  const runCommand = adapterOptions?.runCommand ?? runOpenCodeCommand
  const commandOptions = {
    dataHome: path.dirname(root),
    databasePath: path.join(root, 'opencode.db')
  }
  let exportCommandProbe: ReturnType<typeof detectExportCommand> | null = null

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

  function addCommandFailureDiagnostic(result: OpenCodeCommandResult, operation: string) {
    if (result.failure === 'timeout') {
      addDiagnostic('opencode-cli-timeout', `OpenCode CLI ${operation}超时；已跳过该来源。`)
    } else if (result.failure === 'output-too-large') {
      addDiagnostic('opencode-cli-output-too-large', `OpenCode CLI ${operation}输出超过 32 MiB；已跳过该来源。`)
    } else if (result.failure === 'spawn-error') {
      addDiagnostic('opencode-cli-unavailable', `无法启动 OpenCode CLI 完成${operation}；已跳过该来源。`)
    } else {
      addDiagnostic('opencode-cli-output-unsupported', `OpenCode CLI ${operation}失败；已跳过该来源。`)
    }
  }

  function getExportCommand() {
    exportCommandProbe ??= detectExportCommand(runCommand, commandOptions)
    return exportCommandProbe
  }

  async function listModernSessions(filters: SessionFilterInput) {
    const exportProbe = await getExportCommand()
    if (!exportProbe.command) {
      if (exportProbe.failure) {
        addCommandFailureDiagnostic({ exitCode: null, stdout: '', failure: exportProbe.failure }, '能力探测')
        return []
      }
      const probe = await runCommand(['--version'], commandOptions)
      if (probe.failure) {
        addCommandFailureDiagnostic(probe, '版本探测')
        return []
      }
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

    // session list is scoped to the CLI's current project. The documented db
    // command reads the selected database, including sessions in other projects.
    const listed = await runCommand(['db', GLOBAL_SESSION_QUERY, '--format', 'json'], commandOptions)
    if (listed.failure) {
      addCommandFailureDiagnostic(listed, '列出会话')
      return []
    }
    if (listed.exitCode !== 0) {
      addDiagnostic(
        'opencode-cli-global-list-unsupported',
        'OpenCode CLI 不支持当前数据库的跨项目会话查询；未读取该来源。'
      )
      return []
    }
    if (!listed.stdout.trim()) {
      addDiagnostic(
        'opencode-cli-global-list-unsupported',
        'OpenCode CLI 跨项目会话查询未返回 JSON；未读取该来源。'
      )
      return []
    }

    try {
      return parseGlobalSessionList(listed.stdout, Date.now())
        .filter((summary) => matchesSessionFilters(summary, filters))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    } catch {
      addDiagnostic(
        'opencode-cli-global-list-unsupported',
        'OpenCode CLI 返回了无法识别的跨项目会话查询结果；未读取该来源。'
      )
      return []
    }
  }

  return {
    async listSessions(filters: SessionFilterInput) {
      diagnostics = []
      unreadableSessionIds.clear()
      exportCommandProbe = null
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

        const exportProbe = await getExportCommand()
        if (!exportProbe.command) {
          if (exportProbe.failure) {
            markUnreadableSession(
              sessionId,
              exportProbe.failure === 'timeout'
                ? 'opencode-cli-timeout'
                : exportProbe.failure === 'output-too-large'
                  ? 'opencode-cli-output-too-large'
                  : 'opencode-cli-unavailable',
              'OpenCode CLI 能力探测失败；未读取该会话。'
            )
            return []
          }
          markUnreadableSession(
            sessionId,
            'opencode-cli-export-unsupported',
            'OpenCode CLI 不支持受支持的会话导出命令；未读取该会话。'
          )
          return []
        }
        const exported = await runCommand([...exportProbe.command, sessionId], commandOptions)
        if (exported.failure === 'timeout' || exported.failure === 'output-too-large') {
          markUnreadableSession(
            sessionId,
            exported.failure === 'timeout' ? 'opencode-cli-timeout' : 'opencode-cli-output-too-large',
            exported.failure === 'timeout'
              ? 'OpenCode CLI 导出会话超时；未读取该会话。'
              : 'OpenCode CLI 导出超过 32 MiB；未读取该会话。'
          )
          return []
        }
        if (exported.failure === 'spawn-error') {
          markUnreadableSession(
            sessionId,
            'opencode-cli-unavailable',
            '无法启动 OpenCode CLI 导出会话；未读取该会话。'
          )
          return []
        }
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
