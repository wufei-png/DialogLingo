import { describe, expect, it } from 'vitest'
import { buildLaunchPlan } from '../../../src/main/scan/scanCoordinator'

describe('buildLaunchPlan', () => {
  it('enables scan-on-launch, selects all discovered projects, and focuses the first session', () => {
    const plan = buildLaunchPlan({
      settings: { scanOnLaunch: true },
      discoveredProjects: ['p1', 'p2'],
      discoveredSessionIds: ['s1', 's2'],
      groupIds: ['codex', 'claude']
    })

    expect(plan.shouldScanOnLaunch).toBe(true)
    expect(plan.selectedProjectIds).toEqual(['p1', 'p2'])
    expect(plan.focusedSessionId).toBe('s1')
    expect(plan.collapsedGroupIds).toEqual(['codex', 'claude'])
  })
})
