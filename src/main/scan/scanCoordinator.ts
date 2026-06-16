export type LaunchPlan = {
  shouldScanOnLaunch: boolean
  selectedProjectIds: string[]
  focusedSessionId: string | null
  collapsedGroupIds: string[]
}

export function buildLaunchPlan(input: {
  settings: { scanOnLaunch: boolean }
  discoveredProjects: string[]
  discoveredSessionIds: string[]
  groupIds: string[]
}): LaunchPlan {
  return {
    shouldScanOnLaunch: input.settings.scanOnLaunch,
    selectedProjectIds: input.discoveredProjects,
    focusedSessionId: input.discoveredSessionIds[0] ?? null,
    collapsedGroupIds: input.groupIds
  }
}
