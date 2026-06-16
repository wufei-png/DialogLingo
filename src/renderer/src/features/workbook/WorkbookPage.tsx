import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { NavSectionId } from '../../../../shared/navigation'
import { ResizableSplitPane } from '../../components/ResizableSplitPane'
import { SectionTabs } from '../../components/SectionTabs'
import { trpc } from '../../lib/trpc'
import { useJobSubscription } from '../../lib/useJobSubscription'
import { CardStream } from './CardStream'
import { ExportModal } from './ExportModal'
import { SourcePanel } from './SourcePanel'
import { WorkbookToolbar } from './WorkbookToolbar'

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

export function WorkbookPage(props: {
  activeSection: NavSectionId
  onChangeSection: (section: NavSectionId) => void
  splitRatio: number
  onSplitRatioChange: (ratio: number) => void
  onSplitRatioCommit: (ratio: number) => void
  onOpenSettings: () => void
  jobId: string | null
  workbookId: string | null
}) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'all' | 'expressions' | 'sentences' | 'deleted'>('all')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [sourceItemId, setSourceItemId] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)

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
        failureReason?: string | null
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
  const sourceItem = useMemo(
    () => rows.find((item) => item.id === sourceItemId) ?? null,
    [rows, sourceItemId]
  )

  const hasNoWorkbook = !props.workbookId && !props.jobId
  const isTerminalFailure =
    jobQuery.data?.status === 'failed' || jobQuery.data?.status === 'cancelled'
  const isProgress =
    Boolean(props.jobId) &&
    (!jobQuery.data ||
      !['completed', 'failed', 'cancelled'].includes(jobQuery.data.status))

  useEffect(() => {
    if (jobQuery.data?.status !== 'completed' || !props.workbookId) {
      return
    }

    void queryClient.invalidateQueries({
      queryKey: ['workbook', props.workbookId]
    })
  }, [jobQuery.data?.status, props.workbookId, queryClient])

  return (
    <div className="workbook-page">
      <ResizableSplitPane
        className="workbook-layout"
        ratio={props.splitRatio}
        onRatioChange={props.onSplitRatioChange}
        onRatioCommit={props.onSplitRatioCommit}
        left={(
          <section className="workbook-left-pane">
            <SectionTabs
              activeSection={props.activeSection}
              onChangeSection={props.onChangeSection}
            />
            {hasNoWorkbook ? (
              <div className="boot-card workbook-empty-state">
                <p className="boot-eyebrow">Workbook</p>
                <h2>Generate a workbook from Search &amp; Select.</h2>
              </div>
            ) : isProgress ? (
              <div className="workbook-progress-state boot-card">
                <p className="boot-eyebrow">Generation Progress</p>
                <h2>{jobQuery.data?.status ?? 'starting'}</h2>
                <p>
                  {jobQuery.data?.processedSessionCount ?? 0} /{' '}
                  {jobQuery.data?.selectedSessionCount ?? 0} sessions
                </p>
              </div>
            ) : isTerminalFailure ? (
              <div className="workbook-progress-state boot-card">
                <p className="boot-eyebrow">Generation stopped</p>
                <h2>{jobQuery.data?.status}</h2>
                <p>{jobQuery.data?.failureReason ?? 'No workbook was created.'}</p>
              </div>
            ) : (
              <>
                <WorkbookToolbar
                  activeTab={activeTab}
                  stats={`${rows.length} items`}
                  onChangeTab={setActiveTab}
                />
                <CardStream
                  rows={rows}
                  selectedItemId={selectedItemId}
                  onSelectItem={setSelectedItemId}
                  onDeleteItem={(itemId) => {
                    void trpc.workbookDeleteItem.mutate({ itemId }).then(() => {
                      void queryClient.invalidateQueries({
                        queryKey: ['workbook', props.workbookId, activeTab]
                      })
                    })
                  }}
                  onRestoreItem={(itemId) => {
                    void trpc.workbookRestoreItem.mutate({ itemId }).then(() => {
                      void queryClient.invalidateQueries({
                        queryKey: ['workbook', props.workbookId, activeTab]
                      })
                    })
                  }}
                  onSaveItem={(itemId, nextSnapshot) => {
                    void trpc.workbookSaveItem
                      .mutate({
                        itemId,
                        currentSnapshot: nextSnapshot
                      })
                      .then(() => {
                        void queryClient.invalidateQueries({
                          queryKey: ['workbook', props.workbookId, activeTab]
                        })
                      })
                  }}
                  onRevertItem={(itemId) => {
                    void trpc.workbookRevertItem.mutate({ itemId }).then(() => {
                      void queryClient.invalidateQueries({
                        queryKey: ['workbook', props.workbookId, activeTab]
                      })
                    })
                  }}
                  onOpenSource={setSourceItemId}
                />
              </>
            )}
            <footer className="pane-utility-footer">
              <button type="button" onClick={props.onOpenSettings}>
                Settings
              </button>
            </footer>
          </section>
        )}
        right={(
          <section className="workbook-right-pane">
            <header className="workbook-right-header">
              <div>
                <p className="search-preview-kicker">Workbook</p>
                <h2>Source</h2>
              </div>
              <button
                type="button"
                disabled={!props.workbookId}
                onClick={() => setExportOpen(true)}
              >
                Export
              </button>
            </header>
            <SourcePanel
              open={Boolean(sourceItem)}
              title={sourceItem?.itemType ?? ''}
              context={
                sourceItem?.sourceRefs
                  .map((ref) => `${ref.sessionId}\n${ref.sourceSpanRef}\n${ref.excerpt}`)
                  .join('\n\n') ?? ''
              }
              onClose={() => setSourceItemId(null)}
              onPrevMatch={() => undefined}
              onNextMatch={() => undefined}
            />
          </section>
        )}
      />
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onConfirm={(payload) => {
          if (!props.workbookId) {
            return
          }

          void trpc.exportRun
            .mutate({
              workbookId: props.workbookId,
              request: payload
            })
            .finally(() => {
              setExportOpen(false)
            })
        }}
      />
    </div>
  )
}
