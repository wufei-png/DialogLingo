import { describe, expect, it } from 'vitest'
import { resolveLaunchScanGatePhase } from '../../src/renderer/src/lib/launchScanGateModel'

describe('resolveLaunchScanGatePhase', () => {
  it('lets cached indexes render while launch scan continues in the background', () => {
    expect(
      resolveLaunchScanGatePhase({
        phase: 'scanning',
        scanOnLaunch: true,
        hasIndexedSessions: true,
        failureMessage: null,
        launchPlan: null
      })
    ).toBe('ready')
  })

  it('keeps the launch screen for a first scan without indexed sessions', () => {
    expect(
      resolveLaunchScanGatePhase({
        phase: 'scanning',
        scanOnLaunch: true,
        hasIndexedSessions: false,
        failureMessage: null,
        launchPlan: null
      })
    ).toBe('scanning')
  })
})
