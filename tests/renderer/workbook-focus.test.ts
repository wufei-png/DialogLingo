/** @vitest-environment jsdom */

import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../src/renderer/src/i18n/i18n'
import { CardStream } from '../../src/renderer/src/features/workbook/CardStream'

type Row = {
  id: string
  itemType: 'Expression'
  state: 'active'
  editVersion: number
  isEdited: boolean
  currentSnapshot: {
    sourceText: string
    targetText: string
    gloss: string
    explanation: string
    contextText: string
    quizPrompt: string
    quizAnswer: string
    tags: string[]
  }
  sourceRefs: Array<{
    sessionId: string
    sourceSpanRef: string
    excerpt: string
  }>
}

const originalRect = HTMLElement.prototype.getBoundingClientRect
const originalOffsetHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'offsetHeight'
)
const originalClientHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'clientHeight'
)
const originalClientWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'clientWidth'
)
const originalOffsetWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'offsetWidth'
)
const originalScrollHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollHeight'
)
const originalScrollTo = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollTo'
)
const originalRequestAnimationFrame = window.requestAnimationFrame

function makeRow(index: number): Row {
  return {
    id: `row-${index}`,
    itemType: 'Expression',
    state: 'active',
    editVersion: 0,
    isEdited: false,
    currentSnapshot: {
      sourceText: `source ${index}`,
      targetText: `target ${index}`,
      gloss: `gloss ${index}`,
      explanation: `explanation ${index}`,
      contextText: `context ${index}`,
      quizPrompt: `quiz ${index}`,
      quizAnswer: `answer ${index}`,
      tags: []
    },
    sourceRefs: []
  }
}

function makeProps(rows: Row[], selectedItemId: string | null, selectionFocusRevision: number) {
  return {
    rows,
    selectedItemId,
    selectionFocusRevision,
    focusTargetRevision: 0,
    onSelectItem: vi.fn(),
    onAdvanceSelection: vi.fn(),
    onDeleteItem: vi.fn(),
    onRestoreItem: vi.fn(),
    onSaveItem: vi.fn().mockResolvedValue(undefined),
    saveStates: new Map(),
    onDraftChange: vi.fn(),
    onDiscardDraft: vi.fn(),
    onRetrySave: vi.fn().mockResolvedValue(undefined),
    onRevertItem: vi.fn(),
    onOpenSource: vi.fn()
  }
}

function getCards(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('[data-workbook-card="true"]')]
}

async function settleVirtualizer() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 40))
  })
}

describe('workbook card focus contract', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  beforeAll(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const height = this.classList.contains('workbook-stream') ? 320 : 190
      return {
        bottom: height,
        height,
        left: 0,
        right: 640,
        top: 0,
        width: 640,
        x: 0,
        y: 0,
        toJSON: () => ({})
      } as DOMRect
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        if (this.classList.contains('workbook-stream')) {
          return 320
        }
        return this.classList.contains('workbook-stream-row') ? 190 : 0
      }
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return this.classList.contains('workbook-stream') ? 320 : 0
      }
    })
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return this.classList.contains('workbook-stream') ? 640 : 0
      }
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() {
        return this.classList.contains('workbook-stream') ? 640 : 0
      }
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.classList.contains('workbook-stream') ? 8000 : 0
      }
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value(this: HTMLElement, options: ScrollToOptions | number) {
        const top = typeof options === 'number' ? options : options.top ?? 0
        this.scrollTop = top
        this.dispatchEvent(new Event('scroll'))
      }
    })
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value(callback: FrameRequestCallback) {
        return window.setTimeout(() => callback(Date.now()), 0)
      }
    })
  })

  afterEach(() => {
    if (root && container) {
      act(() => root?.unmount())
    }
    root = null
    container?.remove()
    container = null
    vi.restoreAllMocks()
  })

  afterAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: originalRect
    })
    if (originalOffsetHeight) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
    }
    if (originalClientHeight) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight)
    }
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth)
    }
    if (originalOffsetWidth) {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth)
    }
    if (originalScrollHeight) {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight)
    }
    if (originalScrollTo) {
      Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo)
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
    }
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: originalRequestAnimationFrame
    })
  })

  it('uses one roving anchor and focuses a selected card after a virtual-window jump', async () => {
    const rows = Array.from({ length: 40 }, (_, index) => makeRow(index))
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(createElement(CardStream, makeProps(rows, 'row-0', 1)))
    })
    await settleVirtualizer()

    expect(container.querySelector('[data-workbook-item-id="row-39"]')).toBeNull()
    expect(getCards(container).filter((card) => card.tabIndex === 0)).toHaveLength(1)
    expect(document.activeElement?.getAttribute('data-workbook-item-id')).toBe('row-0')

    await act(async () => {
      root?.render(createElement(CardStream, makeProps(rows, 'row-39', 2)))
    })
    await settleVirtualizer()

    const selected = container.querySelector<HTMLElement>('[data-workbook-item-id="row-39"]')
    expect(selected).not.toBeNull()
    expect(selected?.tabIndex).toBe(0)
    expect(getCards(container).filter((card) => card.tabIndex === 0)).toEqual([selected])
    expect(document.activeElement).toBe(selected)
  })
})
