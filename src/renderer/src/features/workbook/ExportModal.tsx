import { useEffect, useState } from 'react'
import {
  ArrowLeftRight,
  FileText,
  FolderOpen,
  Layers,
  Tag as TagIcon,
  X
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { IconLabel } from '../../components/IconLabel'
import { trpc } from '../../lib/trpc'
import { useEscapeToClose } from '../../lib/useEscapeToClose'

type ExportFormat = 'anki-package' | 'anki-text-bundle' | 'generic-text-bundle'
type ExportConfirmPayload = {
  format: ExportFormat
  deckName: string
  bundleFolderName: string
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

function isTextBundleFormat(format: ExportFormat) {
  return format === 'anki-text-bundle' || format === 'generic-text-bundle'
}

function defaultBundleFolderName(deckName: string) {
  return deckName.trim() || 'DialogLingo'
}

export function ExportModal({ open, onClose, onConfirm }: Props) {
  const { t } = useTranslation()
  useEscapeToClose(open, onClose)
  const [deckName, setDeckName] = useState('DialogLingo')
  const [bundleFolderName, setBundleFolderName] = useState('DialogLingo')
  const [bundleFolderNameEdited, setBundleFolderNameEdited] = useState(false)
  const [direction, setDirection] = useState<'en-zh' | 'zh-en' | 'bilingual'>('bilingual')
  const [includeExpressions, setIncludeExpressions] = useState(true)
  const [includeSentences, setIncludeSentences] = useState(true)
  const [tagPrefix, setTagPrefix] = useState('dialoglingo')
  const [outputLocation, setOutputLocation] = useState('')
  const [keepFlaggedItems, setKeepFlaggedItems] = useState(false)
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('anki-package')
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

  useEffect(() => {
    if (!bundleFolderNameEdited) {
      setBundleFolderName(defaultBundleFolderName(deckName))
    }
  }, [bundleFolderNameEdited, deckName])

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
        bundleFolderName,
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
        <header className="export-modal-header">
          <div>
            <p className="sheet-kicker">{t('export.kicker')}</p>
            <h2>{t('export.title')}</h2>
          </div>
          <button type="button" onClick={onClose}>
            <IconLabel icon={X}>{t('common.close')}</IconLabel>
          </button>
        </header>
        <div className="export-field-list">
          <label className="export-field">
            <span className="export-field-copy">
              <span className="export-field-label">
                <IconLabel icon={Layers}>{t('export.deckName')}</IconLabel>
              </span>
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
              <span className="export-field-label">
                <IconLabel icon={TagIcon}>{t('export.tagPrefix')}</IconLabel>
              </span>
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
              <span className="export-field-label">
                <IconLabel icon={FolderOpen}>{t('export.outputFolder')}</IconLabel>
              </span>
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
          {isTextBundleFormat(selectedFormat) ? (
            <label className="export-field">
              <span className="export-field-copy">
                <span className="export-field-label">
                  <IconLabel icon={FolderOpen}>{t('export.bundleFolderName')}</IconLabel>
                </span>
                <span className="export-field-description">
                  {t('export.bundleFolderNameDescription')}
                </span>
              </span>
              <input
                aria-label={t('export.bundleFolderName')}
                placeholder={defaultBundleFolderName(deckName)}
                value={bundleFolderName}
                onChange={(event) => {
                  setBundleFolderNameEdited(true)
                  setBundleFolderName(event.target.value)
                }}
              />
            </label>
          ) : null}
          <label className="export-field">
            <span className="export-field-copy">
              <span className="export-field-label">
                <IconLabel icon={ArrowLeftRight}>{t('export.cardDirection')}</IconLabel>
              </span>
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
        <div className="sheet-actions export-run-actions">
          <label className="export-format-select">
            <span className="export-field-label">
              <IconLabel icon={FileText}>{t('export.format')}</IconLabel>
            </span>
            <select
              aria-label={t('export.format')}
              disabled={Boolean(exportingFormat)}
              value={selectedFormat}
              onChange={(event) => setSelectedFormat(event.target.value as ExportFormat)}
            >
              <option value="anki-package">{t('export.exportAnkiPackage')}</option>
              <option value="anki-text-bundle">{t('export.exportAnkiTextBundle')}</option>
              <option value="generic-text-bundle">{t('export.exportGenericTextBundle')}</option>
            </select>
          </label>
          <button
            type="button"
            disabled={Boolean(exportingFormat)}
            onClick={() => void runExport(selectedFormat)}
          >
            {exportingFormat ? t('export.exporting') : t('workbook.export')}
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
