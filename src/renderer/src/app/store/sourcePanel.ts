import { createStore } from 'zustand/vanilla'

type SourcePanelState = {
  open: boolean
  focusedItemId: string | null
  openForItem: (itemId: string) => void
  close: () => void
}

export function createSourcePanelStore() {
  return createStore<SourcePanelState>()((set) => ({
    open: false,
    focusedItemId: null,
    openForItem: (itemId) =>
      set({
        open: true,
        focusedItemId: itemId
      }),
    close: () =>
      set({
        open: false,
        focusedItemId: null
      })
  }))
}
