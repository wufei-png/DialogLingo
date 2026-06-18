import { useTranslation } from 'react-i18next'

type LaunchScanScreenProps = {
  errorMessage?: string | null
  onContinue?: () => void
}

export function LaunchScanScreen(props: LaunchScanScreenProps) {
  const { t } = useTranslation()
  const hasError = Boolean(props.errorMessage)

  return (
    <div className="boot-screen">
      <div className="boot-card boot-card--centered">
        <p className="boot-eyebrow">{t('common.appName')}</p>
        {hasError ? (
          <>
            <h2>{t('boot.sessionScanFailed')}</h2>
            <p className="boot-error">{props.errorMessage}</p>
            <button className="boot-continue" type="button" onClick={props.onContinue}>
              {t('boot.continueAnyway')}
            </button>
          </>
        ) : (
          <>
            <h2>{t('boot.localChatToWorkbook')}</h2>
            <div className="boot-spinner" aria-hidden="true" />
            <p className="boot-caption">
              {t('boot.discoveringTranscripts')}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
