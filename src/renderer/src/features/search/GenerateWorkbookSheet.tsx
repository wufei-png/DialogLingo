import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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

export function GenerateWorkbookSheet(props: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
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
        <p className="sheet-kicker">Generate Workbook</p>
        <h2>Generate Expression + Sentence items?</h2>
        <p>{props.selectedCount} sessions selected</p>
        <div className="sheet-grid">
          <section>
            <h3>Platform</h3>
            <ul>
              {props.platformSummary.map((row) => (
                <li key={row.label}>
                  {row.label}: {row.count}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Project</h3>
            <ul>
              {props.projectSummary.map((row) => (
                <li key={row.label}>
                  {row.label}: {row.count}
                </li>
              ))}
            </ul>
          </section>
        </div>
        <section className="generation-prompt-panel">
          <div className="prompt-editor-header">
            <div>
              <h3>Model prompt</h3>
              <p>
                {loadingPrompt
                  ? 'Preparing final prompt...'
                  : `${candidateCount} mined candidates included`}
              </p>
            </div>
            <div className="prompt-editor-status">
              {saved ? <span>Saved</span> : null}
              {promptChanged ? (
                <button type="button" onClick={revertPrompt}>
                  Revert
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
            Cancel
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
            Generate
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
