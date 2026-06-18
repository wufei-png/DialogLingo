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

export function createOpenCodeAdapter(root: string): SourceAdapter {
  return {
    async listSessions(filters: SessionFilterInput) {
      return walkSessionFiles(root)
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
    }
  }
}
