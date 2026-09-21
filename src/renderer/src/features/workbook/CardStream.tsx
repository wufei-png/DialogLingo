import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from 'react-i18next'
import { WorkbookCard } from './WorkbookCard'
import type { WorkbookSaveState } from './workbookSaveQueue'

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
  editVersion: number
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
    flagged?: boolean
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
  selectionFocusRevision: number
  focusTargetRevision: number
  onSelectItem: (itemId: string) => void
  onAdvanceSelection: () => void
  onDeleteItem: (itemId: string) => void
  onRestoreItem: (itemId: string) => void
  onSaveItem: (itemId: string, nextSnapshot: WorkbookSnapshotPatch) => Promise<void>
  saveStates: Map<string, WorkbookSaveState>
  onDraftChange: (itemId: string, nextSnapshot: WorkbookSnapshotPatch) => void
  onDiscardDraft: (itemId: string) => void
  onRetrySave: (itemId: string) => Promise<void>
  onRevertItem: (itemId: string) => void
  onOpenSource: (itemId: string) => void
}) {
  const { t } = useTranslation()
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
  const anchorRefs = useRef(new Map<string, HTMLElement>())
  const pendingFocusItemIdRef = useRef<string | null>(null)
  const lastSelectionFocusRevisionRef = useRef(0)
  const focusRetryCountRef = useRef(0)
  const focusTimerRef = useRef<number | null>(null)
  const focusAttemptRef = useRef<() => void>(() => {})

  const scheduleFocusAttempt = useCallback(() => {
    if (focusTimerRef.current !== null) {
      window.clearTimeout(focusTimerRef.current)
    }

    focusTimerRef.current = window.setTimeout(() => {
      focusTimerRef.current = null
      focusAttemptRef.current()
    }, 0)
  }, [])

  focusAttemptRef.current = () => {
    const itemId = pendingFocusItemIdRef.current
    if (!itemId) {
      return
    }

    const anchor = anchorRefs.current.get(itemId)
    if (anchor) {
      anchor.focus({ preventScroll: true })
      pendingFocusItemIdRef.current = null
      focusRetryCountRef.current = 0
      return
    }

    if (focusRetryCountRef.current >= 20) {
      pendingFocusItemIdRef.current = null
      return
    }

    focusRetryCountRef.current += 1
    scheduleFocusAttempt()
  }

  const registerAnchor = useCallback(
    (itemId: string, element: HTMLElement | null) => {
      if (element) {
        anchorRefs.current.set(itemId, element)
        if (pendingFocusItemIdRef.current === itemId) {
          scheduleFocusAttempt()
        }
        return
      }

      anchorRefs.current.delete(itemId)
    },
    [scheduleFocusAttempt]
  )

  useEffect(() => {
    return () => {
      if (focusTimerRef.current !== null) {
        window.clearTimeout(focusTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (selectedIndex >= 0) {
      virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
    }
  }, [selectedIndex, virtualizer])

  useEffect(() => {
    if (
      props.selectionFocusRevision <= lastSelectionFocusRevisionRef.current ||
      props.selectedItemId == null ||
      selectedIndex < 0
    ) {
      return
    }

    lastSelectionFocusRevisionRef.current = props.selectionFocusRevision
    pendingFocusItemIdRef.current = props.selectedItemId
    focusRetryCountRef.current = 0
    virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
    scheduleFocusAttempt()
  }, [
    props.selectedItemId,
    props.selectionFocusRevision,
    scheduleFocusAttempt,
    selectedIndex,
    virtualizer
  ])

  if (props.rows.length === 0) {
    return <div className="workbook-empty-list">{t('workbook.noItemsInView')}</div>
  }

  return (
    <div className="workbook-stream" ref={parentRef}>
      <div
        className="workbook-stream-virtual"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const row = props.rows[virtualItem.index]
          const saveState = props.saveStates.get(row.id)
          const snapshot = saveState?.draftSnapshot ?? row.currentSnapshot
          const confirmedSnapshot = saveState?.confirmedSnapshot ?? row.currentSnapshot
          return (
            <div
              key={row.id}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              className="workbook-stream-row"
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              <WorkbookCard
                itemId={row.id}
                itemType={row.itemType}
                source={String(snapshot.sourceText ?? '')}
                target={String(snapshot.targetText ?? '')}
                gloss={String(snapshot.gloss ?? '')}
                explanation={String(snapshot.explanation ?? '')}
                contextText={String(snapshot.contextText ?? '')}
                quiz={String(snapshot.quizPrompt ?? '')}
                quizAnswer={String(snapshot.quizAnswer ?? '')}
                tags={String((snapshot.tags ?? []).join(', '))}
                confirmedSnapshot={{
                  sourceText: String(confirmedSnapshot.sourceText ?? ''),
                  targetText: String(confirmedSnapshot.targetText ?? ''),
                  gloss: String(confirmedSnapshot.gloss ?? ''),
                  explanation: String(confirmedSnapshot.explanation ?? ''),
                  contextText: String(confirmedSnapshot.contextText ?? ''),
                  quizPrompt: String(confirmedSnapshot.quizPrompt ?? ''),
                  quizAnswer: String(confirmedSnapshot.quizAnswer ?? ''),
                  tags: confirmedSnapshot.tags ?? []
                }}
                sourceRefCount={row.sourceRefs.length}
                deleted={row.state === 'deleted'}
                selected={props.selectedItemId === row.id}
                modified={row.isEdited}
                tabIndex={props.selectedItemId === row.id ? 0 : -1}
                anchorRef={(element) => registerAnchor(row.id, element)}
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
                onDraftChange={(nextSnapshot) => props.onDraftChange(row.id, nextSnapshot)}
                onDiscardDraft={() => props.onDiscardDraft(row.id)}
                saveStatus={saveState?.status ?? 'idle'}
                saveError={saveState?.error ?? null}
                onRetry={() => props.onRetrySave(row.id)}
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
