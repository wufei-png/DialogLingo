import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import {
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO
} from '../../../shared/schemas/settings'

type Props = {
  className?: string
  leftClassName?: string
  rightClassName?: string
  left: ReactNode
  right: ReactNode
  ratio: number
  onRatioChange: (ratio: number) => void
  onRatioCommit: (ratio: number) => void
}

function clampRatio(value: number) {
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, value))
}

export function ResizableSplitPane(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const ratioRef = useRef(clampRatio(props.ratio))
  const ratio = clampRatio(props.ratio)

  useEffect(() => {
    ratioRef.current = ratio
  }, [ratio])

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) {
        return ratioRef.current
      }

      const nextRatio = clampRatio((clientX - rect.left) / rect.width)
      ratioRef.current = nextRatio
      props.onRatioChange(nextRatio)
      return nextRatio
    },
    [props]
  )

  const commitRatio = useCallback(() => {
    props.onRatioCommit(ratioRef.current)
  }, [props])

  return (
    <div
      ref={containerRef}
      className={['resizable-split-pane', props.className].filter(Boolean).join(' ')}
      style={{
        gridTemplateColumns: `minmax(var(--split-left-min, 220px), ${ratio}fr) var(--split-divider-size, 8px) minmax(var(--split-right-min, 360px), ${1 - ratio}fr)`
      }}
    >
      <div className={['split-pane', 'split-pane-left', props.leftClassName].filter(Boolean).join(' ')}>
        {props.left}
      </div>
      <button
        type="button"
        className="split-divider"
        aria-label="Resize panes"
        aria-orientation="vertical"
        aria-valuemax={Math.round(MAX_SPLIT_RATIO * 100)}
        aria-valuemin={Math.round(MIN_SPLIT_RATIO * 100)}
        aria-valuenow={Math.round(ratio * 100)}
        role="separator"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
            return
          }

          event.preventDefault()
          const direction = event.key === 'ArrowLeft' ? -1 : 1
          const nextRatio = clampRatio(ratioRef.current + direction * 0.02)
          ratioRef.current = nextRatio
          props.onRatioChange(nextRatio)
          props.onRatioCommit(nextRatio)
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          updateFromClientX(event.clientX)
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            updateFromClientX(event.clientX)
          }
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          commitRatio()
        }}
        onPointerCancel={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          commitRatio()
        }}
      />
      <div className={['split-pane', 'split-pane-right', props.rightClassName].filter(Boolean).join(' ')}>
        {props.right}
      </div>
    </div>
  )
}
