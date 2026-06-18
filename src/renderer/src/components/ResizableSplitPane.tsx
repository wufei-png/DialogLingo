import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
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

function parsePixelLength(value: string, fallback: number) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function ResizableSplitPane(props: Props) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const ratioRef = useRef(clampRatio(props.ratio))
  const ratio = clampRatio(props.ratio)

  useEffect(() => {
    ratioRef.current = ratio
  }, [ratio])

  const clampToContainer = useCallback((value: number) => {
    const container = containerRef.current
    const rect = container?.getBoundingClientRect()
    if (!container || !rect || rect.width <= 0) {
      return clampRatio(value)
    }

    const styles = window.getComputedStyle(container)
    const dividerSize = parsePixelLength(
      styles.getPropertyValue('--split-divider-size'),
      8
    )
    const leftMin = parsePixelLength(styles.getPropertyValue('--split-left-min'), 220)
    const rightMin = parsePixelLength(styles.getPropertyValue('--split-right-min'), 360)
    const availableWidth = Math.max(1, rect.width - dividerSize)

    if (leftMin + rightMin >= availableWidth) {
      return leftMin / Math.max(1, leftMin + rightMin)
    }

    const minRatio = Math.max(MIN_SPLIT_RATIO, leftMin / availableWidth)
    const maxRatio = Math.min(MAX_SPLIT_RATIO, 1 - rightMin / availableWidth)
    return Math.min(maxRatio, Math.max(minRatio, value))
  }, [])

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) {
        return ratioRef.current
      }

      const nextRatio = clampToContainer((clientX - rect.left) / rect.width)
      ratioRef.current = nextRatio
      props.onRatioChange(nextRatio)
      return nextRatio
    },
    [clampToContainer, props]
  )

  const commitRatio = useCallback(() => {
    props.onRatioCommit(ratioRef.current)
  }, [props])

  return (
    <div
      ref={containerRef}
      className={['resizable-split-pane', props.className].filter(Boolean).join(' ')}
      style={{
        gridTemplateColumns: `minmax(0, calc((100% - var(--split-divider-size, 8px)) * ${ratio})) var(--split-divider-size, 8px) minmax(0, calc((100% - var(--split-divider-size, 8px)) * ${1 - ratio}))`
      }}
    >
      <div className={['split-pane', 'split-pane-left', props.leftClassName].filter(Boolean).join(' ')}>
        {props.left}
      </div>
      <button
        type="button"
        className="split-divider"
        aria-label={t('split.resizePanes')}
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
          const nextRatio = clampToContainer(ratioRef.current + direction * 0.02)
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
