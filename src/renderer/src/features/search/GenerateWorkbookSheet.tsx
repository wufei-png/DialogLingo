import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FolderTree, Monitor, RotateCcw, WandSparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { IconLabel } from '../../components/IconLabel'
import { useEscapeToClose } from '../../lib/useEscapeToClose'

type SummaryRow = {
  label: string
  count: number
}

type Props = {
  open: boolean
  selectedCount: number
  sessionIds: string[]
  platformSummary: SummaryRow[]
  projectSummary: SummaryRow[]
  onLoadPrompt: (sessionIds: string[]) => Promise<{
    prompt: string
    candidateCount: number
  }>
  onConfirm: (promptOverride: string | null) => void
  onCancel: () => void
}

function summarizeRows(rows: SummaryRow[], maxVisible = 2) {
  const visibleRows = rows.slice(0, maxVisible)
  const hiddenCount = Math.max(0, rows.length - visibleRows.length)

  return {
    text: visibleRows.map((row) => `${row.label} ${row.count}`).join(' · '),
    hiddenCount
  }
}

export function GenerateWorkbookSheet(props: Props) {
  const { t } = useTranslation()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  useEscapeToClose(props.open, props.onCancel)
  const [prompt, setPrompt] = useState('')
  const [originalPrompt, setOriginalPrompt] = useState('')
  const [savedPrompt, setSavedPrompt] = useState('')
  const [candidateCount, setCandidateCount] = useState(0)
  const [loadingPrompt, setLoadingPrompt] = useState(false)
  const [promptError, setPromptError] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const [saved, setSaved] = useState(false)
  const sessionSignature = useMemo(() => props.sessionIds.join('|'), [props.sessionIds])
  const promptChanged = prompt !== originalPrompt
  const promptBlank = prompt.trim().length === 0
  const platformManifest = summarizeRows(props.platformSummary)
  const projectManifest = summarizeRows(props.projectSummary)

  useEffect(() => {
    if (!props.open) {
      return
    }

    if (props.selectedCount === 0) {
      setPrompt('')
      setOriginalPrompt('')
      setSavedPrompt('')
      setCandidateCount(0)
      setLoadingPrompt(false)
      setPromptError(null)
      setSaved(false)
      return
    }

    let cancelled = false
    setLoadingPrompt(true)
    setPromptError(null)
    setSaved(false)
    setPrompt('')
    setOriginalPrompt('')
    setSavedPrompt('')
    setCandidateCount(0)

    void props.onLoadPrompt(props.sessionIds).then(
      (preview) => {
        if (cancelled) {
          return
        }

        setPrompt(preview.prompt)
        setOriginalPrompt(preview.prompt)
        setSavedPrompt(preview.prompt)
        setCandidateCount(preview.candidateCount)
        setLoadingPrompt(false)
      },
      (error) => {
        if (cancelled) {
          return
        }

        setPromptError(error instanceof Error ? error.message : String(error))
        setLoadingPrompt(false)
      }
    )

    return () => {
      cancelled = true
    }
  }, [props.open, props.selectedCount, props.sessionIds, props.onLoadPrompt, sessionSignature])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    const maxHeight = Math.min(360, Math.floor(window.innerHeight * 0.42))
    textarea.style.height = 'auto'
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [prompt, props.open])

  function savePromptDraft() {
    setFocused(false)

    if (prompt === savedPrompt) {
      return
    }

    setSavedPrompt(prompt)
    setSaved(true)
  }

  function revertPrompt() {
    setPrompt(originalPrompt)
    setSavedPrompt(originalPrompt)
    setSaved(true)
  }

  if (!props.open) {
    return null
  }

  return createPortal(
    <div className="sheet-backdrop">
      <div className="sheet">
        <header className="generate-sheet-header">
          <p className="sheet-kicker">{t('generateWorkbook.kicker')}</p>
          <h2>
            <IconLabel icon={WandSparkles}>{t('generateWorkbook.title')}</IconLabel>
          </h2>
          <div className="generate-sheet-chip-row">
            <span>{t('generateWorkbook.selectedSessions', { count: props.selectedCount })}</span>
            <span>{t('generateWorkbook.targetTypes')}</span>
            <span>
              {loadingPrompt
                ? t('generateWorkbook.preparingPrompt')
                : t('generateWorkbook.minedCandidates', { count: candidateCount })}
            </span>
            {promptChanged ? (
              <span className="is-modified">{t('generateWorkbook.modifiedPrompt')}</span>
            ) : saved ? (
              <span className="is-saved">{t('common.saved')}</span>
            ) : null}
          </div>
          <div className="generate-sheet-manifest">
            <span>
              <IconLabel icon={Monitor}>{t('generateWorkbook.platform')}</IconLabel>
              <strong>{platformManifest.text || t('common.none')}</strong>
              {platformManifest.hiddenCount > 0 ? (
                <em>{t('generateWorkbook.moreSummary', { count: platformManifest.hiddenCount })}</em>
              ) : null}
            </span>
            <span>
              <IconLabel icon={FolderTree}>{t('generateWorkbook.project')}</IconLabel>
              <strong>{projectManifest.text || t('common.none')}</strong>
              {projectManifest.hiddenCount > 0 ? (
                <em>{t('generateWorkbook.moreSummary', { count: projectManifest.hiddenCount })}</em>
              ) : null}
            </span>
          </div>
        </header>
        <section className="generation-prompt-panel">
          <div className="prompt-editor-header">
            <div>
              <h3>{t('generateWorkbook.modelPrompt')}</h3>
              <p>
                {loadingPrompt
                  ? t('generateWorkbook.preparingPrompt')
                  : t('generateWorkbook.minedCandidates', { count: candidateCount })}
              </p>
            </div>
            <div className="prompt-editor-status">
              {saved ? <span>{t('common.saved')}</span> : null}
              {promptChanged ? (
                <button type="button" onClick={revertPrompt}>
                  <IconLabel icon={RotateCcw}>{t('common.revert')}</IconLabel>
                </button>
              ) : null}
            </div>
          </div>
          {promptError ? (
            <p className="prompt-editor-error">{promptError}</p>
          ) : (
            <div
              className={[
                'prompt-editor-shell',
                focused ? 'is-focused' : '',
                saved ? 'is-saved' : ''
              ].filter(Boolean).join(' ')}
            >
              <textarea
                ref={textareaRef}
                className="generation-prompt-textarea"
                value={prompt}
                disabled={loadingPrompt}
                spellCheck={false}
                onFocus={() => setFocused(true)}
                onBlur={savePromptDraft}
                onChange={(event) => {
                  setPrompt(event.currentTarget.value)
                  setSaved(false)
                }}
              />
            </div>
          )}
        </section>
        <div className="sheet-actions">
          <button type="button" onClick={props.onCancel}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={
              props.selectedCount === 0 ||
              loadingPrompt ||
              Boolean(promptError) ||
              (promptChanged && promptBlank)
            }
            onClick={() => props.onConfirm(promptChanged ? prompt : null)}
          >
            <IconLabel icon={WandSparkles}>{t('common.generate')}</IconLabel>
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
