import { useEffect, useState } from 'react'
import {
  ArrowLeftRight,
  Check,
  FileText,
  Layers,
  Tag as TagIcon,
  X
} from 'lucide-react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { IconLabel } from '../../components/IconLabel'
import { trpc } from '../../lib/trpc'
import { useEscapeToClose } from '../../lib/useEscapeToClose'
import {
  countExportableItems,
  type ExportCountItem,
  type FlaggedItemExportPolicy
} from './exportCountModel'

type ExportFormat = 'anki-package' | 'anki-text-bundle' | 'generic-text-bundle'
type ExportConfirmPayload = {
  format: ExportFormat
  deckName: string
  outputName: string
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
  exportItems?: ExportCountItem[] | null
  flaggedItemExportPolicy?: FlaggedItemExportPolicy | null
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

function defaultOutputName(deckName: string) {
  return deckName.trim() || 'DialogLingo'
}

function getExportActionLabel(format: ExportFormat, t: TFunction) {
  if (format === 'anki-package') {
    return t('export.runAnkiPackage')
  }

  if (format === 'anki-text-bundle') {
    return t('export.runAnkiTextBundle')
  }

  return t('export.runGenericTextBundle')
}

export function ExportModal({
  open,
  exportItems,
  flaggedItemExportPolicy,
  onClose,
  onConfirm
}: Props) {
  const { t } = useTranslation()
  useEscapeToClose(open, onClose)
  const [deckName, setDeckName] = useState('DialogLingo')
  const [outputName, setOutputName] = useState('DialogLingo')
  const [outputNameEdited, setOutputNameEdited] = useState(false)
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
    if (!outputNameEdited) {
      setOutputName(defaultOutputName(deckName))
    }
  }, [outputNameEdited, deckName])

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
        outputName,
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

  const formatOptions: Array<{
    value: ExportFormat
    label: string
    description: string
    detail?: string
  }> = [
    {
      value: 'anki-package',
      label: t('export.exportAnkiPackageTarget'),
      description: t('export.exportAnkiPackageDescription'),
      detail: t('export.exportAnkiPackageDetail')
    },
    {
      value: 'anki-text-bundle',
      label: t('export.exportAnkiTextBundleTarget'),
      description: t('export.exportAnkiTextBundleDescription'),
      detail: t('export.exportAnkiTextBundleDetail')
    },
    {
      value: 'generic-text-bundle',
      label: t('export.exportGenericTextBundleTarget'),
      description: t('export.exportGenericTextBundleDescription'),
      detail: t('export.exportGenericTextBundleDetail')
    }
  ]
  const itemCounts =
    exportItems && flaggedItemExportPolicy
      ? countExportableItems(exportItems, {
          includeExpressions,
          includeSentences,
          keepFlaggedItems,
          flaggedItemExportPolicy
        })
      : null

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
        <section className="export-target-panel" aria-label={t('export.format')}>
          <p className="export-target-label">
            <IconLabel icon={FileText}>{t('export.format')}</IconLabel>
          </p>
          <div className="export-target-options">
            {formatOptions.map((format) => {
              const selected = selectedFormat === format.value
              const FormatIcon = format.value === 'anki-package' ? Layers : FileText
              const detailId = `export-format-${format.value}-detail`

              return (
                <span key={format.value} className="export-target-option-shell">
                  <button
                    type="button"
                    className={selected ? 'export-target-option is-selected' : 'export-target-option'}
                    aria-pressed={selected}
                    aria-describedby={detailId}
                    disabled={Boolean(exportingFormat)}
                    onClick={() => setSelectedFormat(format.value)}
                  >
                    <IconLabel icon={FormatIcon}>{format.label}</IconLabel>
                    <span>{format.description}</span>
                    {selected ? <Check aria-hidden="true" size={16} /> : null}
                  </button>
                  <span id={detailId} role="tooltip" className="export-target-tooltip">
                    {format.detail}
                  </span>
                </span>
              )
            })}
          </div>
        </section>
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
          <label className="export-field">
            <span className="export-field-copy">
              <span className="export-field-label">
                <IconLabel icon={FileText}>{t('export.outputName')}</IconLabel>
              </span>
              <span className="export-field-description">
                {t('export.outputNameDescription')}
              </span>
            </span>
            <input
              aria-label={t('export.outputName')}
              placeholder={defaultOutputName(deckName)}
              value={outputName}
              onChange={(event) => {
                setOutputNameEdited(true)
                setOutputName(event.target.value)
              }}
            />
          </label>
        </div>
        <div className="export-option-list">
          <div className="export-option-row">
            <span className="export-option-copy">
              <span className="export-option-label">{t('export.expressions')}</span>
              <span className="export-option-description">
                {t('export.expressionsDescription')}
                {itemCounts ? (
                  <span className="export-option-count">
                    {t('export.expressionCount', { count: itemCounts.expressions })}
                  </span>
                ) : null}
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
                {itemCounts ? (
                  <span className="export-option-count">
                    {t('export.sentenceCount', { count: itemCounts.sentences })}
                  </span>
                ) : null}
              </span>
            </span>
            <SelectionButton
              selected={includeSentences}
              label={t('export.sentences')}
              onToggle={() => setIncludeSentences((current) => !current)}
            />
          </div>
          <div className="export-option-row is-warning">
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
          <button
            type="button"
            disabled={Boolean(exportingFormat)}
            onClick={() => void runExport(selectedFormat)}
          >
            {exportingFormat
              ? t('export.exporting')
              : getExportActionLabel(selectedFormat, t)}
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
