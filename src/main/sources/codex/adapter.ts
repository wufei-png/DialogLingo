import fs from 'node:fs'
import path from 'node:path'
import {
  detectLanguageHint,
  matchesSessionFilters,
  type CachedSessionParse,
  type ConversationTurn,
  type SessionFilterInput,
  type SessionSummary,
  type SourceAdapter,
  type SourceAdapterOptions,
  type SourceDiagnostic,
  type SourceFileFingerprint
} from '../types'
import { readJsonlTolerant, type JsonlRecord } from '../utils'
import { logger } from '../../logging'

type JsonMap = Record<string, unknown>
type JsonlRow = JsonlRecord<JsonMap>
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

function getFileFingerprint(filePath: string): SourceFileFingerprint {
  const stats = fs.statSync(filePath)
  return {
    sizeBytes: stats.size,
    mtimeMs: stats.mtimeMs
  }
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

function loadSessionIndex(
  root: string,
  onInvalidLine: (filePath: string, lineNumber: number) => void
) {
  const indexPath = path.join(root, 'session_index.jsonl')
  const titles = new Map<string, string>()

  if (!fs.existsSync(indexPath)) {
    return titles
  }

  for (const { value: row } of readJsonlTolerant<{
    id?: string
    thread_name?: string
  }>(indexPath, (lineNumber) => onInvalidLine(indexPath, lineNumber))) {
    if (row.id && row.thread_name) {
      titles.set(row.id, row.thread_name)
    }
  }

  return titles
}

function extractRolloutTurns(filePath: string, rows: JsonlRow[]): ParsedCodexTurn[] {
  const turns = rows
    .flatMap(({ value: row, lineNumber }) => {
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
          id: `codex-turn-${lineNumber - 1}`,
          role: normalizedRole,
          text,
          languageHint: detectLanguageHint(text),
          sourceSpanRef: `${filePath}:${lineNumber}`,
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
  onInvalidLine: (filePath: string, lineNumber: number) => void
): SessionSummary | null {
  const rows = readJsonlTolerant<JsonMap>(filePath, (lineNumber) =>
    onInvalidLine(filePath, lineNumber)
  )
  const meta = rows.find(({ value }) => value.type === 'session_meta')?.value
  const payload = (meta?.payload as JsonMap | undefined) ?? {}
  const turns = extractRolloutTurns(filePath, rows)

  const sessionId =
    String(payload.id ?? '').trim() || path.basename(filePath, '.jsonl')
  const fallbackTitle = turns[0]?.text.slice(0, 80) || path.basename(filePath)
  const updatedAt =
    turns.at(-1)?.timestamp ||
    String(rows.at(-1)?.value.timestamp ?? '') ||
    String(payload.timestamp ?? '') ||
    new Date(fs.statSync(filePath).mtimeMs).toISOString()
  const startedAt =
    String(payload.timestamp ?? '') ||
    turns[0]?.timestamp ||
    updatedAt

  return {
    id: sessionId,
    sourceType: 'codex',
    title: fallbackTitle,
    projectPath: String(payload.cwd ?? ''),
    startedAt,
    updatedAt,
    preview: turns[0]?.text ?? '',
    locator: filePath,
    archived: filePath.includes(`${path.sep}archived_sessions${path.sep}`),
    turns: turns.map(toConversationTurn)
  }
}

function withTitleIndex(
  summary: Omit<SessionSummary, 'turns'>,
  titleIndex: Map<string, string>
): Omit<SessionSummary, 'turns'> {
  return {
    ...summary,
    title: titleIndex.get(summary.id) ?? summary.title
  }
}

function fromCachedRollout(
  cached: CachedSessionParse,
  titleIndex: Map<string, string>
): SessionSummary {
  return {
    ...withTitleIndex(cached.summary, titleIndex),
    turns: cached.turns
  }
}

function loadRolloutSummary(
  filePath: string,
  titleIndex: Map<string, string>,
  onInvalidLine: (filePath: string, lineNumber: number) => void,
  options?: SourceAdapterOptions
) {
  const fingerprint = getFileFingerprint(filePath)
  const cached = options?.cache?.read({
    sourceType: 'codex',
    locator: filePath,
    fingerprint
  })

  if (cached) {
    return fromCachedRollout(cached, titleIndex)
  }

  let hadInvalidLine = false
  const summary = summarizeRollout(filePath, (invalidFilePath, lineNumber) => {
    hadInvalidLine = true
    onInvalidLine(invalidFilePath, lineNumber)
  })
  if (summary) {
    if (!hadInvalidLine) {
      options?.cache?.write({
        sourceType: 'codex',
        locator: filePath,
        fingerprint,
        summary,
        turns: summary.turns ?? []
      })
    }
    return {
      ...withTitleIndex(summary, titleIndex),
      turns: summary.turns
    }
  }

  return null
}

function readCachedRolloutTurns(filePath: string, options?: SourceAdapterOptions) {
  const fingerprint = getFileFingerprint(filePath)
  return options?.cache?.read({
    sourceType: 'codex',
    locator: filePath,
    fingerprint
  })?.turns
}

function findSessionFile(
  root: string,
  sessionId: string,
  onInvalidLine: (filePath: string, lineNumber: number) => void
) {
  const files = [
    ...walkJsonlFiles(path.join(root, 'sessions')),
    ...walkJsonlFiles(path.join(root, 'archived_sessions'))
  ]

  for (const filePath of files) {
    if (path.basename(filePath).includes(sessionId)) {
      return filePath
    }

    const firstRow = readJsonlTolerant<JsonMap>(filePath, (lineNumber) =>
      onInvalidLine(filePath, lineNumber)
    )[0]?.value
    if (!firstRow) {
      continue
    }

    const payload = firstRow.payload as JsonMap | undefined
    if (payload?.id === sessionId) {
      return filePath
    }
  }

  return null
}

export function createCodexAdapter(
  root: string,
  adapterOptions?: SourceAdapterOptions
): SourceAdapter {
  let diagnostics: SourceDiagnostic[] = []
  const recordedInvalidLines = new Set<string>()

  function recordInvalidLine(filePath: string, lineNumber: number) {
    const key = `${filePath}:${lineNumber}`
    if (recordedInvalidLines.has(key)) {
      return
    }
    recordedInvalidLines.add(key)
    diagnostics.push({
      sourceType: 'codex',
      code: 'source-jsonl-line-invalid',
      message: 'Codex 来源包含无法读取的 JSONL 记录；其余有效记录已保留。'
    })
  }

  return {
    async listSessions(filters: SessionFilterInput) {
      diagnostics = []
      recordedInvalidLines.clear()
      const titleIndex = loadSessionIndex(root, recordInvalidLine)
      const activeFiles = walkJsonlFiles(path.join(root, 'sessions'))
      const archivedFiles = filters.includeArchived
        ? walkJsonlFiles(path.join(root, 'archived_sessions'))
        : []

      return [...activeFiles, ...archivedFiles]
        .map((filePath) =>
          loadRolloutSummary(filePath, titleIndex, recordInvalidLine, adapterOptions)
        )
        .filter((summary): summary is SessionSummary => Boolean(summary))
        .filter((summary) => matchesSessionFilters(summary, filters))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    },

    async readSession(sessionId: string, options?: { locator?: string }) {
      const filePath =
        options?.locator ?? findSessionFile(root, sessionId, recordInvalidLine)
      if (!filePath) {
        logger.debug('source-adapter', 'codex session file missing', {
          sessionId
        })
        return []
      }

      return (
        readCachedRolloutTurns(filePath, adapterOptions) ??
        extractRolloutTurns(
          filePath,
          readJsonlTolerant<JsonMap>(filePath, (lineNumber) =>
            recordInvalidLine(filePath, lineNumber)
          )
        ).map(toConversationTurn)
      )
    },

    getDiagnostics() {
      return diagnostics
    }
  }
}
