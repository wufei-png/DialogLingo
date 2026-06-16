type SummaryRow = {
  label: string
  count: number
}

type Props = {
  open: boolean
  selectedCount: number
  platformSummary: SummaryRow[]
  projectSummary: SummaryRow[]
  onConfirm: () => void
  onCancel: () => void
}

export function GenerateWorkbookSheet(props: Props) {
  if (!props.open) {
    return null
  }

  return (
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
        <div className="sheet-actions">
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
          <button
            type="button"
            disabled={props.selectedCount === 0}
            onClick={props.onConfirm}
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  )
}
