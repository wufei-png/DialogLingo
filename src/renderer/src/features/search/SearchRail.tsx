import { useState } from 'react'
import type { NavSectionId } from '../../../../shared/navigation'
import { SectionTabs } from '../../components/SectionTabs'
import { GenerateWorkbookSheet } from './GenerateWorkbookSheet'
import {
  PLATFORM_LABELS,
  PLATFORM_OPTIONS,
  togglePlatformFilter,
  type ProjectOption,
  type SearchGroupBy,
  type SearchPlatform
} from './searchModel'
import { SessionTree } from './SessionTree'
import type { SessionGroup } from './searchModel'

type SearchSession = {
  sessionId: string
  title: string
  snippet: string | null
  sourceType: SearchPlatform
  projectPath: string | null
  updatedAt: string
}

export function SearchRail(props: {
  activeSection: NavSectionId
  onChangeSection: (section: NavSectionId) => void
  onOpenSettings: () => void
  sessions: SearchSession[]
  projects: ProjectOption[]
  groups: SessionGroup[]
  focusedSessionId: string | null
  selectedSessionIds: Set<string>
  selectedProjectIds: Set<string>
  platformFilter: SearchPlatform[]
  query: string
  queryScope: 'all' | 'titles' | 'transcript'
  timeRange: 'last-7-days' | 'last-30-days' | 'all-time'
  groupBy: SearchGroupBy
  generationError: string | null
  onQueryChange: (query: string) => void
  onQueryScopeChange: (scope: 'all' | 'titles' | 'transcript') => void
  onTimeRangeChange: (range: 'last-7-days' | 'last-30-days' | 'all-time') => void
  onGroupByChange: (groupBy: SearchGroupBy) => void
  onPlatformFilterChange: (platforms: SearchPlatform[]) => void
  onProjectFilterChange: (projectIds: Set<string>) => void
  onToggleSession: (sessionId: string) => void
  onFocusSession: (sessionId: string) => void
  onToggleGroup: (groupId: string) => void
  onRescan: () => void
  onGenerate: (sessionIds: string[]) => Promise<void>
}) {
  const [sheetOpen, setSheetOpen] = useState(false)

  const platformSummary = PLATFORM_OPTIONS.map((platform) => ({
    label: PLATFORM_LABELS[platform],
    count: props.sessions.filter(
      (session) =>
        session.sourceType === platform && props.selectedSessionIds.has(session.sessionId)
    ).length
  })).filter((row) => row.count > 0)

  const projectSummary = props.projects
    .map((project) => ({
      label: project.name,
      count: props.sessions.filter(
        (session) =>
          session.projectPath === project.id &&
          props.selectedSessionIds.has(session.sessionId)
      ).length
    }))
    .filter((row) => row.count > 0)

  const visibleRows = props.groups.flatMap((group) => group.rows)

  function toggleProject(projectId: string) {
    const next = new Set(props.selectedProjectIds)
    if (next.has(projectId)) {
      next.delete(projectId)
    } else {
      next.add(projectId)
    }
    props.onProjectFilterChange(next)
  }

  const selectedProjectCount = props.selectedProjectIds.size

  const groupSummary = props.groups.map((group) => ({
    label: group.label,
    count: group.rows.filter((row) => row.selected).length
  }))

  return (
    <aside className="search-rail">
      <SectionTabs
        activeSection={props.activeSection}
        onChangeSection={props.onChangeSection}
      />
      <div className="search-stack">
        <div className="search-box">
          <input
            placeholder="Search in titles, transcripts..."
            value={props.query}
            onChange={(event) => props.onQueryChange(event.currentTarget.value)}
          />
          <select
            aria-label="Search scope"
            value={props.queryScope}
            onChange={(event) =>
              props.onQueryScopeChange(
                event.currentTarget.value as 'all' | 'titles' | 'transcript'
              )
            }
          >
            <option value="all">All</option>
            <option value="titles">Titles</option>
            <option value="transcript">Transcript</option>
          </select>
        </div>

        <div className="search-filters">
          <select
            aria-label="Time range"
            value={props.timeRange}
            onChange={(event) =>
              props.onTimeRangeChange(
                event.currentTarget.value as 'last-7-days' | 'last-30-days' | 'all-time'
              )
            }
          >
            <option value="last-7-days">Last 7 days</option>
            <option value="last-30-days">Last 30 days</option>
            <option value="all-time">All time</option>
          </select>

          <fieldset>
            <legend>Platform</legend>
            {PLATFORM_OPTIONS.map((platform) => (
              <label key={platform}>
                <input
                  type="checkbox"
                  checked={props.platformFilter.includes(platform)}
                  onChange={() =>
                    props.onPlatformFilterChange(
                      togglePlatformFilter(props.platformFilter, platform)
                    )
                  }
                />
                {PLATFORM_LABELS[platform]}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>Projects ({selectedProjectCount}/{props.projects.length})</legend>
            <div className="filter-options">
              {props.projects.map((project) => (
                <label key={project.id} title={project.localPath}>
                  <input
                    type="checkbox"
                    checked={props.selectedProjectIds.has(project.id)}
                    onChange={() => toggleProject(project.id)}
                  />
                  {project.name}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="search-toolbar">
          <select
            aria-label="Group by"
            value={props.groupBy}
            onChange={(event) =>
              props.onGroupByChange(event.currentTarget.value as SearchGroupBy)
            }
          >
            <option value="platform">Platform</option>
            <option value="time">Time range</option>
            <option value="project">Project</option>
          </select>
          <button
            type="button"
            onClick={() => {
              visibleRows.forEach((row) => {
                if (!props.selectedSessionIds.has(row.sessionId)) {
                  props.onToggleSession(row.sessionId)
                }
              })
            }}
          >
            Select All in View
          </button>
          <button
            type="button"
            onClick={() => {
              visibleRows.forEach((row) => {
                if (props.selectedSessionIds.has(row.sessionId)) {
                  props.onToggleSession(row.sessionId)
                }
              })
            }}
          >
            Clear Selection
          </button>
        </div>

        <SessionTree
          groups={props.groups}
          onToggleSession={props.onToggleSession}
          onFocusSession={props.onFocusSession}
          onToggleGroup={props.onToggleGroup}
        />
      </div>

      <footer className="search-footer">
        <div>
          <p className="search-footer-label">Selected</p>
          <strong>{props.selectedSessionIds.size} sessions</strong>
        </div>
        <div className="search-footer-actions">
          <button type="button" onClick={props.onRescan}>
            Rescan
          </button>
          <button type="button" onClick={() => setSheetOpen(true)}>
            Generate Workbook
          </button>
        </div>
        {props.generationError ? (
          <p className="search-footer-error">{props.generationError}</p>
        ) : null}
        <button className="settings-utility-button" type="button" onClick={props.onOpenSettings}>
          Settings
        </button>
      </footer>

      <GenerateWorkbookSheet
        open={sheetOpen}
        selectedCount={props.selectedSessionIds.size}
        platformSummary={platformSummary.length > 0 ? platformSummary : groupSummary}
        projectSummary={projectSummary}
        onCancel={() => setSheetOpen(false)}
        onConfirm={() => {
          void props.onGenerate([...props.selectedSessionIds]).then(() => {
            setSheetOpen(false)
          })
        }}
      />
    </aside>
  )
}
