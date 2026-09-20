import type { WorkbookSnapshot } from '../../../../shared/schemas/workbook'

export type WorkbookSaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

export type WorkbookSaveState = {
  confirmedSnapshot: WorkbookSnapshot
  draftSnapshot: WorkbookSnapshot
  editVersion: number
  status: WorkbookSaveStatus
  error: string | null
}

export type WorkbookSaveResult =
  | {
      status: 'saved'
      currentSnapshot: WorkbookSnapshot
      editVersion: number
    }
  | {
      status: 'conflict'
      currentSnapshot: WorkbookSnapshot
      editVersion: number
    }

type ServerItem = {
  id: string
  currentSnapshot: WorkbookSnapshot
  editVersion: number
}

type QueueEntry = WorkbookSaveState & {
  inFlight: Promise<void> | null
}

function snapshotsEqual(left: WorkbookSnapshot, right: WorkbookSnapshot) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function preserveServerOnlyFields(draft: WorkbookSnapshot, confirmed: WorkbookSnapshot) {
  return {
    ...draft,
    sourceText: confirmed.sourceText,
    ...(typeof confirmed.flagged === 'boolean' ? { flagged: confirmed.flagged } : {})
  }
}

export class WorkbookSaveQueue {
  private readonly entries = new Map<string, QueueEntry>()

  constructor(
    private readonly save: (input: {
      itemId: string
      currentSnapshot: WorkbookSnapshot
      baseVersion: number
    }) => Promise<WorkbookSaveResult>,
    private readonly onChange: () => void
  ) {}

  syncServer(items: ServerItem[]) {
    for (const item of items) {
      const entry = this.entries.get(item.id)
      if (!entry) {
        this.entries.set(item.id, {
          confirmedSnapshot: item.currentSnapshot,
          draftSnapshot: item.currentSnapshot,
          editVersion: item.editVersion,
          status: 'idle',
          error: null,
          inFlight: null
        })
        continue
      }

      if (!snapshotsEqual(entry.draftSnapshot, entry.confirmedSnapshot)) {
        continue
      }

      entry.confirmedSnapshot = item.currentSnapshot
      entry.draftSnapshot = item.currentSnapshot
      entry.editVersion = item.editVersion
      if (entry.status !== 'saving') {
        entry.status = 'idle'
      }
      entry.error = null
    }
    this.onChange()
  }

  get(itemId: string): WorkbookSaveState | undefined {
    const entry = this.entries.get(itemId)
    if (!entry) {
      return undefined
    }
    const { inFlight: _inFlight, ...state } = entry
    return state
  }

  getAll() {
    return new Map(
      [...this.entries].map(([itemId, entry]) => {
        const { inFlight: _inFlight, ...state } = entry
        return [itemId, state]
      })
    )
  }

  setDraft(itemId: string, draft: WorkbookSnapshot) {
    const entry = this.requireEntry(itemId)
    entry.draftSnapshot = preserveServerOnlyFields(draft, entry.confirmedSnapshot)
    if (entry.status !== 'saving') {
      entry.status = 'idle'
    }
    entry.error = null
    this.onChange()
  }

  discardDraft(itemId: string) {
    const entry = this.requireEntry(itemId)
    // Keep this desired value while a request is in flight. If that request
    // succeeds after Esc, the drain writes the confirmed value back instead of
    // allowing the stale response to become the visible final draft.
    entry.draftSnapshot = entry.confirmedSnapshot
    entry.error = null
    if (entry.status !== 'saving') {
      entry.status = 'idle'
    }
    this.onChange()
  }

  requestSave(itemId: string) {
    const entry = this.requireEntry(itemId)
    if (entry.inFlight) {
      return entry.inFlight
    }
    if (snapshotsEqual(entry.draftSnapshot, entry.confirmedSnapshot)) {
      entry.status = 'saved'
      entry.error = null
      this.onChange()
      return Promise.resolve()
    }

    entry.inFlight = this.drain(itemId, entry).finally(() => {
      entry.inFlight = null
      this.onChange()
    })
    return entry.inFlight
  }

  private requireEntry(itemId: string) {
    const entry = this.entries.get(itemId)
    if (!entry) {
      throw new Error(`Workbook item not found: ${itemId}`)
    }
    return entry
  }

  private async drain(itemId: string, entry: QueueEntry) {
    while (!snapshotsEqual(entry.draftSnapshot, entry.confirmedSnapshot)) {
      const requestedSnapshot = entry.draftSnapshot
      const requestedVersion = entry.editVersion
      entry.status = 'saving'
      entry.error = null
      this.onChange()

      try {
        const result = await this.save({
          itemId,
          currentSnapshot: requestedSnapshot,
          baseVersion: requestedVersion
        })
        entry.confirmedSnapshot = result.currentSnapshot
        entry.editVersion = result.editVersion

        if (result.status === 'conflict') {
          entry.draftSnapshot = preserveServerOnlyFields(
            entry.draftSnapshot,
            result.currentSnapshot
          )
          entry.status = 'conflict'
          entry.error = 'conflict'
          throw new Error('conflict')
        }
      } catch (error) {
        if (entry.status === 'conflict') {
          throw error
        }
        entry.status = 'error'
        entry.error = error instanceof Error ? error.message : 'save-failed'
        throw error
      }
    }

    entry.status = 'saved'
    entry.error = null
  }
}
