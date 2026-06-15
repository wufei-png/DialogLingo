import type { ExportFormat } from '../export/manifest'

export function chooseExportFallback(input: {
  requested: ExportFormat
  failed: boolean
}) {
  if (!input.failed) {
    return input.requested
  }

  return input.requested === 'anki-package'
    ? 'anki-text-bundle'
    : 'generic-text-bundle'
}

export function summarizeSourceIssue(input: {
  kind: 'missing-path' | 'unreadable-source' | 'malformed-payload' | 'hash-mismatch'
  source: 'codex' | 'claude' | 'opencode'
}) {
  return {
    severity: 'warning' as const,
    source: input.source,
    message: input.kind
  }
}
