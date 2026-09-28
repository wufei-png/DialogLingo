import type Database from 'better-sqlite3'
import type {
  CachedSessionParse,
  ConversationTurn,
  SessionSummary,
  SourceFileFingerprint,
  SourceScanCache,
  SourceType
} from './types'

type SourceScanCacheRow = {
  summaryJson: string
  turnsJson: string
}

const SOURCE_PARSER_VERSIONS: Record<SourceType, string> = {
  codex: 'codex-parser-v3',
  claude: 'claude-parser-v3',
  opencode: 'opencode-parser-v3'
}

export function getSourceParserVersion(sourceType: SourceType) {
  return SOURCE_PARSER_VERSIONS[sourceType]
}

function toCachedSummary(summary: SessionSummary): Omit<SessionSummary, 'turns'> {
  const { turns: _turns, ...cachedSummary } = summary
  return cachedSummary
}

function parseCachedRow(row: SourceScanCacheRow | undefined): CachedSessionParse | null {
  if (!row) {
    return null
  }

  try {
    return {
      summary: JSON.parse(row.summaryJson) as Omit<SessionSummary, 'turns'>,
      turns: JSON.parse(row.turnsJson) as ConversationTurn[]
    }
  } catch {
    return null
  }
}

export function createSqliteSourceScanCache(
  db: Database.Database
): SourceScanCache {
  const read = db.prepare(
    `
      select
        summary_json as summaryJson,
        turns_json as turnsJson
      from source_scan_cache
      where source_type = ?
        and locator = ?
        and parser_version = ?
        and size_bytes = ?
        and mtime_ms = ?
      limit 1
    `
  )
  const write = db.prepare(
    `
      insert into source_scan_cache (
        source_type,
        locator,
        parser_version,
        size_bytes,
        mtime_ms,
        summary_json,
        turns_json,
        updated_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(source_type, locator) do update set
        parser_version = excluded.parser_version,
        size_bytes = excluded.size_bytes,
        mtime_ms = excluded.mtime_ms,
        summary_json = excluded.summary_json,
        turns_json = excluded.turns_json,
        updated_at = excluded.updated_at
    `
  )

  return {
    read(input: {
      sourceType: SourceType
      locator: string
      fingerprint: SourceFileFingerprint
    }) {
      return parseCachedRow(
        read.get(
          input.sourceType,
          input.locator,
          getSourceParserVersion(input.sourceType),
          input.fingerprint.sizeBytes,
          input.fingerprint.mtimeMs
        ) as SourceScanCacheRow | undefined
      )
    },
    write(input: {
      sourceType: SourceType
      locator: string
      fingerprint: SourceFileFingerprint
      summary: SessionSummary
      turns: ConversationTurn[]
    }) {
      write.run(
        input.sourceType,
        input.locator,
        getSourceParserVersion(input.sourceType),
        input.fingerprint.sizeBytes,
        input.fingerprint.mtimeMs,
        JSON.stringify(toCachedSummary(input.summary)),
        JSON.stringify(input.turns),
        new Date().toISOString()
      )
    }
  }
}
