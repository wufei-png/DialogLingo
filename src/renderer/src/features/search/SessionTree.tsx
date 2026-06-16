import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { areAllSessionIdsSelected, type SessionGroup } from './searchModel'

type ContextMenuState = {
  groupId: string
  x: number
  y: number
}

export function SessionTree(props: {
  groups: SessionGroup[]
  onToggleSession: (sessionId: string) => void
  onSetSessionSelection: (sessionIds: string[], selected: boolean) => void
  onFocusSession: (sessionId: string) => void
  onToggleGroup: (groupId: string) => void
}) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const totalRows = props.groups.reduce((count, group) => count + group.rows.length, 0)
  const contextGroup = contextMenu
    ? props.groups.find((group) => group.id === contextMenu.groupId) ?? null
    : null
  const contextGroupSessionIds = contextGroup?.rows.map((row) => row.sessionId) ?? []
  const contextGroupSelectedIds = new Set(
    contextGroup?.rows.filter((row) => row.selected).map((row) => row.sessionId) ?? []
  )
  const contextGroupAllSelected = areAllSessionIdsSelected(
    contextGroupSessionIds,
    contextGroupSelectedIds
  )

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    function closeContextMenu() {
      setContextMenu(null)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeContextMenu()
      }
    }

    window.addEventListener('click', closeContextMenu)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('click', closeContextMenu)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  if (totalRows === 0) {
    return <div className="session-empty-state">No sessions</div>
  }

  return (
    <div className="session-tree">
      <AnimatePresence initial={false}>
        {props.groups.map((group) => (
          <motion.section
            key={group.id}
            className="session-group"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
          >
            <button
              type="button"
              className="session-group-header"
              aria-expanded={group.expanded}
              onClick={() => props.onToggleGroup(group.id)}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setContextMenu({
                  groupId: group.id,
                  x: event.clientX,
                  y: event.clientY
                })
              }}
            >
              <span className="session-group-title">
                <span className="collapsible-caret" aria-hidden="true" />
                <span>{group.label}</span>
              </span>
              <span className="session-group-count">
                {group.selectedCount}/{group.totalCount}
              </span>
            </button>
            <AnimatePresence initial={false}>
              {group.expanded ? (
                <motion.div
                  className="session-group-body"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.14, ease: 'easeOut' }}
                >
                  <ul className="session-group-list">
                    {group.rows.map((row) => (
                      <li key={row.sessionId} className="session-row">
                        <label>
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={() => props.onToggleSession(row.sessionId)}
                          />
                          <button
                            type="button"
                            className={row.focused ? 'session-row-button is-focused' : 'session-row-button'}
                            title={row.title}
                            onClick={() => props.onFocusSession(row.sessionId)}
                          >
                            <span>{row.title}</span>
                          </button>
                        </label>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.section>
        ))}
      </AnimatePresence>
      {contextMenu && contextGroup ? (
        <div
          className="session-group-context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              props.onSetSessionSelection(
                contextGroupSessionIds,
                !contextGroupAllSelected
              )
              setContextMenu(null)
            }}
          >
            {contextGroupAllSelected ? '取消全选本组' : '全选本组'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
