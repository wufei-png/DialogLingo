import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { countHighlightMarkers } from '../../../../shared/highlight'
import { ResizableSplitPane } from '../../components/ResizableSplitPane'
import { trpc } from '../../lib/trpc'
import { useJobSubscription } from '../../lib/useJobSubscription'
import { CardStream } from './CardStream'
import { ExportModal } from './ExportModal'
import { SourcePanel } from './SourcePanel'
import { WorkbookToolbar } from './WorkbookToolbar'
import {
  closeWorkbookSource,
  getInitialWorkbookSourceMode,
  moveWorkbookSelection,
  openWorkbookSource,
  pinWorkbookSource,
  reconcileWorkbookSelection,
  selectAfterWorkbookRemoval,
  unpinWorkbookSource,
  type WorkbookSourceMode
} from './workbookModel'
import { getWorkbookStoppedState } from './workbookStoppedModel'

type WorkbookItem = {
  id: string
  workbookId: string
  itemType: 'Expression' | 'Sentence'
  state: 'active' | 'deleted'
  generatedSnapshot: Record<string, unknown>
  currentSnapshot: Record<string, unknown>
  sourceRefs: Array<{
    sessionId: string
    sourceSpanRef: string
    excerpt: string
  }>
  isEdited: boolean
}

type WorkbookSourcePreview = {
  session: {
    sessionId: string
    title: string
    sourceType: string
    projectPath: string | null
    updatedAt: string
  }
  turns: Array<{ seq: number; role: string; text: string }>
  matchedBy: 'source-span' | 'highlight-text' | 'none'
}

function getMarkedText(preview: WorkbookSourcePreview | null) {
  return preview?.turns.map((turn) => turn.text).join('\n\n') ?? ''
}

function isTextEditingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable)
  )
}

function formatJobStatus(status: string | null | undefined, t: TFunction) {
  switch (status) {
    case 'pending':
    case 'normalizing':
    case 'mining':
    case 'enriching':
    case 'ranking':
    case 'materializing':
    case 'completed':
    case 'failed':
    case 'cancelled':
    case 'stopped':
      return t(`workbook.status.${status}`)
    case null:
    case undefined:
      return t('workbook.status.starting')
    default:
      return status
  }
}

