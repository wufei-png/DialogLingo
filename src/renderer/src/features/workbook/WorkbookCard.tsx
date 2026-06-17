import { useEffect, useRef, useState } from 'react'

type WorkbookSnapshotDraft = {
  sourceText: string
  targetText: string
  gloss: string
  explanation: string
  contextText: string
  quizPrompt: string
  quizAnswer: string
  tags: string[]
}

type Props = {
  itemType: 'Expression' | 'Sentence'
  source: string
  target: string
  gloss: string
  explanation: string
  contextText: string
  quiz: string
  quizAnswer: string
  tags: string
  deleted?: boolean
  selected: boolean
  modified: boolean
  focusTargetRevision: number
  onSelect: () => void
  onDelete: () => void
  onRestore: () => void
  onSave: (nextSnapshot: WorkbookSnapshotDraft) => Promise<void>
  onSaveAndAdvance: (nextSnapshot: WorkbookSnapshotDraft) => Promise<void>
  onAdvance: () => void
  onRevert: () => void
  onOpenSource: () => void
}

function toDraft(props: Props) {
  return {
    source: props.source,
    target: props.target,
    gloss: props.gloss,
    explanation: props.explanation,
    contextText: props.contextText,
    quiz: props.quiz,
    quizAnswer: props.quizAnswer,
    tags: props.tags
  }
}

function toSnapshot(draft: ReturnType<typeof toDraft>): WorkbookSnapshotDraft {
  return {
    sourceText: draft.source,
    targetText: draft.target,
    gloss: draft.gloss,
    explanation: draft.explanation,
    contextText: draft.contextText,
    quizPrompt: draft.quiz,
    quizAnswer: draft.quizAnswer,
    tags: draft.tags
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }
}

function hasDraftChanged(draft: ReturnType<typeof toDraft>, props: Props) {
  return (
    draft.source !== props.source ||
    draft.target !== props.target ||
    draft.gloss !== props.gloss ||
    draft.explanation !== props.explanation ||
    draft.contextText !== props.contextText ||
    draft.quiz !== props.quiz ||
    draft.quizAnswer !== props.quizAnswer ||
    draft.tags !== props.tags
  )
}
export function WorkbookCard(props: Props) {
  const targetRef = useRef<HTMLInputElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState(toDraft(props))

  useEffect(() => {
    setDraft(toDraft(props))
  }, [
    props.source,
    props.target,
    props.gloss,
    props.explanation,
    props.contextText,
    props.quiz,
    props.quizAnswer,
    props.tags
  ])

  useEffect(() => {
    if (props.selected && props.focusTargetRevision > 0 && !props.deleted) {
      targetRef.current?.focus()
      targetRef.current?.select()
    }
  }, [props.deleted, props.focusTargetRevision, props.selected])

  function resetDraft() {
    setDraft(toDraft(props))
  }

  async function saveDraft(advance = false) {
    if (props.deleted || !hasDraftChanged(draft, props)) {
      if (advance) {
        props.onAdvance()
      }
      return
    }

    const snapshot = toSnapshot(draft)
    if (advance) {
      await props.onSaveAndAdvance(snapshot)
      return
    }

    await props.onSave(snapshot)
  }

  function handleEditableKeyDown(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      resetDraft()
      return
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      void saveDraft(true)
    }
  }

  return (
    <article
      className={[
        'workbook-card',
        props.selected ? 'is-selected' : '',
        props.modified ? 'is-modified' : '',
        props.deleted ? 'is-deleted' : ''
      ].filter(Boolean).join(' ')}
      onClick={props.onSelect}
    >
      <div className="workbook-card-header">
        <div>
          <span className="workbook-card-kicker">{props.itemType}</span>
          <p className="workbook-card-source">{draft.source}</p>
        </div>
        <div className="workbook-card-status">
          {props.modified ? <span>Modified</span> : null}
          {props.deleted ? <span>Deleted</span> : null}
        </div>
      </div>

      <label className="workbook-field">
        <span>Target</span>
        <input
          ref={targetRef}
          value={draft.target}
          readOnly={props.deleted}
          onChange={(event) =>
            setDraft((current) => ({ ...current, target: event.target.value }))
          }
          onBlur={() => void saveDraft(false)}
          onKeyDown={handleEditableKeyDown}
        />
      </label>

      <label className="workbook-field">
        <span>Gloss</span>
        <input
          value={draft.gloss}
          readOnly={props.deleted}
          onChange={(event) =>
            setDraft((current) => ({ ...current, gloss: event.target.value }))
          }
          onBlur={() => void saveDraft(false)}
          onKeyDown={handleEditableKeyDown}
        />
      </label>

      {expanded ? (
        <div className="workbook-card-secondary">
          <label className="workbook-field">
            <span>Explanation</span>
            <textarea
              value={draft.explanation}
              readOnly={props.deleted}
              onChange={(event) =>
                setDraft((current) => ({ ...current, explanation: event.target.value }))
              }
              onBlur={() => void saveDraft(false)}
              onKeyDown={handleEditableKeyDown}
            />
          </label>
          <label className="workbook-field">
            <span>Quiz</span>
            <textarea
              value={draft.quiz}
              readOnly={props.deleted}
              onChange={(event) =>
                setDraft((current) => ({ ...current, quiz: event.target.value }))
              }
              onBlur={() => void saveDraft(false)}
              onKeyDown={handleEditableKeyDown}
            />
          </label>
          <label className="workbook-field">
            <span>Quiz answer</span>
            <input
              value={draft.quizAnswer}
              readOnly={props.deleted}
              onChange={(event) =>
                setDraft((current) => ({ ...current, quizAnswer: event.target.value }))
              }
              onBlur={() => void saveDraft(false)}
              onKeyDown={handleEditableKeyDown}
            />
          </label>
          <label className="workbook-field">
            <span>Tags</span>
            <input
              value={draft.tags}
              readOnly={props.deleted}
              onChange={(event) =>
                setDraft((current) => ({ ...current, tags: event.target.value }))
              }
              onBlur={() => void saveDraft(false)}
              onKeyDown={handleEditableKeyDown}
            />
          </label>
        </div>
      ) : null}

      <div className="workbook-card-actions">
        <button type="button" onClick={() => setExpanded((current) => !current)}>
          {expanded ? 'Less fields' : 'More fields'}
        </button>
        {props.modified ? (
          <button type="button" onClick={props.onRevert}>
            Revert
          </button>
        ) : null}
        <button type="button" onClick={props.onOpenSource}>
          View source
        </button>
        {props.deleted ? (
          <button type="button" onClick={props.onRestore}>
            Restore
          </button>
        ) : (
          <button type="button" onClick={props.onDelete}>
            Delete
          </button>
        )}
      </div>
    </article>
  )
}
