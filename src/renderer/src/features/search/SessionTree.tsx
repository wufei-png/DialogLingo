import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from 'react-i18next'
import {
  areAllSessionIdsSelected,
  flattenSessionTree,
  type SessionTreeNavigationId,
  type SessionGroup
} from './searchModel'
import { renderMarkedText } from '../../lib/renderMarkedText'

type ContextMenuState = {
  groupId: string
  x: number
  y: number
}

export function SessionTree(props: {
  groups: SessionGroup[]
  navigationRowId: SessionTreeNavigationId | null
  onToggleSession: (sessionId: string) => void
  onSetSessionSelection: (sessionIds: string[], selected: boolean) => void
  onNavigateRow: (rowId: SessionTreeNavigationId) => void
  onFocusSession: (sessionId: string) => void
  onToggleGroup: (groupId: string) => void
}) {
  const { t } = useTranslation()
  const parentRef = useRef<HTMLDivElement | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const totalRows = props.groups.reduce((count, group) => count + group.rows.length, 0)
  const virtualRows = useMemo(() => flattenSessionTree(props.groups), [props.groups])
  const navigationRowIndex = useMemo(
    () => virtualRows.findIndex((row) => row.id === props.navigationRowId),
    [props.navigationRowId, virtualRows]
  )
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
    estimateSize: (index) => (virtualRows[index]?.kind === 'group' ? 42 : 48),
    getItemKey: (index) => virtualRows[index]?.id ?? index,
    overscan: 8
  })

  useEffect(() => {
    if (navigationRowIndex >= 0) {
      virtualizer.scrollToIndex(navigationRowIndex, { align: 'auto' })
    }
  }, [navigationRowIndex, virtualizer])

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
    return <div className="session-empty-state">{t('search.noSessions')}</div>
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
            const focused = props.navigationRowId === item.id

            return (
              <div
                key={virtualItem.key}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                className="session-tree-virtual-row is-group"
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <button
                  type="button"
                  className={
                    focused ? 'session-group-header is-focused' : 'session-group-header'
                  }
                  aria-expanded={item.group.expanded}
                  aria-current={focused ? 'true' : undefined}
                  onMouseEnter={() => props.onNavigateRow(item.id)}
                  onClick={() => {
                    props.onNavigateRow(item.id)
                    props.onToggleGroup(item.group.id)
                  }}
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

          const focused = props.navigationRowId === item.id

          return (
            <div
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              className="session-tree-virtual-row is-session"
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              <div className="session-row">
                <button
                  type="button"
                  className={
                    focused ? 'session-row-button is-focused' : 'session-row-button'
                  }
                  title={item.row.title}
                  aria-current={focused ? 'true' : undefined}
                  onMouseEnter={() => props.onNavigateRow(item.id)}
                  onClick={() => {
                    props.onNavigateRow(item.id)
                    props.onFocusSession(item.row.sessionId)
                  }}
                >
                  <span className="session-row-title">
                    {renderMarkedText(item.row.titleSnippet ?? item.row.title, {
                      enabled: Boolean(item.row.titleSnippet)
                    })}
                  </span>
                </button>
                <button
                  type="button"
                  className={
                    item.row.selected
                      ? 'selection-button session-select-button is-selected'
                      : 'selection-button session-select-button'
                  }
                  aria-pressed={item.row.selected}
                  aria-label={
                    item.row.selected
                      ? t('search.deselectSession', { title: item.row.title })
                      : t('search.selectSession', { title: item.row.title })
                  }
                  title={
                    item.row.selected
                      ? t('search.deselectSessionTitle')
                      : t('search.selectSessionTitle')
                  }
                  onClick={() => props.onToggleSession(item.row.sessionId)}
                >
                  <span className="selection-button-check" aria-hidden="true" />
                </button>
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
            {contextGroupAllSelected ? t('search.deselectGroup') : t('search.selectGroup')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
