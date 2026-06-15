import type { z } from 'zod'
import { workbookItemSchema } from '../../shared/schemas/workbook'

type WorkbookDraft = z.infer<typeof workbookItemSchema>

export function buildWorkbookDrafts(input: {
  workbookId: string
  rankedExpressionDrafts: Array<
    Omit<WorkbookDraft, 'id' | 'workbookId' | 'itemType' | 'state'>
  >
  rankedSentenceDrafts: Array<
    Omit<WorkbookDraft, 'id' | 'workbookId' | 'itemType' | 'state'>
  >
}) {
  return [
    ...input.rankedExpressionDrafts.map((draft, index) => ({
      ...draft,
      id: `expr-${index}`,
      workbookId: input.workbookId,
      itemType: 'Expression' as const,
      state: 'active' as const
    })),
    ...input.rankedSentenceDrafts.map((draft, index) => ({
      ...draft,
      id: `sent-${index}`,
      workbookId: input.workbookId,
      itemType: 'Sentence' as const,
      state: 'active' as const
    }))
  ]
}

export function writeWorkbookDraft(
  db: { prepare: (sql: string) => { run: (...args: any[]) => unknown } },
  input: {
    workbookId: string
    jobId: string
    items: Array<{
      id: string
      itemType: 'Expression' | 'Sentence'
      generatedSnapshot: unknown
      currentSnapshot: unknown
      sourceRefs: Array<{
        sessionId: string
        sourceSpanRef: string
        excerpt: string
      }>
    }>
  }
) {
  db.prepare(
    `
      insert into workbooks (id, job_id, created_at, status)
      values (?, ?, ?, 'draft')
    `
  ).run(input.workbookId, input.jobId, new Date().toISOString())

  for (const item of input.items) {
    db.prepare(
      `
        insert into workbook_items (
          id,
          workbook_id,
          item_type,
          generated_snapshot_json,
          current_snapshot_json,
          source_refs_json,
          state
        )
        values (?, ?, ?, ?, ?, ?, 'active')
      `
    ).run(
      item.id,
      input.workbookId,
      item.itemType,
      JSON.stringify(item.generatedSnapshot),
      JSON.stringify(item.currentSnapshot),
      JSON.stringify(item.sourceRefs)
    )
  }

  db.prepare(`update workbooks set status = 'ready' where id = ?`).run(input.workbookId)
}
