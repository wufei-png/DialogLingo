import { AnimatePresence, motion } from 'motion/react'
import type { SessionGroup } from './searchModel'

export function SessionTree(props: {
  groups: SessionGroup[]
  onToggleSession: (sessionId: string) => void
  onFocusSession: (sessionId: string) => void
  onToggleGroup: (groupId: string) => void
}) {
  const totalRows = props.groups.reduce((count, group) => count + group.rows.length, 0)

  if (totalRows === 0) {
    return <div className="session-empty-state">No sessions</div>
  }

  return (
    <div className="session-tree">
      <AnimatePresence initial={false}>
        {props.groups.map((group) => (
          <motion.section
            key={group.id}
            layout
            className="session-group"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            <button
              type="button"
              className="session-group-header"
              aria-expanded={group.expanded}
              onClick={() => props.onToggleGroup(group.id)}
            >
              <span>
                <span className="session-group-caret">{group.expanded ? 'v' : '>'}</span>
                {group.label}
              </span>
              <span>
                {group.selectedCount}/{group.totalCount}
              </span>
            </button>
            {group.expanded ? (
              <ul className="session-group-list">
                <AnimatePresence initial={false}>
                  {group.rows.map((row) => (
                    <motion.li
                      key={row.sessionId}
                      layout
                      className="session-row"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.12, ease: 'easeOut' }}
                    >
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
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            ) : null}
          </motion.section>
        ))}
      </AnimatePresence>
    </div>
  )
}
