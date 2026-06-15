import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'
import { WorkbookCard } from './WorkbookCard'

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
  onSelectItem: (itemId: string) => void
  onDeleteItem: (itemId: string) => void
  onRestoreItem: (itemId: string) => void
  onSaveItem: (
    itemId: string,
    nextSnapshot: {
      sourceText: string
      targetText: string
      gloss: string
      explanation: string
      contextText: string
      quizPrompt: string
      quizAnswer: string
      tags: string[]
    }
  ) => void
  onRevertItem: (itemId: string) => void
  onOpenSource: (itemId: string) => void
}) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const virtualizer = useVirtualizer({
    count: props.rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 360
  })

  return (
    <div ref={parentRef} className="workbook-stream">
      <div
        style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={props.rows[item.index].id}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${item.start}px)`
            }}
          >
            <WorkbookCard
              itemType={props.rows[item.index].itemType}
              source={String(props.rows[item.index].currentSnapshot.sourceText ?? '')}
              target={String(props.rows[item.index].currentSnapshot.targetText ?? '')}
              gloss={String(props.rows[item.index].currentSnapshot.gloss ?? '')}
              explanation={String(props.rows[item.index].currentSnapshot.explanation ?? '')}
              quiz={String(props.rows[item.index].currentSnapshot.quizPrompt ?? '')}
              tags={String((props.rows[item.index].currentSnapshot.tags ?? []).join(', '))}
              deleted={props.rows[item.index].state === 'deleted'}
              selected={props.selectedItemId === props.rows[item.index].id}
              modified={props.rows[item.index].isEdited}
              onSelect={() => props.onSelectItem(props.rows[item.index].id)}
              onDelete={() => props.onDeleteItem(props.rows[item.index].id)}
              onRestore={() => props.onRestoreItem(props.rows[item.index].id)}
              onSave={(nextSnapshot) =>
                props.onSaveItem(props.rows[item.index].id, nextSnapshot)
              }
              onCancelEdit={() => undefined}
              onRevert={() => props.onRevertItem(props.rows[item.index].id)}
              onOpenSource={() => props.onOpenSource(props.rows[item.index].id)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
