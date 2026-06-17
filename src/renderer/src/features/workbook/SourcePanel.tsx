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

function formatSourceType(value: string) {
  if (value === 'codex') {
    return 'Codex'
  }
  if (value === 'claude') {
    return 'Claude Code'
  }
  if (value === 'opencode') {
    return 'OpenCode'
  }
  return value || 'Unknown source'
}

export function SourcePanel(props: Props) {
  if (!props.open) {
    return null
  }

  const headerMeta = props.preview ? (
    <>
      <span>{formatSourceType(props.preview.session.sourceType)}</span>
      {props.preview.session.projectPath ? <span>{props.preview.session.projectPath}</span> : null}
      {props.preview.session.updatedAt ? <span>{props.preview.session.updatedAt}</span> : null}
      <span>
        {props.preview.matchedBy === 'source-span'
          ? 'Source span'
          : props.preview.matchedBy === 'highlight-text'
            ? 'Text match'
            : 'No match'}
      </span>
    </>
  ) : null

  return (
    <aside className={props.pinned ? 'source-panel is-pinned' : 'source-panel'}>
      <div className="source-panel-actions">
        {props.sourceRefCount > 1 ? (
          <>
            <button type="button" onClick={props.onPrevSourceRef}>
              Prev ref
            </button>
            <span className="source-panel-counter">
              {props.sourceRefIndex + 1}/{props.sourceRefCount}
            </span>
            <button type="button" onClick={props.onNextSourceRef}>
              Next ref
            </button>
          </>
        ) : null}
        {props.pinned ? (
          <button type="button" onClick={props.onUnpin}>
            Unpin
          </button>
        ) : (
          <button type="button" onClick={props.onPin}>
            Pin
          </button>
        )}
        <button type="button" onClick={props.onClose}>
          Close
        </button>
      </div>
      {props.loading ? (
        <div className="source-panel-placeholder">Loading source...</div>
      ) : props.preview ? (
        <SessionPreviewPane
          className="source-preview"
          kicker="Source Context"
          sessionTitle={props.preview.session.title}
          turns={props.preview.turns}
          fallbackPreview="No source content available."
          enableHighlights
          matchCount={props.matchCount}
          activeMatchIndex={props.activeMatchIndex}
          onPrevMatch={props.onPrevMatch}
          onNextMatch={props.onNextMatch}
          headerMeta={headerMeta}
        />
      ) : (
        <div className="source-panel-placeholder">
          <h3>Workbook Overview</h3>
          <p>Select a card or use View source to inspect the full conversation context.</p>
        </div>
      )}
    </aside>
  )
}
