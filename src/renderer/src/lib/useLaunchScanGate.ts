import { useCallback, useEffect, useState } from 'react'
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

function failureMessageFromStatus(status: LaunchScanStatus) {
  return status.failureMessage ?? 'Session scan failed.'
}

export function useLaunchScanGate() {
  const [phase, setPhase] = useState<LaunchScanGatePhase>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
          setErrorMessage(failureMessageFromStatus(status))
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
            setErrorMessage(event.message ?? 'Session scan failed.')
            setPhase('error')
          }
        })

        const latest = await trpc.launchScanStatus.query()
        const latestPhase = resolvePhaseFromStatus(latest)
        setPhase(latestPhase)

        if (latestPhase === 'error') {
          setErrorMessage(failureMessageFromStatus(latest))
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error))
        setPhase('error')
      }
    })()

    return () => {
      unsubscribe?.()
    }
  }, [])

  return { phase, errorMessage, dismissError }
}
