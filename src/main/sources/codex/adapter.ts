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
import { logger } from '../../logging'

type JsonMap = Record<string, unknown>
type ParsedCodexTurn = ConversationTurn & { timestamp: string }

function walkJsonlFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    logger.debug('source-adapter', 'codex transcript directory missing', {
      collection: path.basename(dir)
    })
    return []
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkJsonlFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
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

function extractMessageText(content: unknown): string {
  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .flatMap((item) => {
      if (!item || typeof item !== 'object') {
        return []
      }

      const chunk = item as Record<string, unknown>
      return [
        chunk.text,
        chunk.input_text,
        chunk.output_text
      ].filter((value): value is string => typeof value === 'string')
    })
    .join('\n')
    .trim()
}

function isEnvironmentContextText(text: string) {
  const trimmed = text.trim()
  return (
    trimmed.startsWith('<environment_context>') &&
    trimmed.endsWith('</environment_context>')
  )
}

function filterInitialEnvironmentContextTurn(turns: ParsedCodexTurn[]) {
  const [firstTurn] = turns
  if (firstTurn?.role === 'user' && isEnvironmentContextText(firstTurn.text)) {
    return turns.slice(1)
  }

  return turns
}

function loadSessionIndex(root: string) {
  const indexPath = path.join(root, 'session_index.jsonl')
  const titles = new Map<string, string>()

  if (!fs.existsSync(indexPath)) {
    return titles
  }

  for (const line of fs.readFileSync(indexPath, 'utf8').split('\n').filter(Boolean)) {
    const row = JSON.parse(line) as { id?: string; thread_name?: string }
    if (row.id && row.thread_name) {
      titles.set(row.id, row.thread_name)
    }
  }

  return titles
}

function extractRolloutTurns(filePath: string, rows: JsonMap[]): ParsedCodexTurn[] {
  const turns = rows
    .flatMap((row, index) => {
      if (row.type !== 'response_item') {
        return []
      }

      const message = row.payload as JsonMap | undefined
      if (!message || message.type !== 'message') {
        return []
      }

      const role = String(message.role ?? '')
      if (role !== 'user' && role !== 'assistant') {
        return []
      }
      const normalizedRole: ConversationTurn['role'] = role

      const text = extractMessageText(message.content)
      if (!text) {
        return []
      }

      return [
        {
          id: `codex-turn-${index}`,
          role: normalizedRole,
          text,
          languageHint: detectLanguageHint(text),
          sourceSpanRef: `${filePath}:${index + 1}`,
          timestamp: String(row.timestamp ?? '')
        }
      ]
    })

  return filterInitialEnvironmentContextTurn(turns)
}

function toConversationTurn({
  timestamp: _timestamp,
  ...turn
}: ParsedCodexTurn): ConversationTurn {
  return turn
}

function summarizeRollout(
  filePath: string,
  titleIndex: Map<string, string>
): SessionSummary | null {
  const rows = readJsonl(filePath)
  const meta = rows.find((row) => row.type === 'session_meta') as JsonMap | undefined
  const payload = (meta?.payload as JsonMap | undefined) ?? {}
  const turns = extractRolloutTurns(filePath, rows)

  const sessionId =
    String(payload.id ?? '').trim() || path.basename(filePath, '.jsonl')
  const fallbackTitle = turns[0]?.text.slice(0, 80) || path.basename(filePath)
  const updatedAt =
    turns.at(-1)?.timestamp ||
    String(rows.at(-1)?.timestamp ?? '') ||
    String(payload.timestamp ?? '') ||
    new Date(fs.statSync(filePath).mtimeMs).toISOString()
  const startedAt =
    String(payload.timestamp ?? '') ||
    turns[0]?.timestamp ||
    updatedAt

  return {
    id: sessionId,
    sourceType: 'codex',
    title: titleIndex.get(sessionId) ?? fallbackTitle,
    projectPath: String(payload.cwd ?? ''),
    startedAt,
    updatedAt,
    preview: turns[0]?.text ?? '',
    locator: filePath,
    archived: filePath.includes(`${path.sep}archived_sessions${path.sep}`),
    turns: turns.map(toConversationTurn)
  }
}

function findSessionFile(root: string, sessionId: string) {
  const files = [
    ...walkJsonlFiles(path.join(root, 'sessions')),
    ...walkJsonlFiles(path.join(root, 'archived_sessions'))
  ]

  for (const filePath of files) {
    if (path.basename(filePath).includes(sessionId)) {
      return filePath
    }

    const firstLine = fs.readFileSync(filePath, 'utf8').split('\n').find(Boolean)
    if (!firstLine) {
      continue
    }

    const row = JSON.parse(firstLine) as JsonMap
    const payload = row.payload as JsonMap | undefined
    if (payload?.id === sessionId) {
      return filePath
    }
  }

  return null
}

export function createCodexAdapter(root: string): SourceAdapter {
  return {
    async listSessions(filters: SessionFilterInput) {
      const titleIndex = loadSessionIndex(root)
      const activeFiles = walkJsonlFiles(path.join(root, 'sessions'))
      const archivedFiles = filters.includeArchived
        ? walkJsonlFiles(path.join(root, 'archived_sessions'))
        : []

      return [...activeFiles, ...archivedFiles]
        .map((filePath) => summarizeRollout(filePath, titleIndex))
        .filter((summary): summary is SessionSummary => Boolean(summary))
        .filter((summary) => matchesSessionFilters(summary, filters))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    },

    async readSession(sessionId: string, options?: { locator?: string }) {
      const filePath = options?.locator ?? findSessionFile(root, sessionId)
      if (!filePath) {
        logger.debug('source-adapter', 'codex session file missing', {
          sessionId
        })
        return []
      }

      return extractRolloutTurns(filePath, readJsonl(filePath)).map(toConversationTurn)
    }
  }
}
