import type { LaunchScanStatus } from '../../../shared/ipc/events'

export type LaunchScanGatePhase = 'loading' | 'scanning' | 'ready' | 'error'

export function resolveLaunchScanGatePhase(
  status: LaunchScanStatus
): LaunchScanGatePhase {
  if (!status.scanOnLaunch) {
    return 'ready'
  }

  if (status.phase === 'completed') {
    return 'ready'
  }

  if (status.phase === 'failed') {
    return 'error'
  }

  if (status.phase === 'scanning' && status.hasIndexedSessions) {
    return 'ready'
  }

  if (status.phase === 'scanning') {
    return 'scanning'
  }

  return 'scanning'
}
