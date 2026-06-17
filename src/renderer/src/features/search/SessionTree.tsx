import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  areAllSessionIdsSelected,
  flattenSessionTree,
  type SessionGroup
} from './searchModel'

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
  const parentRef = useRef<HTMLDivElement | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const totalRows = props.groups.reduce((count, group) => count + group.rows.length, 0)
  const virtualRows = useMemo(() => flattenSessionTree(props.groups), [props.groups])
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
  const virtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (virtualRows[index]?.kind === 'group' ? 42 : 38),
    overscan: 8
  })

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
    <div className="session-tree" ref={parentRef}>
      <div
        className="session-tree-virtual"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = virtualRows[virtualItem.index]

          if (item.kind === 'group') {
            return (
              <div
                key={item.id}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                className="session-tree-virtual-row"
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <button
                  type="button"
                  className="session-group-header"
                  aria-expanded={item.group.expanded}
                  onClick={() => props.onToggleGroup(item.group.id)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setContextMenu({
                      groupId: item.group.id,
                      x: event.clientX,
                      y: event.clientY
                    })
                  }}
                >
                  <span className="session-group-title">
                    <span className="collapsible-caret" aria-hidden="true" />
                    <span>{item.group.label}</span>
                  </span>
                  <span className="session-group-count">
                    {item.group.selectedCount}/{item.group.totalCount}
                  </span>
                </button>
              </div>
            )
          }

          return (
            <div
              key={item.id}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              className="session-tree-virtual-row"
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              <div className="session-row">
                <label>
                  <input
                    type="checkbox"
                    checked={item.row.selected}
                    onChange={() => props.onToggleSession(item.row.sessionId)}
                  />
                  <button
                    type="button"
                    className={
                      item.row.focused
                        ? 'session-row-button is-focused'
                        : 'session-row-button'
                    }
                    title={item.row.title}
                    onClick={() => props.onFocusSession(item.row.sessionId)}
                  >
                    <span>{item.row.title}</span>
                  </button>
                </label>
              </div>
            </div>
          )
        })}
      </div>
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
