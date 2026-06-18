import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { trpc } from '../../lib/trpc'
import { useEscapeToClose } from '../../lib/useEscapeToClose'

type ExportFormat = 'anki-package' | 'anki-text-bundle' | 'generic-text-bundle'
type ExportConfirmPayload = {
  format: ExportFormat
  deckName: string
  direction: 'en-zh' | 'zh-en' | 'bilingual'
  includeExpressions: boolean
  includeSentences: boolean
  tagPrefix: string
  outputLocation: string
  keepFlaggedItems: boolean
}

type ExportConfirmResult =
  | {
      ok: true
      outputLocation: string
      outputPath?: string
    }
  | {
      ok: false
      message?: string
    }

type Props = {
  open: boolean
  onClose: () => void
  onConfirm: (payload: ExportConfirmPayload) => Promise<ExportConfirmResult>
}

function SelectionButton(props: { selected: boolean; label: string; onToggle: () => void }) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      className={props.selected ? 'selection-button is-selected' : 'selection-button'}
      aria-pressed={props.selected}
      aria-label={
        props.selected
          ? t('common.disable', { label: props.label })
          : t('common.enable', { label: props.label })
      }
      title={props.selected ? t('common.selected') : t('common.notSelected')}
      onClick={props.onToggle}
    >
      <span className="selection-button-check" aria-hidden="true" />
    </button>
  )
}

