import { ChevronLeft, ChevronRight, Pin, PinOff, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { IconLabel } from '../../components/IconLabel'
import { SessionPreviewPane } from '../search/SessionPreviewPane'

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

type Props = {
  open: boolean
  pinned: boolean
  loading: boolean
  preview: WorkbookSourcePreview | null
  sourceRefIndex: number
  sourceRefCount: number
  matchCount: number
  activeMatchIndex: number
  onClose: () => void
  onPin: () => void
  onUnpin: () => void
  onPrevSourceRef: () => void
  onNextSourceRef: () => void
  onPrevMatch: () => void
  onNextMatch: () => void
}

function formatSourceType(value: string, unknownSource: string) {
  if (value === 'codex') {
    return 'Codex'
  }
  if (value === 'claude') {
    return 'Claude Code'
  }
  if (value === 'opencode') {
    return 'OpenCode'
  }
  return value || unknownSource
}

export function SourcePanel(props: Props) {
  const { t } = useTranslation()

  if (!props.open) {
    return null
  }

  const headerMeta = props.preview ? (
    <>
      <span>{formatSourceType(props.preview.session.sourceType, t('common.unknownSource'))}</span>
      {props.preview.session.projectPath ? <span>{props.preview.session.projectPath}</span> : null}
      {props.preview.session.updatedAt ? <span>{props.preview.session.updatedAt}</span> : null}
      <span>
        {props.preview.matchedBy === 'source-span'
          ? t('workbook.source.sourceSpan')
          : props.preview.matchedBy === 'highlight-text'
            ? t('workbook.source.textMatch')
            : t('workbook.source.noMatch')}
      </span>
    </>
  ) : null

  return (
    <aside className={props.pinned ? 'source-panel is-pinned' : 'source-panel'}>
      <div className="source-panel-actions">
        {props.sourceRefCount > 1 ? (
          <>
            <button type="button" onClick={props.onPrevSourceRef}>
              <IconLabel icon={ChevronLeft}>{t('workbook.source.previousRef')}</IconLabel>
            </button>
            <span className="source-panel-counter">
              {props.sourceRefIndex + 1}/{props.sourceRefCount}
            </span>
            <button type="button" onClick={props.onNextSourceRef}>
              <IconLabel icon={ChevronRight}>{t('workbook.source.nextRef')}</IconLabel>
            </button>
          </>
        ) : null}
        {props.pinned ? (
          <button type="button" onClick={props.onUnpin}>
            <IconLabel icon={PinOff}>{t('workbook.source.unpin')}</IconLabel>
          </button>
        ) : (
          <button type="button" onClick={props.onPin}>
            <IconLabel icon={Pin}>{t('workbook.source.pin')}</IconLabel>
          </button>
        )}
        <button type="button" onClick={props.onClose}>
          <IconLabel icon={X}>{t('common.close')}</IconLabel>
        </button>
      </div>
      {props.loading ? (
        <div className="source-panel-placeholder">{t('workbook.source.loading')}</div>
      ) : props.preview ? (
        <SessionPreviewPane
          className="source-preview"
          kicker={t('workbook.source.context')}
          sessionTitle={props.preview.session.title}
          turns={props.preview.turns}
          fallbackPreview={t('workbook.source.noContent')}
          enableHighlights
          matchCount={props.matchCount}
          activeMatchIndex={props.activeMatchIndex}
          onPrevMatch={props.onPrevMatch}
          onNextMatch={props.onNextMatch}
          headerMeta={headerMeta}
        />
      ) : (
        <div className="source-panel-placeholder">
          <h3>{t('workbook.source.overview')}</h3>
          <p>{t('workbook.source.overviewHelp')}</p>
        </div>
      )}
    </aside>
  )
}
