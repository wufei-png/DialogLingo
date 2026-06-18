import { describe, expect, it } from 'vitest'
import { createDb } from '../../../src/main/db/client'
import { runMigrations } from '../../../src/main/db/migrate'
import {
  assertGenerationJobStopped,
  buildGenerationRunSnapshot,
  createGenerationJobCheckpoint,
  getJobResumeStatus,
  loadResumeCheckpointPayload,
  persistGenerationCheckpointEvent,
  readGenerationRunSnapshot,
  resolveGenerationSettingsForRun
} from '../../../src/main/generation/checkpointStore'
import type { Settings } from '../../../src/shared/schemas/settings'

const settings = {
  provider: {
    baseUrl: 'http://localhost:4000',
    apiKey: 'sk-secret',
    defaultModel: 'gpt-test'
  },
  modelBackend: {
    kind: 'openai-compatible',
    cli: {
      codex: { executablePath: '', model: '' },
      claude: { executablePath: '', model: '' },
      opencode: { executablePath: '', model: '' },
      timeoutMs: 120000
    }
  },
  generation: {
    defaultLanguageDirection: 'en-zh',
    expressionDifficulty: 'average',
    batchSize: 2,
    boundedConcurrency: 1,
    maxItemsPerSession: 4,
    typeBalanceProfile: {
      targetExpression: 0.6,
      targetSentence: 0.4,
      lambda: 0.1
    }
  },
  privacy: {
    redactBeforeRemoteSend: true,
    flaggedItemExportPolicy: 'warn'
  },
  scan: {
    pathOverrides: [],
    scanOnLaunch: true,
    includeArchivedSessions: false
  },
  ui: {
    splitRatio: 0.3,
    workbookSplitRatio: 0.65,
    workbookSourcePinned: false
  }
} satisfies Settings

const draft = {
  itemType: 'Expression' as const,
  sourceText: 'ship it',
  targetText: '发布它',
  gloss: 'release something',
  contextText: 'We can ship it today.',
  explanation: 'A common software delivery phrase.',
  quizPrompt: 'Translate: 发布它',
  quizAnswer: 'ship it',
  tags: ['release']
}

function createMigratedDb() {
  const { sqlite } = createDb(':memory:')
  runMigrations(sqlite)
  sqlite
    .prepare(
      `
        insert into sessions (
          id,
          source_type,
          source_session_id,
          title,
          started_at,
          updated_at,
          preview,
          search_text,
          is_archived,
          raw_locator,
          hash
        )
        values (
          's1',
          'codex',
          's1',
          'Checkpoint source',
          '2026-06-18T00:00:00Z',
          '2026-06-18T00:05:00Z',
          'preview',
          'search text',
          0,
          'fixture',
          'hash-1'
        )
      `
    )
    .run()
  return sqlite
}

