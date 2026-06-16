type LaunchScanScreenProps = {
  errorMessage?: string | null
  onContinue?: () => void
}

export function LaunchScanScreen(props: LaunchScanScreenProps) {
  const hasError = Boolean(props.errorMessage)

  return (
    <div className="boot-screen">
      <div className="boot-card boot-card--centered">
        <p className="boot-eyebrow">DialogLingo</p>
        {hasError ? (
          <>
            <h2>Session scan failed</h2>
            <p className="boot-error">{props.errorMessage}</p>
            <button className="boot-continue" type="button" onClick={props.onContinue}>
              Continue anyway
            </button>
          </>
        ) : (
          <>
            <h2>Local chat to workbook</h2>
            <div className="boot-spinner" aria-hidden="true" />
            <p className="boot-caption">
              Discovering Codex, Claude, and OpenCode transcripts…
            </p>
          </>
        )}
      </div>
    </div>
  )
}
