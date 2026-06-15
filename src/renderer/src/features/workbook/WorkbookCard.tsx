import { useEffect, useState } from 'react'

type Props = {
  itemType: 'Expression' | 'Sentence'
  source: string
  target: string
  gloss: string
  explanation: string
  quiz: string
  tags: string
  deleted?: boolean
  selected: boolean
  modified: boolean
  onSelect: () => void
  onDelete: () => void
  onRestore: () => void
  onSave: (nextSnapshot: {
    sourceText: string
    targetText: string
    gloss: string
    explanation: string
    contextText: string
    quizPrompt: string
    quizAnswer: string
    tags: string[]
  }) => void
  onCancelEdit: () => void
  onRevert: () => void
  onOpenSource: () => void
}

export function WorkbookCard(props: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState({
    source: props.source,
    target: props.target,
    gloss: props.gloss,
    explanation: props.explanation,
    quiz: props.quiz,
    tags: props.tags
  })

  useEffect(() => {
    setDraft({
      source: props.source,
      target: props.target,
      gloss: props.gloss,
      explanation: props.explanation,
      quiz: props.quiz,
      tags: props.tags
    })
    setIsEditing(false)
  }, [
    props.source,
    props.target,
    props.gloss,
    props.explanation,
    props.quiz,
    props.tags
  ])

  return (
    <article
      className={props.selected ? 'workbook-card is-selected' : 'workbook-card'}
      onClick={props.onSelect}
    >
      <div className="workbook-card-header">
        <span className="workbook-card-kicker">{props.itemType}</span>
        <span>{draft.source}</span>
      </div>
      <textarea
        aria-label="Source"
        value={draft.source}
        disabled
        onChange={() => undefined}
      />
      <input
        aria-label="Target"
        value={draft.target}
        disabled={!isEditing || props.deleted}
        onChange={(event) =>
          setDraft((current) => ({ ...current, target: event.target.value }))
        }
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            props.onSave({
              sourceText: draft.source,
              targetText: draft.target,
              gloss: draft.gloss,
              explanation: draft.explanation,
              contextText: draft.source,
              quizPrompt: draft.quiz,
              quizAnswer: draft.target,
              tags: draft.tags
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean)
            })
            setIsEditing(false)
          }
          if (event.key === 'Escape') {
            setDraft({
              source: props.source,
              target: props.target,
              gloss: props.gloss,
              explanation: props.explanation,
              quiz: props.quiz,
              tags: props.tags
            })
            setIsEditing(false)
            props.onCancelEdit()
          }
        }}
      />
      <input
        aria-label="Gloss"
        value={draft.gloss}
        disabled={!isEditing || props.deleted}
        onChange={(event) =>
          setDraft((current) => ({ ...current, gloss: event.target.value }))
        }
      />
      <textarea
        aria-label="Explanation"
        value={draft.explanation}
        disabled={!isEditing || props.deleted}
        onChange={(event) =>
          setDraft((current) => ({ ...current, explanation: event.target.value }))
        }
      />
      <textarea
        aria-label="Quiz"
        value={draft.quiz}
        disabled={!isEditing || props.deleted}
        onChange={(event) =>
          setDraft((current) => ({ ...current, quiz: event.target.value }))
        }
      />
      <input
        aria-label="Tags"
        value={draft.tags}
        disabled={!isEditing || props.deleted}
        onChange={(event) =>
          setDraft((current) => ({ ...current, tags: event.target.value }))
        }
      />
      <div className="workbook-card-actions">
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
        {!props.deleted ? (
          <button type="button" onClick={() => setIsEditing(true)}>
            Edit
          </button>
        ) : null}
        <button type="button" onClick={props.onCancelEdit}>
          Cancel
        </button>
        <button
          type="button"
          disabled={props.deleted}
          onClick={() => {
            props.onSave({
              sourceText: draft.source,
              targetText: draft.target,
              gloss: draft.gloss,
              explanation: draft.explanation,
              contextText: draft.source,
              quizPrompt: draft.quiz,
              quizAnswer: draft.target,
              tags: draft.tags
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean)
            })
            setIsEditing(false)
          }}
        >
          Save
        </button>
      </div>
    </article>
  )
}
