import fs from 'node:fs'
import path from 'node:path'
import {
  detectLanguageHint,
  matchesSessionFilters,
  type ConversationTurn,
  type SessionFilterInput,
  type SessionSummary,
  type SourceAdapter
} from '../types'

type JsonMap = Record<string, unknown>
type ParsedClaudeTurn = ConversationTurn & { row: JsonMap; timestamp: string }
export type ClaudeAdapterPaths = {
  cliRoot: string
  desktopCodeSessionRoot?: string
}

type DesktopCodeSessionMetadata = {
  transcriptSessionId: string
  title: string | null
  cwd: string | null
  createdAt: string | null
  lastActivityAt: string | null
  archived: boolean
  sortTimeMs: number
}

function walkProjectLogs(root: string) {
  const projectsRoot = path.join(root, 'projects')
  if (!fs.existsSync(projectsRoot)) {
    return []
  }

  const files: string[] = []
  const entries = fs.readdirSync(projectsRoot, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(projectsRoot, entry.name)
    if (entry.isDirectory()) {
      for (const child of fs.readdirSync(fullPath)) {
        if (child.endsWith('.jsonl')) {
          files.push(path.join(fullPath, child))
        }
      }
    }
  }

  return files
}

function walkDesktopCodeSessionMetadata(root: string | undefined) {
  if (!root || !fs.existsSync(root)) {
    return []
  }

  const files: string[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkDesktopCodeSessionMetadata(fullPath))
    } else if (
      entry.isFile() &&
      entry.name.startsWith('local_') &&
      entry.name.endsWith('.json')
    ) {
      files.push(fullPath)
    }
  }

  return files
}

function readJsonl(filePath: string): JsonMap[] {
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonMap)
}

function readJsonFile(filePath: string): JsonMap | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as JsonMap
  } catch {
    return null
  }
}

function toTrimmedString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function stripLocalPrefix(value: string) {
  return value.startsWith('local_') ? value.slice('local_'.length) : value
}

function toTimestampMs(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed)
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null
  }

  const parsed = Date.parse(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function toIsoTimestamp(value: unknown) {
  const timestamp = toTimestampMs(value)
  return timestamp ? new Date(timestamp).toISOString() : null
}

function resolveDesktopTranscriptSessionId(row: JsonMap, filePath: string) {
  const cliSessionId = toTrimmedString(row.cliSessionId)
  const normalizedCliSessionId = cliSessionId ? stripLocalPrefix(cliSessionId) : null
  if (normalizedCliSessionId) {
    return normalizedCliSessionId
  }

  const sessionId =
    toTrimmedString(row.sessionId) ?? path.basename(filePath, '.json')
  return stripLocalPrefix(sessionId) || stripLocalPrefix(path.basename(filePath, '.json'))
}

function readDesktopCodeSessionMetadata(
  root: string | undefined
): Map<string, DesktopCodeSessionMetadata> {
  const sessions = new Map<string, DesktopCodeSessionMetadata>()

  for (const filePath of walkDesktopCodeSessionMetadata(root)) {
    const row = readJsonFile(filePath)
    if (!row) {
      continue
    }

    const transcriptSessionId = resolveDesktopTranscriptSessionId(row, filePath)
    if (!transcriptSessionId) {
      continue
    }

    const createdAt = toIsoTimestamp(row.createdAt)
    const lastActivityAt = toIsoTimestamp(row.lastActivityAt)
    const sortTimeMs =
      toTimestampMs(row.lastActivityAt) ?? toTimestampMs(row.createdAt) ?? 0
    const metadata: DesktopCodeSessionMetadata = {
      transcriptSessionId,
      title: toTrimmedString(row.title),
      cwd: toTrimmedString(row.cwd) ?? toTrimmedString(row.originCwd),
      createdAt,
      lastActivityAt,
      archived: row.isArchived === true,
      sortTimeMs
    }
    const current = sessions.get(transcriptSessionId)

    if (!current || metadata.sortTimeMs >= current.sortTimeMs) {
      sessions.set(transcriptSessionId, metadata)
    }
  }

  return sessions
}

function applyDesktopCodeMetadata(
  summary: SessionSummary,
  metadata: DesktopCodeSessionMetadata | undefined
): SessionSummary {
  if (!metadata) {
    return summary
  }

  return {
    ...summary,
    title: metadata.title ?? summary.title,
    projectPath: metadata.cwd ?? summary.projectPath,
    startedAt: metadata.createdAt ?? summary.startedAt,
    updatedAt: metadata.lastActivityAt ?? summary.updatedAt,
    archived: metadata.archived
  }
}

function extractClaudeText(row: JsonMap) {
  const message = row.message as JsonMap | undefined
  const content = message?.content
  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .flatMap((item) => {
        if (!item || typeof item !== 'object') {
          return []
        }

        const block = item as Record<string, unknown>
        return typeof block.text === 'string' ? [block.text.trim()] : []
      })
      .filter(Boolean)
      .join('\n')
      .trim()
  }

  return ''
}

