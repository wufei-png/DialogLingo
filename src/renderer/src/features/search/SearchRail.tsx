import { useId, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
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

function CollapsibleFilterSection(props: {
  title: string
  summary: string
  defaultExpanded?: boolean
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(props.defaultExpanded ?? false)
  const bodyId = useId()

  return (
    <section className="collapsible-filter-section">
      <button
        type="button"
        className="collapsible-section-header"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="collapsible-section-title">
          <span className="collapsible-caret" aria-hidden="true" />
          <span>{props.title}</span>
        </span>
        <span className="collapsible-section-summary">{props.summary}</span>
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            id={bodyId}
            className="collapsible-section-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
          >
            <div className="collapsible-section-content">{props.children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  )
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

  const visibleRows = props.groups
    .filter((group) => group.expanded)
    .flatMap((group) => group.rows)

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
  const groupByOptions: Array<{ value: SearchGroupBy; label: string }> = [
    { value: 'platform', label: 'Platform' },
    { value: 'time', label: 'Time range' },
    { value: 'project', label: 'Project' }
  ]
  const activeGroupByLabel =
    groupByOptions.find((option) => option.value === props.groupBy)?.label ?? 'Platform'

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

          <CollapsibleFilterSection
            title="Platform"
            summary={`${props.platformFilter.length}/${PLATFORM_OPTIONS.length}`}
          >
            <div className="filter-options">
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
                  <span className="filter-option-label">{PLATFORM_LABELS[platform]}</span>
                </label>
              ))}
            </div>
          </CollapsibleFilterSection>

          <CollapsibleFilterSection
            title="Projects"
            summary={`${selectedProjectCount}/${props.projects.length}`}
          >
            <div className="filter-options">
              {props.projects.map((project) => (
                <label key={project.id} title={project.localPath}>
                  <input
                    type="checkbox"
                    checked={props.selectedProjectIds.has(project.id)}
                    onChange={() => toggleProject(project.id)}
                  />
                  <span className="filter-option-label">{project.name}</span>
                </label>
              ))}
            </div>
          </CollapsibleFilterSection>
        </div>

        <div className="search-toolbar">
          <CollapsibleFilterSection
            title="Group by"
            summary={activeGroupByLabel}
            defaultExpanded
          >
            <div className="group-by-options" role="group" aria-label="Group by">
              {groupByOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={
                    props.groupBy === option.value
                      ? 'group-by-option is-active'
                      : 'group-by-option'
                  }
                  aria-pressed={props.groupBy === option.value}
                  onClick={() => props.onGroupByChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </CollapsibleFilterSection>
          <div className="search-selection-actions">
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
