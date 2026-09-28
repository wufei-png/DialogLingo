/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../src/renderer/src/i18n/i18n'
import { WorkbookCard } from '../../src/renderer/src/features/workbook/WorkbookCard'
import { WorkbookPage } from '../../src/renderer/src/features/workbook/WorkbookPage'

const mocks = vi.hoisted(() => ({
  workbookListQuery: vi.fn(),
  workbookDeleteMutate: vi.fn(),
  workbookRestoreMutate: vi.fn(),
  workbookSaveMutate: vi.fn(),
  workbookRevertMutate: vi.fn(),
  useJobSubscription: vi.fn()
}))

vi.mock('../../src/renderer/src/lib/trpc', () => ({
  trpc: {
    workbookList: { query: mocks.workbookListQuery },
    workbookDeleteItem: { mutate: mocks.workbookDeleteMutate },
    workbookRestoreItem: { mutate: mocks.workbookRestoreMutate },
    workbookSaveItem: { mutate: mocks.workbookSaveMutate },
    workbookRevertItem: { mutate: mocks.workbookRevertMutate }
  }
}))

vi.mock('../../src/renderer/src/lib/useJobSubscription', () => ({
  useJobSubscription: mocks.useJobSubscription
}))

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

const confirmedSnapshot = {
  sourceText: 'source',
  targetText: 'target',
  gloss: 'gloss',
  explanation: 'explanation',
  contextText: 'context',
  quizPrompt: 'quiz',
  quizAnswer: 'answer',
  tags: ['tag']
}

function makeRow(index: number, state: 'active' | 'deleted' = 'active') {
  return {
    id: `row-${index}`,
    workbookId: 'workbook',
    itemType: 'Expression' as const,
    state,
    generatedSnapshot: {
      sourceText: `source ${index}`,
      targetText: `target ${index}`,
      gloss: `gloss ${index}`,
      explanation: `explanation ${index}`,
      contextText: `context ${index}`,
      quizPrompt: `quiz ${index}`,
      quizAnswer: `answer ${index}`,
      tags: []
    },
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
    sourceRefs: [],
    editVersion: 0,
    isEdited: false
  }
}

function cardProps(overrides: Record<string, unknown> = {}) {
  return {
    itemId: 'item',
    itemType: 'Expression' as const,
    source: 'source',
    target: 'target',
    gloss: 'gloss',
    explanation: 'explanation',
    contextText: 'context',
    quiz: 'quiz',
    quizAnswer: 'answer',
    tags: 'tag',
    confirmedSnapshot,
    sourceRefCount: 1,
    selected: true,
    modified: false,
    focusTargetRequest: null,
    tabIndex: 0,
    anchorRef: vi.fn(),
    onSelect: vi.fn(),
    onDelete: vi.fn(),
    onRestore: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    onSaveAndAdvance: vi.fn().mockResolvedValue(undefined),
    onDraftChange: vi.fn(),
    onDiscardDraft: vi.fn(),
    saveStatus: 'idle' as const,
    saveError: null,
    onRetry: vi.fn().mockResolvedValue(undefined),
    onAdvance: vi.fn(),
    onRevert: vi.fn(),
    onOpenSource: vi.fn(),
    ...overrides
  }
}

async function dispatchKey(
  target: EventTarget,
  key: string,
  options: KeyboardEventInit = {}
) {
  let event!: KeyboardEvent
  await act(async () => {
    event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key,
      ...options
    })
    target.dispatchEvent(event)
  })
  return event
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 50))
  })
}

