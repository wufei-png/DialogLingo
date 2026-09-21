import type BetterSqlite3 from 'better-sqlite3'

export const EXPORT_RUN_STATUSES = ['started', 'completed', 'failed'] as const
export type ExportRunStatus = (typeof EXPORT_RUN_STATUSES)[number]

export const EXPORT_FAILURE_CODES = [
  'invalid-output-location',
  'package-build-failed',
  'payload-write-failed',
  'database-update-failed',
  'unknown'
] as const
export type ExportFailureCode = (typeof EXPORT_FAILURE_CODES)[number]

type Sqlite = InstanceType<typeof BetterSqlite3>

export type ExportRunMetadata = Record<string, unknown>

export function createExportRunStore(sqlite: Sqlite) {
  return {
    start(input: {
      id: string
      workbookId: string
      exportType: string
      outputPath: string
      startedAt: string
      metadata?: ExportRunMetadata
    }) {
      sqlite
        .prepare(
          `
            insert into export_runs (
              id,
              workbook_id,
              export_type,
              output_path,
              created_at,
              metadata_json,
              status,
              started_at
            )
            values (?, ?, ?, ?, ?, ?, 'started', ?)
          `
        )
        .run(
          input.id,
          input.workbookId,
          input.exportType,
          input.outputPath,
          input.startedAt,
          JSON.stringify(input.metadata ?? {}),
          input.startedAt
        )

      return input.id
    },

    complete(input: {
      id: string
      outputPath: string
      completedAt: string
      metadata?: ExportRunMetadata
    }) {
      const result = sqlite
        .prepare(
          `
            update export_runs
            set
              output_path = ?,
              metadata_json = ?,
              status = 'completed',
              completed_at = ?,
              failed_at = null,
              error_code = null,
              error_message = null
            where id = ?
          `
        )
        .run(
          input.outputPath,
          JSON.stringify(input.metadata ?? {}),
          input.completedAt,
          input.id
        )

      if (result.changes !== 1) {
        throw new Error(`Export run not found while completing: ${input.id}`)
      }
    },

    fail(input: {
      id: string
      failedAt: string
      code: ExportFailureCode
      message: string
      metadata?: ExportRunMetadata
    }) {
      const result = sqlite
        .prepare(
          `
            update export_runs
            set
              metadata_json = ?,
              status = 'failed',
              failed_at = ?,
              error_code = ?,
              error_message = ?
            where id = ?
          `
        )
        .run(
          JSON.stringify(input.metadata ?? {}),
          input.failedAt,
          input.code,
          limitErrorMessage(input.message),
          input.id
        )

      if (result.changes !== 1) {
        throw new Error(`Export run not found while failing: ${input.id}`)
      }
    }
  }
}

export function classifyExportFailure(
  error: unknown,
  phase: 'build' | 'write' | 'database' = 'write'
): ExportFailureCode {
  if (phase === 'database') {
    return 'database-update-failed'
  }

  if (phase === 'build') {
    return 'package-build-failed'
  }

  if (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    ['EACCES', 'EISDIR', 'ENOENT', 'ENOTDIR', 'EROFS'].includes(String(error.code))
  ) {
    return 'invalid-output-location'
  }

  return 'payload-write-failed'
}

export function exportErrorMessage(error: unknown): string {
  return limitErrorMessage(error instanceof Error ? error.message : String(error))
}

function limitErrorMessage(message: string) {
  return message.replace(/\u0000/g, '').slice(0, 500)
}
