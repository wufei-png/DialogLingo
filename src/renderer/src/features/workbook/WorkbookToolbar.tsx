type WorkbookTab = 'all' | 'expressions' | 'sentences' | 'deleted'

type Props = {
  activeTab: WorkbookTab
  stats: string
  onChangeTab: (tab: WorkbookTab) => void
  exportDisabled: boolean
  onExport: () => void
}

export function WorkbookToolbar({
  activeTab,
  stats,
  onChangeTab,
  exportDisabled,
  onExport
}: Props) {
  return (
    <header className="workbook-toolbar">
      <div className="workbook-tabs">
        <button
          type="button"
          aria-pressed={activeTab === 'all'}
          onClick={() => onChangeTab('all')}
        >
          All
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'expressions'}
          onClick={() => onChangeTab('expressions')}
        >
          Expressions
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'sentences'}
          onClick={() => onChangeTab('sentences')}
        >
          Sentences
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'deleted'}
          onClick={() => onChangeTab('deleted')}
        >
          Deleted
        </button>
      </div>
      <div className="workbook-stats">{stats}</div>
      <button type="button" disabled={exportDisabled} onClick={onExport}>
        Export
      </button>
    </header>
  )
}
