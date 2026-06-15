export function buildLaunchPlan(input: {
  settings: { scanOnLaunch: boolean }
  discoveredProjects: string[]
  discoveredSessionIds: string[]
  groupIds: string[]
}) {
  return {
    shouldScanOnLaunch: input.settings.scanOnLaunch,
    selectedProjectIds: input.discoveredProjects,
    focusedSessionId: input.discoveredSessionIds[0] ?? null,
    collapsedGroupIds: input.groupIds
  }
}
