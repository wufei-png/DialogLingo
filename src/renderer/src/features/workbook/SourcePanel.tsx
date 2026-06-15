type Props = {
  open: boolean
  title: string
  context: string
  onClose: () => void
  onPrevMatch: () => void
  onNextMatch: () => void
}

export function SourcePanel(props: Props) {
  if (!props.open) {
    return null
  }

  return (
    <aside className="source-panel">
      <h3>{props.title}</h3>
      <div className="source-panel-actions">
        <button type="button" onClick={props.onClose}>
          Close
        </button>
        <button type="button" onClick={props.onPrevMatch}>
          Prev
        </button>
        <button type="button" onClick={props.onNextMatch}>
          Next
        </button>
      </div>
      <article>{props.context}</article>
    </aside>
  )
}
