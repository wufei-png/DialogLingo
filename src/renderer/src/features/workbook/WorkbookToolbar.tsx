import { useTranslation } from 'react-i18next'

type WorkbookTab = 'all' | 'expressions' | 'sentences' | 'deleted'

type Props = {
  activeTab: WorkbookTab
  itemCount: number
  onChangeTab: (tab: WorkbookTab) => void
  exportDisabled: boolean
  onExport: () => void
}

export function WorkbookToolbar({
  activeTab,
  itemCount,
  onChangeTab,
  exportDisabled,
  onExport
}: Props) {
  const { t } = useTranslation()

  return (
    <header className="workbook-toolbar">
      <div className="workbook-tabs">
        <button
          type="button"
          aria-pressed={activeTab === 'all'}
          onClick={() => onChangeTab('all')}
        >
          {t('workbook.tabs.all')}
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'expressions'}
          onClick={() => onChangeTab('expressions')}
        >
          {t('workbook.tabs.expressions')}
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'sentences'}
          onClick={() => onChangeTab('sentences')}
        >
          {t('workbook.tabs.sentences')}
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'deleted'}
          onClick={() => onChangeTab('deleted')}
        >
          {t('workbook.tabs.deleted')}
        </button>
      </div>
      <div className="workbook-stats">{t('workbook.itemsCount', { count: itemCount })}</div>
      <button type="button" disabled={exportDisabled} onClick={onExport}>
        {t('workbook.export')}
      </button>
    </header>
  )
}