export function ExportModal({ open, onClose, onConfirm }: Props) {
  const { t } = useTranslation()
  useEscapeToClose(open, onClose)
  const [deckName, setDeckName] = useState('DialogLingo')
  const [direction, setDirection] = useState<'en-zh' | 'zh-en' | 'bilingual'>('bilingual')
  const [includeExpressions, setIncludeExpressions] = useState(true)
  const [includeSentences, setIncludeSentences] = useState(true)
  const [tagPrefix, setTagPrefix] = useState('dialoglingo')
  const [outputLocation, setOutputLocation] = useState('')
  const [keepFlaggedItems, setKeepFlaggedItems] = useState(false)
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || outputLocation) {
      return
    }

    let cancelled = false
    void trpc.exportDefaultOutputLocation.query().then((defaultLocation) => {
      if (!cancelled) {
        setOutputLocation(String(defaultLocation))
      }
    })

    return () => {
      cancelled = true
    }
  }, [open, outputLocation])

  async function runExport(format: ExportFormat) {
    setExportMessage(null)
    setExportError(null)
    setExportingFormat(format)

    try {
      const selection = (await trpc.exportChooseOutputDirectory.mutate({
        currentPath: outputLocation || null,
        title: t('export.chooseFolderTitle')
      })) as { cancelled: boolean; outputLocation: string | null }

      if (selection.cancelled || !selection.outputLocation) {
        setExportMessage(t('export.exportCancelled'))
        return
      }

      setOutputLocation(selection.outputLocation)
      const result = await onConfirm({
        format,
        deckName,
        direction,
        includeExpressions,
        includeSentences,
        tagPrefix,
        outputLocation: selection.outputLocation,
        keepFlaggedItems
      })

      if (result.ok) {
        setExportMessage(
          t('export.exportSuccess', {
            path: result.outputPath ?? result.outputLocation
          })
        )
        return
      }

      setExportError(
        t('export.exportFailed', {
          message: result.message ?? ''
        })
      )
    } catch (error) {
      setExportError(
        t('export.exportFailed', {
          message: error instanceof Error ? error.message : String(error)
        })
      )
    } finally {
      setExportingFormat(null)
    }
  }

  if (!open) {
    return null
  }

  return (
    <div className="sheet-backdrop">
      <div className="sheet export-modal">
        <p className="sheet-kicker">{t('export.kicker')}</p>
        <h2>{t('export.title')}</h2>
        <div className="export-field-list">
          <label className="export-field">
            <span className="export-field-copy">
              <span className="export-field-label">{t('export.deckName')}</span>
              <span className="export-field-description">
                {t('export.deckNameDescription')}
              </span>
            </span>
            <input
              aria-label={t('export.deckName')}
              value={deckName}
              onChange={(event) => setDeckName(event.target.value)}
            />
          </label>
          <label className="export-field">
            <span className="export-field-copy">
              <span className="export-field-label">{t('export.tagPrefix')}</span>
              <span className="export-field-description">
                {t('export.tagPrefixDescription')}
              </span>
            </span>
            <input
              aria-label={t('export.tagPrefix')}
              value={tagPrefix}
              onChange={(event) => setTagPrefix(event.target.value)}
            />
          </label>
          <label className="export-field">
            <span className="export-field-copy">
              <span className="export-field-label">{t('export.outputFolder')}</span>
              <span className="export-field-description">
                {t('export.outputFolderDescription')}
              </span>
            </span>
            <input
              aria-label={t('export.outputFolder')}
              value={outputLocation}
              onChange={(event) => setOutputLocation(event.target.value)}
            />
          </label>
          <label className="export-field">
            <span className="export-field-copy">
              <span className="export-field-label">{t('export.cardDirection')}</span>
              <span className="export-field-description">
                {t('export.cardDirectionDescription')}
              </span>
            </span>
            <select
              aria-label={t('export.cardDirection')}
              value={direction}
              onChange={(event) =>
                setDirection(event.target.value as 'en-zh' | 'zh-en' | 'bilingual')
              }
            >
              <option value="en-zh">{t('export.directionEnZh')}</option>
              <option value="zh-en">{t('export.directionZhEn')}</option>
              <option value="bilingual">{t('export.directionBilingual')}</option>
            </select>
          </label>
        </div>
        <div className="export-option-list">
          <div className="export-option-row">
            <span className="export-option-copy">
              <span className="export-option-label">{t('export.expressions')}</span>
              <span className="export-option-description">
                {t('export.expressionsDescription')}
              </span>
            </span>
            <SelectionButton
              selected={includeExpressions}
              label={t('export.expressions')}
              onToggle={() => setIncludeExpressions((current) => !current)}
            />
          </div>
          <div className="export-option-row">
            <span className="export-option-copy">
              <span className="export-option-label">{t('export.sentences')}</span>
              <span className="export-option-description">
                {t('export.sentencesDescription')}
              </span>
            </span>
            <SelectionButton
              selected={includeSentences}
              label={t('export.sentences')}
              onToggle={() => setIncludeSentences((current) => !current)}
            />
          </div>
          <div className="export-option-row">
            <span className="export-option-copy">
              <span className="export-option-label">{t('export.keepFlaggedItems')}</span>
              <span className="export-option-description">
                {t('export.keepFlaggedItemsDescription')}
              </span>
            </span>
            <SelectionButton
              selected={keepFlaggedItems}
              label={t('export.keepFlaggedItems')}
              onToggle={() => setKeepFlaggedItems((current) => !current)}
            />
          </div>
        </div>
        <div className="sheet-actions">
          <button type="button" onClick={onClose}>
            {t('common.close')}
          </button>
          <button
            type="button"
            disabled={Boolean(exportingFormat)}
            onClick={() => void runExport('anki-package')}
          >
            {exportingFormat === 'anki-package'
              ? t('export.exporting')
              : t('export.exportAnkiPackage')}
          </button>
          <button
            type="button"
            disabled={Boolean(exportingFormat)}
            onClick={() => void runExport('anki-text-bundle')}
          >
            {exportingFormat === 'anki-text-bundle'
              ? t('export.exporting')
              : t('export.exportAnkiTextBundle')}
          </button>
          <button
            type="button"
            disabled={Boolean(exportingFormat)}
            onClick={() => void runExport('generic-text-bundle')}
          >
            {exportingFormat === 'generic-text-bundle'
              ? t('export.exporting')
              : t('export.exportGenericTextBundle')}
          </button>
        </div>
        {exportMessage ? (
          <p className="export-status-message">{exportMessage}</p>
        ) : null}
        {exportError ? (
          <p className="export-status-message is-error">{exportError}</p>
        ) : null}
      </div>
    </div>
  )
}
