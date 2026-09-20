import fs from 'node:fs'
import path from 'node:path'
import type { LanguageHint, SessionFilterInput, SessionSummary, SourceType } from './types'

export function walkFiles(root: string, predicate: (file: string) => boolean): string[] {
  if (!fs.existsSync(root)) {
    return []
  }

  const entries = fs.readdirSync(root, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)

    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath, predicate))
      continue
    }

    if (entry.isFile() && predicate(fullPath)) {
      files.push(fullPath)
    }
  }

  return files
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T
}

export function readJsonLines<T>(file: string): T[] {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

export type JsonlRecord<T> = {
  value: T
  lineNumber: number
}

export function readJsonlTolerant<T>(
  filePath: string,
  onInvalidLine: (lineNumber: number) => void
): JsonlRecord<T>[] {
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .flatMap((line, index) => {
      if (!line.trim()) {
        return []
      }

      try {
        return [{ value: JSON.parse(line) as T, lineNumber: index + 1 }]
      } catch {
        onInvalidLine(index + 1)
        return []
      }
    })
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function buildPreview(value: string, maxLength = 160): string {
  const normalized = normalizeText(value)
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`
}

export function detectLanguageHint(value: string): LanguageHint {
  const hasLatin = /[A-Za-z]/.test(value)
  const hasCjk = /[\u3400-\u9fff]/.test(value)

  if (hasLatin && hasCjk) {
    return 'mixed'
  }

  if (hasLatin) {
    return 'en'
  }

  if (hasCjk) {
    return 'zh'
  }

  return 'unknown'
}

export function toIsoString(value: unknown): string | null {
  if (typeof value === 'string') {
    const epoch = Date.parse(value)
    return Number.isNaN(epoch) ? null : new Date(epoch).toISOString()
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }

  return null
}

export function buildSourceSpanRef(root: string, file: string, lineNumber?: number): string {
  const relative = path.relative(root, file).split(path.sep).join('/')
  return lineNumber == null ? relative : `${relative}#L${lineNumber}`
}

export function applySessionFilters(
  sessions: SessionSummary[],
  filters: SessionFilterInput,
  sourceType: SourceType
): SessionSummary[] {
  if (filters.platforms.length > 0 && !filters.platforms.includes(sourceType)) {
    return []
  }

  const loweredQuery = filters.query.trim().toLowerCase()

  return sessions
    .filter((session) => {
      if (filters.projects.length > 0 && !filters.projects.includes(session.projectPath)) {
        return false
      }

      if (filters.timeRange) {
        const updatedAt = Date.parse(session.updatedAt)
        const from = Date.parse(filters.timeRange.from)
        const to = Date.parse(filters.timeRange.to)

        if (Number.isNaN(updatedAt) || Number.isNaN(from) || Number.isNaN(to)) {
          return false
        }

        if (updatedAt < from || updatedAt > to) {
          return false
        }
      }

      if (!loweredQuery) {
        return true
      }

      return [session.title, session.preview, session.projectPath]
        .map((field) => field.toLowerCase())
        .some((field) => field.includes(loweredQuery))
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}
