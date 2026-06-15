import { useState } from 'react'
import { GenerateWorkbookSheet } from './GenerateWorkbookSheet'
import { SessionTree } from './SessionTree'

type SearchSession = {
  sessionId: string
  title: string
  snippet: string | null
  sourceType: 'codex' | 'claude' | 'opencode'
  projectPath: string | null
}

export function SearchRail(props: {
  sessions: SearchSession[]
  focusedSessionId: string | null
  selectedSessionIds: Set<string>
  onToggleSession: (sessionId: string) => void
  onFocusSession: (sessionId: string) => void
  onRescan: () => void
  onGenerate: (sessionIds: string[]) => Promise<void>
}) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const groups = ['codex', 'claude', 'opencode'].map((sourceType) => {
    const rows = props.sessions
      .filter((session) => session.sourceType === sourceType)
      .map((session) => ({
        sessionId: session.sessionId,
        title: session.title,
        snippet: session.snippet,
        selected: props.selectedSessionIds.has(session.sessionId),
        focused: props.focusedSessionId === session.sessionId
      }))

    return {
      label:
        sourceType === 'codex'
          ? 'Codex'
          : sourceType === 'claude'
            ? 'Claude Code'
            : 'OpenCode',
      expanded: true,
      selectedCount: rows.filter((row) => row.selected).length,
      totalCount: rows.length,
      rows
    }
  })

  const platformSummary = groups.map((group) => ({
    label: group.label,
    count: group.rows.filter((row) => row.selected).length
  }))

  const projectSummary = [...new Set(
    props.sessions
      .filter((session) => props.selectedSessionIds.has(session.sessionId))
      .map((session) => session.projectPath || 'Unassigned')
  )].map((project) => ({
    label: project,
    count: props.sessions.filter(
      (session) =>
        props.selectedSessionIds.has(session.sessionId) &&
        (session.projectPath || 'Unassigned') === project
    ).length
  }))

  return (
    <aside className="search-rail">
      <div className="search-stack">
        <div className="search-box">
          <input placeholder="Search in titles, transcripts..." />
          <select aria-label="Search scope" defaultValue="all">
            <option value="all">All</option>
            <option value="titles">Titles</option>
            <option value="transcript">Transcript</option>
          </select>
        </div>

        <div className="search-filters">
          <select aria-label="Time range" defaultValue="last-7-days">
            <option value="last-7-days">Last 7 days</option>
            <option value="last-30-days">Last 30 days</option>
            <option value="all-time">All time</option>
          </select>

          <fieldset>
            <legend>Platform</legend>
            <label>
              <input type="checkbox" defaultChecked />
              Codex
            </label>
            <label>
              <input type="checkbox" defaultChecked />
              Claude Code
            </label>
            <label>
              <input type="checkbox" defaultChecked />
              OpenCode
            </label>
          </fieldset>

          <fieldset>
            <legend>Projects</legend>
            <label>
              <input type="checkbox" defaultChecked />
              dialoglingo
            </label>
          </fieldset>
        </div>

        <div className="search-toolbar">
          <select aria-label="Group by" defaultValue="platform">
            <option value="platform">Platform</option>
            <option value="time">Time range</option>
            <option value="project">Project</option>
          </select>
          <button
            type="button"
            onClick={() => {
              groups.flatMap((group) => group.rows).forEach((row) => {
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
              groups.flatMap((group) => group.rows).forEach((row) => {
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
          groups={groups}
          onToggleSession={props.onToggleSession}
          onFocusSession={props.onFocusSession}
        />
      </div>

      <footer className="search-footer">
        <div>
          <p className="search-footer-label">Selected</p>
          <strong>{props.selectedSessionIds.size} sessions</strong>
        </div>
        <div className="search-footer-actions">
          <button type="button" onClick={() => setSheetOpen(true)}>
            Generate Workbook
          </button>
          <button type="button" onClick={props.onRescan}>
            Rescan
          </button>
          <button type="button">Settings</button>
        </div>
      </footer>

      <GenerateWorkbookSheet
        open={sheetOpen}
        selectedCount={props.selectedSessionIds.size}
        platformSummary={platformSummary}
        projectSummary={projectSummary}
        onCancel={() => setSheetOpen(false)}
        onConfirm={() => {
          void props.onGenerate([...props.selectedSessionIds])
          setSheetOpen(false)
        }}
      />
    </aside>
  )
}