function isClaudeNoise(row: JsonMap, text: string) {
  if (row.isMeta === true) {
    return true
  }

  return (
    text.startsWith('<local-command') ||
    text.startsWith('<command-name>') ||
    text.startsWith('<command-message>') ||
    text.startsWith('<command-args>') ||
    text.startsWith('<local-command-stdout>')
  )
}

function extractClaudeTurns(filePath: string, rows: JsonMap[]): ParsedClaudeTurn[] {
  return rows
    .flatMap((row, index) => {
      const role = String(row.type ?? '')
      if (role !== 'user' && role !== 'assistant') {
        return []
      }

      const text = extractClaudeText(row)
      if (!text || isClaudeNoise(row, text)) {
        return []
      }

      return [
        {
          id: `claude-turn-${index}`,
          role,
          text,
          languageHint: detectLanguageHint(text),
          sourceSpanRef: `${filePath}:${index + 1}`,
          row,
          timestamp: String(row.timestamp ?? '')
        }
      ]
    })
}

function toConversationTurn({
  row: _row,
  timestamp: _timestamp,
  ...turn
}: ParsedClaudeTurn): ConversationTurn {
  return turn
}

function findSessionFile(root: string, sessionId: string) {
  return walkProjectLogs(root).find((filePath) => {
    if (path.basename(filePath, '.jsonl') === sessionId) {
      return true
    }

    const firstLine = fs.readFileSync(filePath, 'utf8').split('\n').find(Boolean)
    if (!firstLine) {
      return false
    }

    const row = JSON.parse(firstLine) as JsonMap
    return row.sessionId === sessionId
  })
}

function normalizeClaudeAdapterPaths(rootOrPaths: string | ClaudeAdapterPaths) {
  return typeof rootOrPaths === 'string'
    ? { cliRoot: rootOrPaths, desktopCodeSessionRoot: undefined }
    : rootOrPaths
}

export function createClaudeAdapter(rootOrPaths: string | ClaudeAdapterPaths): SourceAdapter {
  const paths = normalizeClaudeAdapterPaths(rootOrPaths)

  return {
    async listSessions(filters: SessionFilterInput) {
      const desktopMetadata = readDesktopCodeSessionMetadata(paths.desktopCodeSessionRoot)

      return walkProjectLogs(paths.cliRoot)
        .map((filePath) => {
          const rows = readJsonl(filePath)
          const turns = extractClaudeTurns(filePath, rows)

          const firstTurn = turns[0]
          const firstRow = turns[0]?.row ?? rows[0] ?? {}
          const startedAt = String(firstRow.timestamp ?? '')
          const updatedAt =
            turns.at(-1)?.timestamp ||
            startedAt ||
            new Date(fs.statSync(filePath).mtimeMs).toISOString()

          return {
            id:
              String(firstRow.sessionId ?? '').trim() ||
              path.basename(filePath, '.jsonl'),
            sourceType: 'claude' as const,
            title: firstTurn?.text.slice(0, 80) || path.basename(filePath, '.jsonl'),
            projectPath: String(firstRow.cwd ?? ''),
            startedAt,
            updatedAt,
            preview: firstTurn?.text ?? '',
            locator: filePath,
            archived: false,
            turns: turns.map(toConversationTurn)
          }
        })
        .map((summary) =>
          applyDesktopCodeMetadata(summary, desktopMetadata.get(summary.id))
        )
        .filter((summary) => matchesSessionFilters(summary, filters))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    },

    async readSession(sessionId: string, options?: { locator?: string }) {
      const filePath = options?.locator ?? findSessionFile(paths.cliRoot, sessionId)
      if (!filePath) {
        return []
      }

      return extractClaudeTurns(filePath, readJsonl(filePath)).map(toConversationTurn)
    }
  }
}
