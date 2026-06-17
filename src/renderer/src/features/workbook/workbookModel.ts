export type WorkbookSourceMode = 'focus' | 'drawer' | 'pinned'

export type WorkbookNavigationRow = {
  id: string
}

export function getInitialWorkbookSourceMode(pinned: boolean): WorkbookSourceMode {
  return pinned ? 'pinned' : 'focus'
}

export function openWorkbookSource(pinned: boolean): WorkbookSourceMode {
  return pinned ? 'pinned' : 'drawer'
}

export function closeWorkbookSource(): WorkbookSourceMode {
  return 'focus'
}

export function pinWorkbookSource(): WorkbookSourceMode {
  return 'pinned'
}

export function unpinWorkbookSource(): WorkbookSourceMode {
  return 'focus'
}

export function reconcileWorkbookSelection(
  rows: WorkbookNavigationRow[],
  selectedItemId: string | null
) {
  if (!selectedItemId) {
    return null
  }

  return rows.some((row) => row.id === selectedItemId) ? selectedItemId : null
}

export function moveWorkbookSelection(
  rows: WorkbookNavigationRow[],
  selectedItemId: string | null,
  direction: -1 | 1
) {
  if (rows.length === 0) {
    return null
  }

  if (!selectedItemId) {
    return rows[direction > 0 ? 0 : rows.length - 1].id
  }

  const currentIndex = rows.findIndex((row) => row.id === selectedItemId)
  if (currentIndex < 0) {
    return rows[0].id
  }

  const nextIndex = Math.min(rows.length - 1, Math.max(0, currentIndex + direction))
  return rows[nextIndex].id
}

export function selectAfterWorkbookRemoval(
  rows: WorkbookNavigationRow[],
  removedItemId: string,
  selectedItemId: string | null
) {
  if (selectedItemId !== removedItemId) {
    return reconcileWorkbookSelection(rows, selectedItemId)
  }

  const removedIndex = rows.findIndex((row) => row.id === removedItemId)
  const remainingRows = rows.filter((row) => row.id !== removedItemId)
  if (remainingRows.length === 0) {
    return null
  }

  return remainingRows[Math.min(removedIndex, remainingRows.length - 1)].id
}