export function WorkbookPage(props: {
  workbookSplitRatio: number
  workbookSourcePinned: boolean
  onWorkbookSplitRatioChange: (ratio: number) => void
  onWorkbookSplitRatioCommit: (ratio: number) => void
  onWorkbookSourcePinnedChange: (pinned: boolean) => Promise<void>
  onWorkbookReady: (payload: { jobId: string; workbookId: string }) => void
  onBackToSearch: () => void
  jobId: string | null
  workbookId: string | null
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'all' | 'expressions' | 'sentences' | 'deleted'>('all')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [sourceMode, setSourceMode] = useState<WorkbookSourceMode>(
    getInitialWorkbookSourceMode(props.workbookSourcePinned)
  )
  const [sourceRefIndex, setSourceRefIndex] = useState(0)
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const [focusTargetRevision, setFocusTargetRevision] = useState(0)
  const [exportOpen, setExportOpen] = useState(false)
  const [stoppedActionPending, setStoppedActionPending] = useState<
    'resume' | 'restart' | null
  >(null)
  const [stoppedActionError, setStoppedActionError] = useState<string | null>(null)

  useJobSubscription()

  const jobQuery = useQuery({
    enabled: Boolean(props.jobId),
    queryKey: ['job-snapshot', props.jobId],
    queryFn: async () =>
      (await trpc.jobSnapshot.query({
        jobId: props.jobId!
      })) as {
        status: string
        selectedSessionCount: number
        processedSessionCount: number
        createdItemCount: number
        warningCount: number
        failureCount: number
        currentSessionTitle?: string | null
        currentBatchLabel?: string | null
        lastCheckpoint?: string | null
        failedBatchCount?: number
        failureReason?: string | null
        canResume?: boolean
        resumeBlockedReason?: string | null
      }
  })

  const workbookQuery = useQuery({
    enabled:
      Boolean(props.workbookId) &&
      (!props.jobId || jobQuery.data?.status === 'completed' || jobQuery.data == null),
    queryKey: ['workbook', props.workbookId, activeTab],
    queryFn: async () =>
      (await trpc.workbookList.query({
        workbookId: props.workbookId!,
        tab: activeTab
      })) as WorkbookItem[]
  })

  const rows = workbookQuery.data ?? []
  const selectedItem = useMemo(
    () => rows.find((item) => item.id === selectedItemId) ?? null,
    [rows, selectedItemId]
  )
  const selectedSourceRefs = selectedItem?.sourceRefs ?? []
  const selectedSourceRef = selectedSourceRefs[sourceRefIndex] ?? selectedSourceRefs[0] ?? null
  const sourcePreviewQuery = useQuery({
    enabled: sourceMode !== 'focus' && Boolean(selectedSourceRef),
    queryKey: [
      'workbook-source-preview',
      selectedSourceRef?.sessionId,
      selectedSourceRef?.sourceSpanRef,
      selectedItem?.currentSnapshot.sourceText
    ],
    queryFn: async () =>
      (await trpc.workbookPreviewSource.query({
        sessionId: selectedSourceRef!.sessionId,
        sourceSpanRef: selectedSourceRef!.sourceSpanRef,
        highlightText: String(selectedItem?.currentSnapshot.sourceText ?? '')
      })) as WorkbookSourcePreview
  })
  const sourcePreview = sourcePreviewQuery.data ?? null
  const sourceMatchCount = countHighlightMarkers(getMarkedText(sourcePreview))

  const hasNoWorkbook = !props.workbookId && !props.jobId
  const isTerminalFailure =
    jobQuery.data?.status === 'failed' || jobQuery.data?.status === 'cancelled'
  const isProgress =
    Boolean(props.jobId) &&
    (!jobQuery.data ||
      !['completed', 'failed', 'cancelled'].includes(jobQuery.data.status))
  const stoppedState = getWorkbookStoppedState(jobQuery.data, {
    statusLabel: t('workbook.status.stopped'),
    failureText: t('workbook.defaults.noWorkbookCreated'),
    lastCheckpoint: t('workbook.defaults.none')
  })

  useEffect(() => {
    if (props.workbookSourcePinned) {
      setSourceMode('pinned')
      return
    }

    setSourceMode((current) => (current === 'pinned' ? 'focus' : current))
  }, [props.workbookSourcePinned])

  useEffect(() => {
    if (jobQuery.data?.status !== 'completed' || !props.workbookId) {
      return
    }

    void queryClient.invalidateQueries({
      queryKey: ['workbook', props.workbookId]
    })
  }, [jobQuery.data?.status, props.workbookId, queryClient])

  useEffect(() => {
    const reconciled = reconcileWorkbookSelection(rows, selectedItemId)
    if (reconciled !== selectedItemId) {
      setSelectedItemId(reconciled)
    }
  }, [rows, selectedItemId])

  useEffect(() => {
    setSourceRefIndex(0)
    setActiveMatchIndex(0)
  }, [selectedItemId])

  useEffect(() => {
    setActiveMatchIndex(0)
  }, [sourcePreview])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTextEditingTarget(event.target)) {
        return
      }

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedItemId((current) => moveWorkbookSelection(rows, current, 1))
        return
      }

      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedItemId((current) => moveWorkbookSelection(rows, current, -1))
        return
      }

      if (event.key === 'Enter' && selectedItemId) {
        event.preventDefault()
        setFocusTargetRevision((current) => current + 1)
        return
      }

      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        selectedItem &&
        selectedItem.state !== 'deleted'
      ) {
        event.preventDefault()
        void deleteItem(selectedItem.id)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [rows, selectedItem, selectedItemId])

  async function invalidateWorkbook() {
    if (!props.workbookId) {
      return
    }

    await queryClient.invalidateQueries({
      queryKey: ['workbook', props.workbookId, activeTab]
    })
  }

  async function saveItem(itemId: string, nextSnapshot: {
    sourceText: string
    targetText: string
    gloss: string
    explanation: string
    contextText: string
    quizPrompt: string
    quizAnswer: string
    tags: string[]
  }) {
    await trpc.workbookSaveItem.mutate({
      itemId,
      currentSnapshot: nextSnapshot
    })
    await invalidateWorkbook()
  }

  async function deleteItem(itemId: string) {
    setSelectedItemId((current) => selectAfterWorkbookRemoval(rows, itemId, current))
    await trpc.workbookDeleteItem.mutate({ itemId })
    await invalidateWorkbook()
  }

  async function resumeGeneration() {
    if (!props.jobId || stoppedActionPending) {
      return
    }

    setStoppedActionPending('resume')
    setStoppedActionError(null)
    try {
      const response = (await trpc.generationResume.mutate({
        jobId: props.jobId
      })) as { jobId: string; workbookId: string }
      props.onWorkbookReady(response)
    } catch (error) {
      setStoppedActionError(
        error instanceof Error ? error.message : t('workbook.resumeFailed')
      )
    } finally {
      setStoppedActionPending(null)
    }
  }

  async function restartGeneration() {
    if (!props.jobId || stoppedActionPending) {
      return
    }

    setStoppedActionPending('restart')
    setStoppedActionError(null)
    try {
      const response = (await trpc.generationRestart.mutate({
        jobId: props.jobId
      })) as { jobId: string; workbookId: string }
      props.onWorkbookReady(response)
    } catch (error) {
      setStoppedActionError(
        error instanceof Error ? error.message : t('workbook.restartFailed')
      )
    } finally {
      setStoppedActionPending(null)
    }
  }

  function selectNextItem() {
    setSelectedItemId((current) => moveWorkbookSelection(rows, current, 1))
  }

  function openSource(itemId: string) {
    setSelectedItemId(itemId)
    setSourceMode(openWorkbookSource(props.workbookSourcePinned))
  }

  function closeSource() {
    setSourceMode(closeWorkbookSource())
    if (props.workbookSourcePinned) {
      void props.onWorkbookSourcePinnedChange(false)
    }
  }

  function pinSource() {
    setSourceMode(pinWorkbookSource())
    void props.onWorkbookSourcePinnedChange(true)
  }

  function unpinSource() {
    setSourceMode(unpinWorkbookSource())
    void props.onWorkbookSourcePinnedChange(false)
  }

  const sourcePanel = (
    <SourcePanel
      open={sourceMode !== 'focus'}
      pinned={sourceMode === 'pinned'}
      loading={sourcePreviewQuery.isFetching}
      preview={sourcePreview}
      sourceRefIndex={sourceRefIndex}
      sourceRefCount={selectedSourceRefs.length}
      matchCount={sourceMatchCount}
      activeMatchIndex={activeMatchIndex}
      onClose={closeSource}
      onPin={pinSource}
      onUnpin={unpinSource}
      onPrevSourceRef={() =>
        setSourceRefIndex((current) =>
          selectedSourceRefs.length === 0
            ? 0
            : (current - 1 + selectedSourceRefs.length) % selectedSourceRefs.length
        )
      }
      onNextSourceRef={() =>
        setSourceRefIndex((current) =>
          selectedSourceRefs.length === 0
            ? 0
            : (current + 1) % selectedSourceRefs.length
        )
      }
      onPrevMatch={() =>
        setActiveMatchIndex((current) =>
          sourceMatchCount === 0
            ? 0
            : (current - 1 + sourceMatchCount) % sourceMatchCount
        )
      }
      onNextMatch={() =>
        setActiveMatchIndex((current) =>
          sourceMatchCount === 0 ? 0 : (current + 1) % sourceMatchCount
        )
      }
    />
  )

  const workbookSurface = (
    <section className="workbook-main-pane">
      {hasNoWorkbook ? (
        <div className="boot-card workbook-empty-state">
          <p className="boot-eyebrow">{t('workbook.title')}</p>
          <h2>{t('workbook.emptyTitle')}</h2>
        </div>
      ) : isProgress ? (
        <div className="workbook-progress-state boot-card">
          <p className="boot-eyebrow">{t('workbook.progress')}</p>
          <h2>{formatJobStatus(jobQuery.data?.status, t)}</h2>
          <p>
            {t('workbook.progressSessions', {
              processed: jobQuery.data?.processedSessionCount ?? 0,
              total: jobQuery.data?.selectedSessionCount ?? 0
            })}
          </p>
          {jobQuery.data?.currentSessionTitle || jobQuery.data?.currentBatchLabel ? (
            <p className="workbook-progress-detail">
              {[jobQuery.data.currentSessionTitle, jobQuery.data.currentBatchLabel]
                .filter(Boolean)
                .join(' - ')}
            </p>
          ) : null}
        </div>
      ) : isTerminalFailure ? (
        <div className="workbook-progress-state boot-card">
          <p className="boot-eyebrow">{t('workbook.generationStopped')}</p>
          <h2>{formatJobStatus(stoppedState.statusLabel, t)}</h2>
          <p>{stoppedState.failureText}</p>
          <div className="workbook-stopped-details">
            <span>
              {t('workbook.lastCheckpoint')}{' '}
              <strong>{stoppedState.lastCheckpoint}</strong>
            </span>
            <span>
              {t('workbook.failedBatches')}{' '}
              <strong>{stoppedState.failedBatchCount}</strong>
            </span>
          </div>
          {stoppedState.resumeBlockedReason ? (
            <p className="workbook-stopped-warning">
              {stoppedState.resumeBlockedReason}
            </p>
          ) : null}
          {stoppedActionError ? (
            <p className="workbook-stopped-warning">{stoppedActionError}</p>
          ) : null}
          <div className="workbook-stopped-actions">
            <button
              type="button"
              disabled={!stoppedState.canResume || Boolean(stoppedActionPending)}
              onClick={() => void resumeGeneration()}
            >
              {stoppedActionPending === 'resume'
                ? t('workbook.resuming')
                : t('workbook.resumeFromCheckpoint')}
            </button>
            <button
              type="button"
              disabled={Boolean(stoppedActionPending)}
              onClick={() => void restartGeneration()}
            >
              {stoppedActionPending === 'restart'
                ? t('workbook.restarting')
                : t('workbook.restartGeneration')}
            </button>
            <button
              type="button"
              disabled={Boolean(stoppedActionPending)}
              onClick={props.onBackToSearch}
            >
              {t('workbook.backToSearch')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <WorkbookToolbar
            activeTab={activeTab}
            itemCount={rows.length}
            exportDisabled={!props.workbookId}
            onChangeTab={setActiveTab}
            onExport={() => setExportOpen(true)}
          />
          <CardStream
            rows={rows}
            selectedItemId={selectedItemId}
            focusTargetRevision={focusTargetRevision}
            onSelectItem={setSelectedItemId}
            onAdvanceSelection={selectNextItem}
            onDeleteItem={(itemId) => void deleteItem(itemId)}
            onRestoreItem={(itemId) => {
              void trpc.workbookRestoreItem.mutate({ itemId }).then(() => {
                void invalidateWorkbook()
              })
            }}
            onSaveItem={saveItem}
            onRevertItem={(itemId) => {
              void trpc.workbookRevertItem.mutate({ itemId }).then(() => {
                void invalidateWorkbook()
              })
            }}
            onOpenSource={openSource}
          />
        </>
      )}
    </section>
  )

  return (
    <div className="workbook-page">
      {sourceMode === 'pinned' ? (
        <ResizableSplitPane
          className="workbook-layout workbook-layout--pinned"
          ratio={props.workbookSplitRatio}
          onRatioChange={props.onWorkbookSplitRatioChange}
          onRatioCommit={props.onWorkbookSplitRatioCommit}
          left={workbookSurface}
          right={sourcePanel}
        />
      ) : (
        <div className="workbook-layout workbook-layout--focus">
          {workbookSurface}
          {sourceMode === 'drawer' ? (
            <div className="source-drawer-backdrop" onClick={closeSource}>
              <div className="source-drawer" onClick={(event) => event.stopPropagation()}>
                {sourcePanel}
              </div>
            </div>
          ) : null}
        </div>
      )}
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onConfirm={async (payload) => {
          if (!props.workbookId) {
            return {
              ok: false as const,
              message: t('export.noWorkbookSelected')
            }
          }

          return (await trpc.exportRun.mutate({
            workbookId: props.workbookId,
            request: payload
          })) as
            | {
                ok: true
                outputLocation: string
                outputPath?: string
              }
            | {
                ok: false
                message?: string
              }
        }}
      />
    </div>
  )
}
