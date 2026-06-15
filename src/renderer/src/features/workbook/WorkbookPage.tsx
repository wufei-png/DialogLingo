import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
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
    queryKey: ['job-snapshot-fetch', props.jobId],
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

  if (!props.workbookId && !props.jobId) {
    return (
      <div className="boot-card">
        <p className="boot-eyebrow">Workbook</p>
        <h2>Generate a workbook from Search &amp; Select to review items here.</h2>
      </div>
    )
  }

  if (props.jobId && jobQuery.data && jobQuery.data.status !== 'completed') {
    return (
      <div className="workbook-progress-state boot-card">
        <p className="boot-eyebrow">Generation Progress</p>
        <h2>{jobQuery.data.status}</h2>
        <p>
          {jobQuery.data.processedSessionCount} / {jobQuery.data.selectedSessionCount} sessions
        </p>
      </div>
    )
  }

  return (
    <div className="workbook-page">
      <WorkbookToolbar
        activeTab={activeTab}
        stats={`${rows.length} items`}
        onChangeTab={setActiveTab}
        onExport={() => setExportOpen(true)}
      />
      <div className="workbook-layout">
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
      </div>
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
