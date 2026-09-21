import type BetterSqlite3 from 'better-sqlite3'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { verifyExportDirectory } from './commit'

type Sqlite = InstanceType<typeof BetterSqlite3>

export type ExportRunDiagnostic = {
  runId: string
  status: 'complete-directory' | 'missing-directory' | 'invalid-directory'
  outputPath: string | null
  reason: string | null
}

export async function diagnoseStartedExportRuns(
  sqlite: Sqlite
): Promise<ExportRunDiagnostic[]> {
  const rows = sqlite
    .prepare(
      `
        select id, output_path as outputPath, metadata_json as metadataJson
        from export_runs
        where status = 'started'
        order by started_at asc, id asc
      `
    )
    .all() as Array<{
    id: string
    outputPath: string
    metadataJson: string
  }>

  return Promise.all(rows.map((row) => diagnoseStartedRun(row)))
}

async function diagnoseStartedRun(row: {
  id: string
  outputPath: string
  metadataJson: string
}): Promise<ExportRunDiagnostic> {
  const metadata = parseMetadata(row.metadataJson)
  const outputName = typeof metadata.outputName === 'string' ? metadata.outputName : null
  const candidates = await findCandidates(row.outputPath, outputName)
  let invalidReason: string | null = null
  let existingCandidateCount = 0

  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) {
      continue
    }
    if (outputName && !matchesOutputName(candidate, outputName)) {
      continue
    }
    existingCandidateCount += 1
    const verification = await verifyExportDirectory(candidate)
    if (!verification.valid) {
      invalidReason = verification.reason
      continue
    }

    if (
      verification.schemaVersion === 2 &&
      typeof verification.manifest.runId === 'string' &&
      verification.manifest.runId !== row.id
    ) {
      invalidReason = 'manifest belongs to another export run'
      continue
    }

    return {
      runId: row.id,
      status: 'complete-directory',
      outputPath: candidate,
      reason: null
    }
  }

  return {
    runId: row.id,
    status: existingCandidateCount > 0 && invalidReason
      ? 'invalid-directory'
      : 'missing-directory',
    outputPath: candidates[0] ?? null,
    reason: invalidReason
  }
}

async function pathExists(candidate: string) {
  try {
    await stat(candidate)
    return true
  } catch {
    return false
  }
}

function matchesOutputName(candidate: string, outputName: string) {
  const escapedName = outputName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escapedName}(?:-\\d+)?$`).test(path.basename(candidate))
}

async function findCandidates(outputPath: string, outputName: string | null) {
  const candidates = new Set<string>()
  candidates.add(outputPath)

  if (!outputName) {
    return [...candidates]
  }

  try {
    const entries = await readdir(outputPath, { withFileTypes: true })
    const escapedName = outputName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const candidatePattern = new RegExp(`^${escapedName}(?:-\\d+)?$`)
    for (const entry of entries) {
      if (entry.isDirectory() && candidatePattern.test(entry.name)) {
        candidates.add(path.join(outputPath, entry.name))
      }
    }
  } catch {
    // A missing parent is itself a useful diagnostic; no cleanup is attempted.
  }

  return [...candidates]
}

function parseMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed !== null && typeof parsed === 'object'
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}