describe('generation checkpoint store', () => {
  it('persists auditable checkpoints without storing API keys', () => {
    const db = createMigratedDb()
    const snapshot = buildGenerationRunSnapshot({
      sessionIds: ['s1'],
      settings,
      promptOverride: 'custom prompt',
      runKind: 'start'
    })

    createGenerationJobCheckpoint({
      db,
      jobId: 'job-1',
      createdAt: '2026-06-18T00:10:00Z',
      snapshot,
      sessionSnapshots: [
        {
          sessionId: 's1',
          title: 'Checkpoint source',
          hash: 'hash-1'
        }
      ]
    })

    persistGenerationCheckpointEvent(db, {
      kind: 'checkpoint',
      jobId: 'job-1',
      checkpoint: 'candidate_groups',
      candidates: [
        {
          id: 'candidate-job-1-0-0',
          sessionId: 's1',
          sessionTitle: 'Checkpoint source',
          sourceSpanRef: 'turn-1',
          promptText: 'We can ship it today.',
          role: 'assistant',
          status: 'pending'
        }
      ]
    })
    persistGenerationCheckpointEvent(db, {
      kind: 'checkpoint',
      jobId: 'job-1',
      checkpoint: 'enrichment_batch_completed',
      batchIndex: 0,
      request: {
        batchIndex: 0,
        prompt: 'prompt text',
        candidates: [
          {
            id: 'candidate-job-1-0-0',
            sessionId: 's1',
            sessionTitle: 'Checkpoint source',
            sourceSpanRef: 'turn-1',
            promptText: 'We can ship it today.',
            status: 'pending'
          }
        ]
      },
      response: {
        drafts: [draft],
        items: [
          {
            id: 'expr-job-1-1',
            itemType: 'Expression',
            generatedSnapshot: draft,
            currentSnapshot: draft,
            sourceRefs: [
              {
                sessionId: 's1',
                sourceSpanRef: 'turn-1',
                excerpt: 'We can ship it today.'
              }
            ]
          }
        ]
      }
    })
    persistGenerationCheckpointEvent(db, {
      kind: 'checkpoint',
      jobId: 'job-1',
      checkpoint: 'ranked_orders',
      rankProfile: settings.generation.typeBalanceProfile,
      orderedIds: ['expr-job-1-1']
    })
    db.prepare(
      "update generation_jobs set status = 'failed', progress_json = ? where id = 'job-1'"
    ).run(JSON.stringify({ lastCheckpoint: 'ranked_orders' }))

    const rawJob = db
      .prepare(
        "select selected_filters_json as selectedFiltersJson from generation_jobs where id = 'job-1'"
      )
      .get() as { selectedFiltersJson: string }
    const selectedFilters = JSON.parse(rawJob.selectedFiltersJson)
    expect(selectedFilters.provider.apiKey).toBeUndefined()

    const status = getJobResumeStatus(db, 'job-1')
    expect(status).toMatchObject({
      canResume: true,
      checkpoint: 'ranked_orders',
      resumeBlockedReason: null
    })

    const payload = loadResumeCheckpointPayload(db, 'job-1')
    expect(payload.completedBatches[0]?.response.drafts).toMatchObject([draft])
    expect(payload.rankedOrderIds).toEqual(['expr-job-1-1'])
  })

  it('blocks resume when source hashes changed but keeps restart metadata readable', () => {
    const db = createMigratedDb()
    const snapshot = buildGenerationRunSnapshot({
      sessionIds: ['s1'],
      settings,
      runKind: 'start'
    })

    createGenerationJobCheckpoint({
      db,
      jobId: 'job-2',
      createdAt: '2026-06-18T00:10:00Z',
      snapshot,
      sessionSnapshots: [
        {
          sessionId: 's1',
          title: 'Checkpoint source',
          hash: 'hash-1'
        }
      ]
    })
    db.prepare("update sessions set hash = 'hash-2' where id = 's1'").run()
    db.prepare(
      "update generation_jobs set status = 'cancelled', progress_json = ? where id = 'job-2'"
    ).run(JSON.stringify({ lastCheckpoint: 'generation_job_sessions' }))

    expect(getJobResumeStatus(db, 'job-2')).toMatchObject({
      canResume: false,
      checkpoint: null
    })
    expect(readGenerationRunSnapshot(db, 'job-2')?.sessionIds).toEqual(['s1'])
  })

  it('persists failed batch diagnostics for restart and resume decisions', () => {
    const db = createMigratedDb()
    const snapshot = buildGenerationRunSnapshot({
      sessionIds: ['s1'],
      settings,
      runKind: 'start'
    })

    createGenerationJobCheckpoint({
      db,
      jobId: 'job-3',
      createdAt: '2026-06-18T00:10:00Z',
      snapshot,
      sessionSnapshots: [
        {
          sessionId: 's1',
          title: 'Checkpoint source',
          hash: 'hash-1'
        }
      ]
    })
    persistGenerationCheckpointEvent(db, {
      kind: 'checkpoint',
      jobId: 'job-3',
      checkpoint: 'candidate_groups',
      candidates: [
        {
          id: 'candidate-job-3-0-0',
          sessionId: 's1',
          sessionTitle: 'Checkpoint source',
          sourceSpanRef: 'turn-1',
          promptText: 'We can ship it today.',
          status: 'pending'
        }
      ]
    })
    persistGenerationCheckpointEvent(db, {
      kind: 'checkpoint',
      jobId: 'job-3',
      checkpoint: 'enrichment_batch_failed',
      batchIndex: 0,
      request: {
        batchIndex: 0,
        prompt: 'prompt text',
        candidates: []
      },
      error: {
        reason: 'model-request-failure',
        message: 'gateway unavailable'
      }
    })
    db.prepare(
      "update generation_jobs set status = 'failed', progress_json = ? where id = 'job-3'"
    ).run(JSON.stringify({ lastCheckpoint: 'enrichment_batches' }))

    const row = db
      .prepare(
        "select status, response_json as responseJson from enrichment_batches where job_id = 'job-3'"
      )
      .get() as { status: string; responseJson: string }
    expect(row.status).toBe('failed')
    expect(JSON.parse(row.responseJson).error).toMatchObject({
      reason: 'model-request-failure',
      message: 'gateway unavailable'
    })
    expect(getJobResumeStatus(db, 'job-3')).toMatchObject({
      canResume: true,
      checkpoint: 'enrichment_batches'
    })
  })

  it('does not trust incomplete ranked checkpoint rows', () => {
    const db = createMigratedDb()
    const snapshot = buildGenerationRunSnapshot({
      sessionIds: ['s1'],
      settings,
      runKind: 'start'
    })

    createGenerationJobCheckpoint({
      db,
      jobId: 'job-4',
      createdAt: '2026-06-18T00:10:00Z',
      snapshot,
      sessionSnapshots: [
        {
          sessionId: 's1',
          title: 'Checkpoint source',
          hash: 'hash-1'
        }
      ]
    })
    persistGenerationCheckpointEvent(db, {
      kind: 'checkpoint',
      jobId: 'job-4',
      checkpoint: 'candidate_groups',
      candidates: [
        {
          id: 'candidate-job-4-0-0',
          sessionId: 's1',
          sessionTitle: 'Checkpoint source',
          sourceSpanRef: 'turn-1',
          promptText: 'We can ship it today.',
          status: 'pending'
        },
        {
          id: 'candidate-job-4-0-1',
          sessionId: 's1',
          sessionTitle: 'Checkpoint source',
          sourceSpanRef: 'turn-2',
          promptText: 'This second candidate requires another batch.',
          status: 'pending'
        },
        {
          id: 'candidate-job-4-0-2',
          sessionId: 's1',
          sessionTitle: 'Checkpoint source',
          sourceSpanRef: 'turn-3',
          promptText: 'A third candidate proves the ranked checkpoint is incomplete.',
          status: 'pending'
        }
      ]
    })
    persistGenerationCheckpointEvent(db, {
      kind: 'checkpoint',
      jobId: 'job-4',
      checkpoint: 'enrichment_batch_completed',
      batchIndex: 0,
      request: {
        batchIndex: 0,
        prompt: 'prompt text',
        candidates: []
      },
      response: {
        drafts: [draft],
        items: [
          {
            id: 'expr-job-4-1',
            itemType: 'Expression',
            generatedSnapshot: draft,
            currentSnapshot: draft,
            sourceRefs: []
          }
        ]
      }
    })
    persistGenerationCheckpointEvent(db, {
      kind: 'checkpoint',
      jobId: 'job-4',
      checkpoint: 'ranked_orders',
      rankProfile: settings.generation.typeBalanceProfile,
      orderedIds: ['expr-job-4-1']
    })
    db.prepare(
      "update generation_jobs set status = 'failed', progress_json = ? where id = 'job-4'"
    ).run(JSON.stringify({ lastCheckpoint: 'ranked_orders' }))

    expect(getJobResumeStatus(db, 'job-4')).toMatchObject({
      canResume: true,
      checkpoint: 'enrichment_batches'
    })
  })

  it('rejects legacy incomplete generation snapshots', () => {
    const db = createMigratedDb()
    db.prepare(
      `
        insert into generation_jobs (
          id,
          created_at,
          status,
          selected_filters_json,
          selected_session_count,
          progress_json
        )
        values (
          'legacy-job',
          '2026-06-18T00:10:00Z',
          'failed',
          ?,
          1,
          '{}'
        )
      `
    ).run(JSON.stringify({ sessionIds: ['s1'] }))

    expect(readGenerationRunSnapshot(db, 'legacy-job')).toBeNull()
  })

  it('allows resume and restart only for stopped jobs', () => {
    const db = createMigratedDb()
    const snapshot = buildGenerationRunSnapshot({
      sessionIds: ['s1'],
      settings,
      runKind: 'start'
    })

    createGenerationJobCheckpoint({
      db,
      jobId: 'job-5',
      createdAt: '2026-06-18T00:10:00Z',
      snapshot,
      sessionSnapshots: [
        {
          sessionId: 's1',
          title: 'Checkpoint source',
          hash: 'hash-1'
        }
      ]
    })

    expect(() => assertGenerationJobStopped(db, 'job-5')).toThrow(
      'Only failed or cancelled generation jobs'
    )
    db.prepare("update generation_jobs set status = 'cancelled' where id = 'job-5'").run()
    expect(() => assertGenerationJobStopped(db, 'job-5')).not.toThrow()
  })

  it('uses current credentials with the stored non-secret generation config', () => {
    const snapshot = buildGenerationRunSnapshot({
      sessionIds: ['s1'],
      settings,
      runKind: 'start'
    })
    const runtime = resolveGenerationSettingsForRun({
      snapshot,
      currentSettings: {
        ...settings,
        provider: {
          baseUrl: 'http://changed.example',
          apiKey: 'sk-current',
          defaultModel: 'changed'
        }
      }
    })

    expect(runtime.provider).toEqual({
      baseUrl: 'http://localhost:4000',
      apiKey: 'sk-current',
      defaultModel: 'gpt-test'
    })
  })
})
