import { useEffect, useId, useRef, useState } from 'react'
import { ChevronRight, FileSearch, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { IconLabel } from '../../components/IconLabel'
import { MeasuredCollapse } from '../../components/MeasuredCollapse'
import type { WorkbookSaveStatus } from './workbookSaveQueue'

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
  sourceRefCount: number
  deleted?: boolean
  selected: boolean
  modified: boolean
  focusTargetRevision: number
  onSelect: () => void
  onDelete: () => void
  onRestore: () => void
  onSave: (nextSnapshot: WorkbookSnapshotDraft) => Promise<void>
  onSaveAndAdvance: (nextSnapshot: WorkbookSnapshotDraft) => Promise<void>
  onDraftChange: (nextSnapshot: WorkbookSnapshotDraft) => void
  onDiscardDraft: () => void
  saveStatus: WorkbookSaveStatus
  saveError: string | null
  onRetry: () => Promise<void>
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
  const { t } = useTranslation()
  const secondaryFieldsId = useId()
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
    props.onDiscardDraft()
  }

  function updateDraft(nextDraft: ReturnType<typeof toDraft>) {
    setDraft(nextDraft)
    props.onDraftChange(toSnapshot(nextDraft))
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
      void saveDraft(true).catch(() => {})
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
      <div className="workbook-card-ribbon" aria-hidden="true" />
      <div className="workbook-card-header">
        <div className="workbook-card-heading">
          <div className="workbook-card-title-row">
            <span className="workbook-card-kicker">
              {t(`workbook.itemTypes.${props.itemType}`)}
            </span>
            <span className="workbook-card-source-count">
              {t('workbook.sourceRefsCount', { count: props.sourceRefCount })}
            </span>
          </div>
          <p className="workbook-card-source">{draft.source}</p>
        </div>
        <div className="workbook-card-meta">
          <div className="workbook-card-status">
            {props.modified ? <span>{t('workbook.status.modified')}</span> : null}
            {props.deleted ? <span>{t('workbook.status.deleted')}</span> : null}
            {!props.deleted && props.saveStatus === 'saving' ? (
              <span aria-live="polite">{t('workbook.status.saving')}</span>
            ) : null}
            {!props.deleted && props.saveStatus === 'saved' ? (
              <span aria-live="polite">{t('workbook.status.saved')}</span>
            ) : null}
            {!props.deleted && (props.saveStatus === 'error' || props.saveStatus === 'conflict') ? (
              <span aria-live="assertive">
                {props.saveStatus === 'conflict'
                  ? t('workbook.status.conflict')
                  : t('workbook.status.saveFailed')}
                <button type="button" onClick={() => void props.onRetry().catch(() => {})}>
                  {t('workbook.actions.retry')}
                </button>
              </span>
            ) : null}
          </div>
          <div className="workbook-card-actions">
            {props.modified ? (
              <button type="button" onClick={props.onRevert}>
                <IconLabel icon={Undo2}>{t('common.revert')}</IconLabel>
              </button>
            ) : null}
            <button type="button" onClick={props.onOpenSource}>
              <IconLabel icon={FileSearch}>{t('workbook.actions.viewSource')}</IconLabel>
            </button>
            {props.deleted ? (
              <button type="button" onClick={props.onRestore}>
                <IconLabel icon={RotateCcw}>{t('workbook.actions.restore')}</IconLabel>
              </button>
            ) : (
              <button type="button" onClick={props.onDelete}>
                <IconLabel icon={Trash2}>{t('workbook.actions.delete')}</IconLabel>
              </button>
            )}
          </div>
        </div>
      </div>

      <label className="workbook-field workbook-field--primary">
        <span>{t('workbook.fields.target')}</span>
        <input
          ref={targetRef}
          value={draft.target}
          readOnly={props.deleted}
          onChange={(event) =>
            updateDraft({ ...draft, target: event.target.value })
          }
          onBlur={() => void saveDraft(false).catch(() => {})}
          onKeyDown={handleEditableKeyDown}
        />
      </label>

      <label className="workbook-field workbook-field--secondary">
        <span>{t('workbook.fields.gloss')}</span>
        <input
          value={draft.gloss}
          readOnly={props.deleted}
          onChange={(event) =>
            updateDraft({ ...draft, gloss: event.target.value })
          }
          onBlur={() => void saveDraft(false).catch(() => {})}
          onKeyDown={handleEditableKeyDown}
        />
      </label>

      <button
        type="button"
        className="workbook-disclosure-row"
        aria-label={
          expanded
            ? t('workbook.additionalFields.hide')
            : t('workbook.additionalFields.show')
        }
        aria-expanded={expanded}
        aria-controls={secondaryFieldsId}
        onClick={() => setExpanded((current) => !current)}
      >
        <ChevronRight
          className="workbook-disclosure-icon"
          aria-hidden="true"
          size={14}
          strokeWidth={2}
        />
      </button>

      <MeasuredCollapse
        id={secondaryFieldsId}
        className="workbook-card-secondary"
        exitDurationMs={190}
        open={expanded}
      >
        <label className="workbook-field">
          <span>{t('workbook.fields.explanation')}</span>
          <textarea
            value={draft.explanation}
            readOnly={props.deleted}
            onChange={(event) =>
              updateDraft({ ...draft, explanation: event.target.value })
            }
            onBlur={() => void saveDraft(false).catch(() => {})}
            onKeyDown={handleEditableKeyDown}
          />
        </label>
        <label className="workbook-field">
          <span>{t('workbook.fields.quiz')}</span>
          <textarea
            value={draft.quiz}
            readOnly={props.deleted}
            onChange={(event) =>
              updateDraft({ ...draft, quiz: event.target.value })
            }
            onBlur={() => void saveDraft(false).catch(() => {})}
            onKeyDown={handleEditableKeyDown}
          />
        </label>
        <label className="workbook-field">
          <span>{t('workbook.fields.quizAnswer')}</span>
          <input
            value={draft.quizAnswer}
            readOnly={props.deleted}
            onChange={(event) =>
              updateDraft({ ...draft, quizAnswer: event.target.value })
            }
            onBlur={() => void saveDraft(false).catch(() => {})}
            onKeyDown={handleEditableKeyDown}
          />
        </label>
        <label className="workbook-field">
          <span>{t('workbook.fields.tags')}</span>
          <input
            value={draft.tags}
            readOnly={props.deleted}
            onChange={(event) =>
              updateDraft({ ...draft, tags: event.target.value })
            }
            onBlur={() => void saveDraft(false).catch(() => {})}
            onKeyDown={handleEditableKeyDown}
          />
        </label>
      </MeasuredCollapse>
    </article>
  )
}
