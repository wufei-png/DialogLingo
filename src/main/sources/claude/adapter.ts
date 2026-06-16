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

function readJsonl(filePath: string): JsonMap[] {
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonMap)
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

export function createClaudeAdapter(root: string): SourceAdapter {
  return {
    async listSessions(filters: SessionFilterInput) {
      return walkProjectLogs(root)
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
        .filter((summary) => matchesSessionFilters(summary, filters))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    },

    async readSession(sessionId: string, options?: { locator?: string }) {
      const filePath = options?.locator ?? findSessionFile(root, sessionId)
      if (!filePath) {
        return []
      }

      return extractClaudeTurns(filePath, readJsonl(filePath)).map(toConversationTurn)
    }
  }
}
