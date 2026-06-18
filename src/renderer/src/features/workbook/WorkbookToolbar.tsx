import { Download, List, Quote, Text, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { IconLabel } from '../../components/IconLabel'

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
          <IconLabel icon={List}>{t('workbook.tabs.all')}</IconLabel>
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'expressions'}
          onClick={() => onChangeTab('expressions')}
        >
          <IconLabel icon={Quote}>{t('workbook.tabs.expressions')}</IconLabel>
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'sentences'}
          onClick={() => onChangeTab('sentences')}
        >
          <IconLabel icon={Text}>{t('workbook.tabs.sentences')}</IconLabel>
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'deleted'}
          onClick={() => onChangeTab('deleted')}
        >
          <IconLabel icon={Trash2}>{t('workbook.tabs.deleted')}</IconLabel>
        </button>
      </div>
      <div className="workbook-stats">{t('workbook.itemsCount', { count: itemCount })}</div>
      <button type="button" disabled={exportDisabled} onClick={onExport}>
        <IconLabel icon={Download}>{t('workbook.export')}</IconLabel>
      </button>
    </header>
  )
}
