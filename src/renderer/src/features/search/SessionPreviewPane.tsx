import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'

type PreviewProps = {
  sessionTitle: string
  preview: string
  matchCount: number
  activeMatchIndex: number
  onPrevMatch: () => void
  onNextMatch: () => void
}

function renderPreview(value: string, activeMatchIndex: number): ReactNode[] {
  const parts = value.split(/(<mark>|<\/mark>)/)
  let highlighted = false
  let matchIndex = 0
  const rendered: ReactNode[] = []

  parts.forEach((part, index) => {
    if (part === '<mark>') {
      highlighted = true
      return
    }
    if (part === '</mark>') {
      highlighted = false
      matchIndex += 1
      return
    }
    if (!part) {
      return
    }

    if (highlighted) {
      const currentIndex = matchIndex
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
    () => renderPreview(props.preview, props.activeMatchIndex),
    [props.preview, props.activeMatchIndex]
  )

  useEffect(() => {
    const body = bodyRef.current
    const active = body?.querySelector('mark.is-active')
    if (!body || !active) {
      return
    }

    scrollMatchIntoPreview(body, active)
  }, [props.activeMatchIndex, props.preview])

  return (
    <section className="search-preview">
      <header className="search-preview-header">
        <div>
          <p className="search-preview-kicker">Normalized Preview</p>
          <h2>{props.sessionTitle}</h2>
        </div>
        {props.matchCount > 1 ? (
          <div className="match-nav">
            <button type="button" onClick={props.onPrevMatch}>
              Prev
            </button>
            <button type="button" onClick={props.onNextMatch}>
              Next
            </button>
          </div>
        ) : null}
      </header>
      <article className="search-preview-body" ref={bodyRef}>
        {renderedPreview}
      </article>
    </section>
  )
}