describe('workbook keyboard and accessible focus behavior', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  beforeAll(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    mocks.workbookListQuery.mockReset()
    mocks.workbookDeleteMutate.mockReset().mockResolvedValue({})
    mocks.workbookRestoreMutate.mockReset().mockResolvedValue({})
    mocks.workbookSaveMutate.mockReset()
    mocks.workbookRevertMutate.mockReset()
    mocks.useJobSubscription.mockReset()

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

  it('does not hijack text editing keys and lets Enter enter the primary field', async () => {
    const rows = [makeRow(0), makeRow(1)]
    mocks.workbookListQuery.mockResolvedValue(rows)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(WorkbookPage, {
            workbookSplitRatio: 0.3,
            workbookSourcePinned: false,
            onWorkbookSplitRatioChange: vi.fn(),
            onWorkbookSplitRatioCommit: vi.fn(),
            onWorkbookSourcePinnedChange: vi.fn().mockResolvedValue(undefined),
            onWorkbookReady: vi.fn(),
            onBackToSearch: vi.fn(),
            jobId: null,
            workbookId: 'workbook'
          })
        )
      )
    })
    await settle()

    const first = container.querySelector<HTMLElement>('[data-workbook-item-id="row-0"]')
    const second = container.querySelector<HTMLElement>('[data-workbook-item-id="row-1"]')
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(first?.tabIndex).toBe(-1)

    const firstNavigation = await dispatchKey(window, 'j')
    await settle()
    expect(firstNavigation.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)

    const down = await dispatchKey(first!, 'j')
    await settle()
    expect(down.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(second)

    const enter = await dispatchKey(second!, 'Enter')
    await settle()
    expect(enter.defaultPrevented).toBe(true)
    expect(document.activeElement?.tagName).toBe('INPUT')
    expect((document.activeElement as HTMLInputElement).value).toBe('target 1')

    const targetInput = document.activeElement as HTMLInputElement
    const textKey = await dispatchKey(targetInput, 'j')
    const deleteKey = await dispatchKey(targetInput, 'Backspace')
    await settle()
    expect(textKey.defaultPrevented).toBe(false)
    expect(deleteKey.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(targetInput)

    const nextCardControl = first?.querySelector<HTMLButtonElement>('button')
    expect(nextCardControl).not.toBeNull()
    await act(async () => {
      nextCardControl?.focus()
    })
    await settle()
    expect(document.activeElement).toBe(nextCardControl)

    await act(async () => {
      first?.focus()
    })
    const secondEnter = await dispatchKey(first!, 'Enter')
    await settle()
    expect(secondEnter.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first?.querySelector('input'))

    const deleteButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.includes('Delete')
    )
    expect(deleteButton).not.toBeUndefined()
    deleteButton?.focus()
    const buttonEnter = await dispatchKey(deleteButton!, 'Enter')
    const buttonDelete = await dispatchKey(deleteButton!, 'Delete')
    expect(buttonEnter.defaultPrevented).toBe(false)
    expect(buttonDelete.defaultPrevented).toBe(false)
    expect(mocks.workbookDeleteMutate).not.toHaveBeenCalled()
  })

  it('keeps Esc, save failure, retry, restore, source, and tab stops accessible', async () => {
    const onDiscardDraft = vi.fn()
    const cardContainer = document.createElement('div')
    document.body.append(cardContainer)
    container = cardContainer
    root = createRoot(cardContainer)
    await act(async () => {
      root?.render(
        createElement(WorkbookCard, cardProps({ onDiscardDraft }))
      )
    })

    const card = cardContainer.querySelector<HTMLElement>('[data-workbook-card="true"]')!
    const targetInput = card.querySelector<HTMLInputElement>('input')!
    expect(card.getAttribute('aria-label')).toContain('Selected')
    targetInput.focus()
    targetInput.value = 'unconfirmed edit'
    await dispatchKey(targetInput, 'Escape')
    expect(targetInput.value).toBe('target')
    expect(onDiscardDraft).toHaveBeenCalledTimes(1)
    expect(card.querySelector('input[value="source"]')).toBeNull()

    await act(async () => {
      root?.render(
        createElement(WorkbookCard, cardProps({ saveStatus: 'saving' }))
      )
    })
    expect(cardContainer.querySelector('[aria-live="polite"]')?.textContent).toContain(
      'Saving'
    )

    const onRetry = vi.fn().mockResolvedValue(undefined)
    await act(async () => {
      root?.render(
        createElement(
          WorkbookCard,
          cardProps({
            saveStatus: 'error',
            saveError: 'offline',
            modified: true,
            onRetry
          })
        )
      )
    })
    const alert = cardContainer.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('offline')
    expect(alert?.getAttribute('aria-atomic')).toBe('true')
    expect(cardContainer.querySelector('[aria-live="polite"]')).toBeNull()
    const retry = [...cardContainer.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.includes('Retry')
    )
    expect(retry).not.toBeUndefined()
    await act(async () => {
      retry?.click()
    })
    expect(onRetry).toHaveBeenCalledTimes(1)

    const onRestore = vi.fn()
    await act(async () => {
      root?.render(
        createElement(
          WorkbookCard,
          cardProps({ deleted: true, selected: true, onRestore })
        )
      )
    })
    const restore = [...cardContainer.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.includes('Restore')
    )
    expect(restore).not.toBeUndefined()
    await act(async () => {
      restore?.click()
    })
    expect(onRestore).toHaveBeenCalledTimes(1)
    expect(cardContainer.querySelector<HTMLElement>('[data-workbook-card="true"]')?.tabIndex).toBe(0)
    expect(
      [...cardContainer.querySelectorAll<HTMLElement>('input, textarea, button')].every(
        (element) => element.tabIndex === 0
      )
    ).toBe(true)
  })
})
