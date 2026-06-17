import { useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { WorkbookCard } from './WorkbookCard'

type WorkbookSnapshotPatch = {
  sourceText: string
  targetText: string
  gloss: string
  explanation: string
  contextText: string
  quizPrompt: string
  quizAnswer: string
  tags: string[]
}

type WorkbookRow = {
  id: string
  itemType: 'Expression' | 'Sentence'
  state: 'active' | 'deleted'
  isEdited: boolean
  currentSnapshot: {
    sourceText?: string
    targetText?: string
    gloss?: string
    explanation?: string
    contextText?: string
    quizPrompt?: string
    quizAnswer?: string
    tags?: string[]
  }
  sourceRefs: Array<{
    sessionId: string
    sourceSpanRef: string
    excerpt: string
  }>
}

export function CardStream(props: {
  rows: WorkbookRow[]
  selectedItemId: string | null
  focusTargetRevision: number
  onSelectItem: (itemId: string) => void
  onAdvanceSelection: () => void
  onDeleteItem: (itemId: string) => void
  onRestoreItem: (itemId: string) => void
  onSaveItem: (itemId: string, nextSnapshot: WorkbookSnapshotPatch) => Promise<void>
  onRevertItem: (itemId: string) => void
  onOpenSource: (itemId: string) => void
}) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const selectedIndex = useMemo(
    () => props.rows.findIndex((row) => row.id === props.selectedItemId),
    [props.rows, props.selectedItemId]
  )
  const virtualizer = useVirtualizer({
    count: props.rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 190,
    overscan: 6
  })

  useEffect(() => {
    if (selectedIndex >= 0) {
      virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
    }
  }, [selectedIndex, virtualizer])

  if (props.rows.length === 0) {
    return <div className="workbook-empty-list">No workbook items in this view.</div>
  }

  return (
    <div className="workbook-stream" ref={parentRef}>
      <div
        className="workbook-stream-virtual"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const row = props.rows[virtualItem.index]
          return (
            <div
              key={row.id}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              className="workbook-stream-row"
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              <WorkbookCard
                itemType={row.itemType}
                source={String(row.currentSnapshot.sourceText ?? '')}
                target={String(row.currentSnapshot.targetText ?? '')}
                gloss={String(row.currentSnapshot.gloss ?? '')}
                explanation={String(row.currentSnapshot.explanation ?? '')}
                contextText={String(row.currentSnapshot.contextText ?? '')}
                quiz={String(row.currentSnapshot.quizPrompt ?? '')}
                quizAnswer={String(row.currentSnapshot.quizAnswer ?? '')}
                tags={String((row.currentSnapshot.tags ?? []).join(', '))}
                deleted={row.state === 'deleted'}
                selected={props.selectedItemId === row.id}
                modified={row.isEdited}
                focusTargetRevision={props.focusTargetRevision}
                onSelect={() => props.onSelectItem(row.id)}
                onDelete={() => props.onDeleteItem(row.id)}
                onRestore={() => props.onRestoreItem(row.id)}
                onSave={(nextSnapshot) => props.onSaveItem(row.id, nextSnapshot)}
                onSaveAndAdvance={async (nextSnapshot) => {
                  await props.onSaveItem(row.id, nextSnapshot)
                  props.onAdvanceSelection()
                }}
                onAdvance={props.onAdvanceSelection}
                onRevert={() => props.onRevertItem(row.id)}
                onOpenSource={() => props.onOpenSource(row.id)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
