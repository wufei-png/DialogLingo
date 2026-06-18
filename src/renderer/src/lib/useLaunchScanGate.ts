import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LaunchScanStatus, ScanEvent } from '../../../shared/ipc/events'
import { trpc } from './trpc'

export type LaunchScanGatePhase = 'loading' | 'scanning' | 'ready' | 'error'

function resolvePhaseFromStatus(status: LaunchScanStatus): LaunchScanGatePhase {
  if (!status.scanOnLaunch) {
    return 'ready'
  }

  if (status.phase === 'completed') {
    return 'ready'
  }

  if (status.phase === 'failed') {
    return 'error'
  }

  if (status.phase === 'scanning') {
    return 'scanning'
  }

  return 'scanning'
}

function failureMessageFromStatus(status: LaunchScanStatus, fallback: string) {
  return status.failureMessage ?? fallback
}

export function useLaunchScanGate() {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<LaunchScanGatePhase>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const defaultFailureMessage = t('boot.sessionScanFailed')

  const dismissError = useCallback(() => {
    setPhase('ready')
  }, [])

  useEffect(() => {
    let unsubscribe: (() => void) | void

    void (async () => {
      try {
        const status = await trpc.launchScanStatus.query()
        const nextPhase = resolvePhaseFromStatus(status)
        setPhase(nextPhase)

        if (nextPhase === 'error') {
          setErrorMessage(failureMessageFromStatus(status, defaultFailureMessage))
          return
        }

        if (nextPhase === 'ready') {
          return
        }

        unsubscribe = window.dialoglingoScan?.subscribe((event: ScanEvent) => {
          if (event.phase === 'completed') {
            setPhase('ready')
            return
          }

          if (event.phase === 'failed') {
            setErrorMessage(event.message ?? defaultFailureMessage)
            setPhase('error')
          }
        })

        const latest = await trpc.launchScanStatus.query()
        const latestPhase = resolvePhaseFromStatus(latest)
        setPhase(latestPhase)

        if (latestPhase === 'error') {
          setErrorMessage(failureMessageFromStatus(latest, defaultFailureMessage))
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error))
        setPhase('error')
      }
    })()

    return () => {
      unsubscribe?.()
    }
  }, [defaultFailureMessage])

  return { phase, errorMessage, dismissError }
}
