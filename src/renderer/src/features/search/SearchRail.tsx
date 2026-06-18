import { useId, useMemo, useState, type ReactNode } from 'react'
import {
  CalendarClock,
  Folder,
  Monitor,
  RefreshCw,
  Rows3,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  type LucideIcon
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { IconLabel } from '../../components/IconLabel'
import { MeasuredCollapse } from '../../components/MeasuredCollapse'
import { GenerateWorkbookSheet } from './GenerateWorkbookSheet'
import {
  PLATFORM_LABELS,
  PLATFORM_OPTIONS,
  areAllSessionIdsSelected,
  togglePlatformFilter,
  type ProjectOption,
  type SearchGroupBy,
  type SessionTreeNavigationId,
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

type GenerationPromptPreview = {
  prompt: string
  candidateCount: number
}

const SEARCH_SCOPE_VALUES = ['all', 'titles', 'transcript'] as const
type SearchTimeRange = 'last-7-days' | 'last-30-days' | 'all-time'
type OpenFilterSection = 'platform' | 'projects' | 'groupBy'

function CollapsibleFilterSection(props: {
  title: string
  summary: string
  icon?: LucideIcon
  className?: string
  defaultExpanded?: boolean
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  children: ReactNode
}) {
  const [internalExpanded, setInternalExpanded] = useState(props.defaultExpanded ?? false)
  const expanded = props.expanded ?? internalExpanded
  const bodyId = useId()

  function toggleExpanded() {
    const nextExpanded = !expanded
    if (props.onExpandedChange) {
      props.onExpandedChange(nextExpanded)
      return
    }
    setInternalExpanded(nextExpanded)
  }

  return (
    <section
      className={
        props.className
          ? `collapsible-filter-section ${props.className}`
          : 'collapsible-filter-section'
      }
    >
      <button
        type="button"
        className="collapsible-section-header"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={toggleExpanded}
      >
        <span className="collapsible-section-title">
          <span className="collapsible-caret" aria-hidden="true" />
          {props.icon ? (
            <IconLabel icon={props.icon}>{props.title}</IconLabel>
          ) : (
            <span>{props.title}</span>
          )}
        </span>
        <span className="collapsible-section-summary">{props.summary}</span>
      </button>
      <MeasuredCollapse id={bodyId} className="collapsible-section-body" open={expanded}>
        <div className="collapsible-section-content">{props.children}</div>
      </MeasuredCollapse>
    </section>
  )
}

export function SearchRail(props: {
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
  timeRange: SearchTimeRange
  groupBy: SearchGroupBy
  navigationRowId: SessionTreeNavigationId | null
  generationError: string | null
  onQueryChange: (query: string) => void
  onQueryScopeChange: (scope: 'all' | 'titles' | 'transcript') => void
  onTimeRangeChange: (range: SearchTimeRange) => void
  onGroupByChange: (groupBy: SearchGroupBy) => void
  onPlatformFilterChange: (platforms: SearchPlatform[]) => void
  onProjectFilterChange: (projectIds: Set<string>) => void
  onToggleSession: (sessionId: string) => void
  onSetSessionSelection: (sessionIds: string[], selected: boolean) => void
  onNavigateRow: (rowId: SessionTreeNavigationId) => void
  onFocusSession: (sessionId: string) => void
  onToggleGroup: (groupId: string) => void
  onRescan: () => void
  onPromptPreview: (sessionIds: string[]) => Promise<GenerationPromptPreview>
  onGenerate: (sessionIds: string[], promptOverride: string | null) => Promise<void>
}) {
  const { t } = useTranslation()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [openFilterSection, setOpenFilterSection] = useState<OpenFilterSection | null>(null)
  const selectedSessionIds = useMemo(
    () => [...props.selectedSessionIds],
    [props.selectedSessionIds]
  )
  const searchScopeOptions = SEARCH_SCOPE_VALUES.map((value) => ({
    value,
    label:
      value === 'all'
        ? t('search.searchInAll')
        : value === 'titles'
          ? t('search.searchInTitles')
          : t('search.searchInTranscripts')
  }))
  const timeRangeOptions: Array<{ value: SearchTimeRange; label: string }> = [
    {
      value: 'last-7-days',
      label: t('search.timeRangeWithValue', { value: t('search.last7Days') })
    },
    {
      value: 'last-30-days',
      label: t('search.timeRangeWithValue', { value: t('search.last30Days') })
    },
    {
      value: 'all-time',
      label: t('search.timeRangeWithValue', { value: t('search.allTime') })
    }
  ]

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
    { value: 'platform', label: t('search.groupByPlatform') },
    { value: 'time', label: t('search.groupByTime') },
    { value: 'project', label: t('search.groupByProject') }
  ]
  const activeGroupByLabel =
    groupByOptions.find((option) => option.value === props.groupBy)?.label ??
    t('search.groupByPlatform')
  const filteredSessionIds = props.sessions.map((session) => session.sessionId)
  const allFilteredSessionsSelected = areAllSessionIdsSelected(
    filteredSessionIds,
    props.selectedSessionIds
  )
  const filterSelectionDisabled = filteredSessionIds.length === 0

  return (
    <aside className="search-rail">
      <div className="search-stack">
        <div className="search-box">
          <div className="search-input-shell">
            <Search className="field-icon" aria-hidden="true" size={15} strokeWidth={2} />
            <input
              placeholder={t('search.typeKeywords')}
              value={props.query}
              onChange={(event) => props.onQueryChange(event.currentTarget.value)}
            />
          </div>
          <select
            aria-label={t('search.searchScope')}
            value={props.queryScope}
            onChange={(event) =>
              props.onQueryScopeChange(
                event.currentTarget.value as 'all' | 'titles' | 'transcript'
              )
            }
          >
            {searchScopeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <section className="filter-area" aria-label={t('search.filterArea')}>
          <div className="filter-area-label">{t('search.filterArea')}</div>

          <div className="filter-control-stack">
            <div className="select-with-icon">
              <CalendarClock className="field-icon" aria-hidden="true" size={15} strokeWidth={2} />
              <select
                aria-label={t('search.timeRange')}
                value={props.timeRange}
                onChange={(event) =>
                  props.onTimeRangeChange(event.currentTarget.value as SearchTimeRange)
                }
              >
                {timeRangeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <CollapsibleFilterSection
              icon={Monitor}
              title={t('search.platform')}
              summary={`${props.platformFilter.length}/${PLATFORM_OPTIONS.length}`}
              expanded={openFilterSection === 'platform'}
              onExpandedChange={(expanded) =>
                setOpenFilterSection(expanded ? 'platform' : null)
              }
            >
              <div className="filter-options">
                {PLATFORM_OPTIONS.map((platform) => (
                  <button
                    key={platform}
                    type="button"
                    className="filter-option-row"
                    aria-pressed={props.platformFilter.includes(platform)}
                    onClick={() =>
                      props.onPlatformFilterChange(
                        togglePlatformFilter(props.platformFilter, platform)
                      )
                    }
                  >
                    <span
                      className={
                        props.platformFilter.includes(platform)
                          ? 'selection-button filter-option-check is-selected'
                          : 'selection-button filter-option-check'
                      }
                      aria-hidden="true"
                    >
                      <span className="selection-button-check" aria-hidden="true" />
                    </span>
                    <span className="filter-option-label">{PLATFORM_LABELS[platform]}</span>
                  </button>
                ))}
              </div>
            </CollapsibleFilterSection>

            <CollapsibleFilterSection
              icon={Folder}
              title={t('search.projects')}
              summary={`${selectedProjectCount}/${props.projects.length}`}
              expanded={openFilterSection === 'projects'}
              onExpandedChange={(expanded) =>
                setOpenFilterSection(expanded ? 'projects' : null)
              }
            >
              <div className="filter-options">
                {props.projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className="filter-option-row"
                    title={project.localPath}
                    aria-pressed={props.selectedProjectIds.has(project.id)}
                    onClick={() => toggleProject(project.id)}
                  >
                    <span
                      className={
                        props.selectedProjectIds.has(project.id)
                          ? 'selection-button filter-option-check is-selected'
                          : 'selection-button filter-option-check'
                      }
                      aria-hidden="true"
                    >
                      <span className="selection-button-check" aria-hidden="true" />
                    </span>
                    <span className="filter-option-label">{project.name}</span>
                  </button>
                ))}
              </div>
            </CollapsibleFilterSection>

            <CollapsibleFilterSection
              icon={Rows3}
              title={t('search.groupBy')}
              summary={activeGroupByLabel}
              className="group-by-filter-section"
              expanded={openFilterSection === 'groupBy'}
              onExpandedChange={(expanded) =>
                setOpenFilterSection(expanded ? 'groupBy' : null)
              }
            >
              <div className="group-by-options" role="group" aria-label={t('search.groupBy')}>
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
                disabled={filterSelectionDisabled}
                onClick={() =>
                  props.onSetSessionSelection(
                    filteredSessionIds,
                    !allFilteredSessionsSelected
                  )
                }
              >
                {allFilteredSessionsSelected ? t('search.deselectAll') : t('search.selectAll')}
              </button>
            </div>
          </div>
        </section>

        <SessionTree
          groups={props.groups}
          navigationRowId={props.navigationRowId}
          onToggleSession={props.onToggleSession}
          onSetSessionSelection={props.onSetSessionSelection}
          onNavigateRow={props.onNavigateRow}
          onFocusSession={props.onFocusSession}
          onToggleGroup={props.onToggleGroup}
        />
      </div>

      <footer className="search-footer">
        <p className="search-footer-selection">
          {t('search.selectedSessionsCount', { count: props.selectedSessionIds.size })}
        </p>
        <div className="search-footer-actions">
          <button type="button" onClick={props.onRescan}>
            <IconLabel icon={RefreshCw}>{t('search.rescan')}</IconLabel>
          </button>
          <button type="button" onClick={() => setSheetOpen(true)}>
            <IconLabel icon={Sparkles}>{t('search.generateWorkbook')}</IconLabel>
          </button>
        </div>
        {props.generationError ? (
          <p className="search-footer-error">{props.generationError}</p>
        ) : null}
        <button className="settings-utility-button" type="button" onClick={props.onOpenSettings}>
          <IconLabel icon={SettingsIcon}>{t('common.settings')}</IconLabel>
        </button>
      </footer>

      <GenerateWorkbookSheet
        open={sheetOpen}
        selectedCount={props.selectedSessionIds.size}
        sessionIds={selectedSessionIds}
        platformSummary={platformSummary.length > 0 ? platformSummary : groupSummary}
        projectSummary={projectSummary}
        onLoadPrompt={props.onPromptPreview}
        onCancel={() => setSheetOpen(false)}
        onConfirm={(promptOverride) => {
          void props.onGenerate(selectedSessionIds, promptOverride).then(() => {
            setSheetOpen(false)
          })
        }}
      />
    </aside>
  )
}
