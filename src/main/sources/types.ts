export type SourceType = 'codex' | 'claude' | 'opencode'

export type SessionFilterInput = {
  query: string
  timeRange: { from: string; to: string } | null
  projects: string[]
  platforms: SourceType[]
  includeArchived: boolean
}

export type SessionSummary = {
  id: string
  sourceType: SourceType
  title: string
  projectPath: string
  startedAt: string
  updatedAt: string
  preview: string
  locator: string
  archived?: boolean
  // scanSessions reuses these when listSessions already parsed a transcript,
  // avoiding a second large file read for the same session.
  turns?: ConversationTurn[]
}

export type ConversationTurn = {
  id: string
  role: 'user' | 'assistant'
  text: string
  languageHint: 'en' | 'zh' | 'mixed' | 'unknown'
  sourceSpanRef: string
}

export type LanguageHint = ConversationTurn['languageHint']

export type SourceAdapter = {
  listSessions: (filters: SessionFilterInput) => Promise<SessionSummary[]>
  readSession: (id: string, options?: { locator?: string }) => Promise<ConversationTurn[]>
}

export type SourceRegistry = Record<SourceType, SourceAdapter>

export function detectLanguageHint(text: string): ConversationTurn['languageHint'] {
  const hasAsciiWord = /[A-Za-z]/.test(text)
  const hasCjk = /[\u3400-\u9fff]/.test(text)

  if (hasAsciiWord && hasCjk) {
    return 'mixed'
  }
  if (hasCjk) {
    return 'zh'
  }
  if (hasAsciiWord) {
    return 'en'
  }
  return 'unknown'
}

export function matchesSessionFilters(
  summary: SessionSummary,
  filters: SessionFilterInput
) {
  const query = filters.query.trim().toLowerCase()
  const haystack = `${summary.title}\n${summary.preview}\n${summary.projectPath}`.toLowerCase()
  const queryPass = !query || haystack.includes(query)
  const projectPass =
    filters.projects.length === 0 || filters.projects.includes(summary.projectPath)
  const platformPass =
    filters.platforms.length === 0 || filters.platforms.includes(summary.sourceType)
  const timePass =
    !filters.timeRange ||
    (summary.updatedAt >= filters.timeRange.from &&
      summary.updatedAt <= filters.timeRange.to)

  return queryPass && projectPass && platformPass && timePass
}
