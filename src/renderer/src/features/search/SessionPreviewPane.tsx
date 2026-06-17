import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'

type PreviewTurn = {
  seq: number
  role: 'user' | 'assistant'
  text: string
}

type PreviewProps = {
  sessionTitle: string
  turns: PreviewTurn[]
  fallbackPreview: string
  enableHighlights: boolean
  matchCount: number
  activeMatchIndex: number
  onPrevMatch: () => void
  onNextMatch: () => void
}

function renderPreview(
  value: string,
  enableHighlights: boolean,
  activeMatchIndex: number,
  matchIndexRef: { current: number }
): ReactNode[] {
  if (!enableHighlights) {
    return [value]
  }

  const parts = value.split(/(<mark>|<\/mark>)/)
  let highlighted = false
  const rendered: ReactNode[] = []

  parts.forEach((part, index) => {
    if (part === '<mark>') {
      highlighted = true
      return
    }
    if (part === '</mark>') {
      highlighted = false
      matchIndexRef.current += 1
      return
    }
    if (!part) {
      return
    }

    if (highlighted) {
      const currentIndex = matchIndexRef.current
      rendered.push(
        <mark
          key={`${index}-${currentIndex}`}
          className={currentIndex === activeMatchIndex ? 'is-active' : undefined}
          data-match-index={currentIndex}
        >
          {part}
        </mark>
      )
      return
    }

    rendered.push(part)
  })

  return rendered
}

function getTurnClassName(role: PreviewTurn['role']) {
  return role === 'user' ? 'preview-turn is-user' : 'preview-turn is-assistant'
}

function scrollMatchIntoPreview(body: HTMLElement, active: Element) {
  const container = body.closest('.search-preview')
  if (!(container instanceof HTMLElement)) {
    return
  }

  const containerRect = container.getBoundingClientRect()
  const activeRect = active.getBoundingClientRect()
  const nextTop =
    container.scrollTop +
    activeRect.top -
    containerRect.top -
    container.clientHeight / 2 +
    activeRect.height / 2

  container.scrollTo({
    top: Math.max(0, nextTop),
    behavior: 'smooth'
  })
}

export function SessionPreviewPane(props: PreviewProps) {
  const bodyRef = useRef<HTMLElement | null>(null)
  const renderedPreview = useMemo(
    () => {
      const matchIndexRef = { current: 0 }

      if (props.turns.length === 0) {
        return (
          <div className="preview-snippet">
            {renderPreview(
              props.fallbackPreview,
              props.enableHighlights,
              props.activeMatchIndex,
              matchIndexRef
            )}
          </div>
        )
      }

      return props.turns.map((turn) => (
        <div key={turn.seq} className={getTurnClassName(turn.role)}>
          <div className="preview-bubble">
            <p className="preview-turn-role">{turn.role}</p>
            <div className="preview-turn-text">
              {renderPreview(
                turn.text,
                props.enableHighlights,
                props.activeMatchIndex,
                matchIndexRef
              )}
            </div>
          </div>
        </div>
      ))
    },
    [props.activeMatchIndex, props.enableHighlights, props.fallbackPreview, props.turns]
  )

  useEffect(() => {
    const body = bodyRef.current
    const active = body?.querySelector('mark.is-active')
    if (!body || !active) {
      return
    }

    scrollMatchIntoPreview(body, active)
  }, [props.activeMatchIndex, props.enableHighlights, props.fallbackPreview, props.turns])

  return (
    <section className="search-preview">
      {props.matchCount > 1 ? (
        <div className="match-nav" aria-label="Search matches">
          <button type="button" aria-label="Previous match" onClick={props.onPrevMatch}>
            <span className="match-nav-icon is-prev" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Next match" onClick={props.onNextMatch}>
            <span className="match-nav-icon is-next" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <header className="search-preview-header">
        <div>
          <p className="search-preview-kicker">Normalized Preview</p>
          <h2>{props.sessionTitle}</h2>
        </div>
      </header>
      <article className="search-preview-body" ref={bodyRef}>
        {renderedPreview}
      </article>
    </section>
  )
}
