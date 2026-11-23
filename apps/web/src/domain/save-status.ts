/** Outcome of the most recent explicit workspace save. Unsaved edits are tracked separately. */
export type SaveState = 'idle' | 'saving' | 'failed' | 'conflict'

/**
 * One status line for the studio header. A pending save or a failed save outranks
 * "unsaved", so a user never reads a failure as merely "not yet saved".
 */
export function workspaceStatus(input: {
  saveState: SaveState
  treeDirty: boolean
  dirty: boolean
  revision: number
}): string {
  if (input.saveState === 'saving') return 'Saving…'
  // Short labels fit the studio header; the studio message explains the cause in full.
  if (input.dirty && input.saveState === 'conflict') return 'Not saved: newer version exists'
  if (input.dirty && input.saveState === 'failed') return 'Save failed: not saved'
  if (input.treeDirty) return 'Unsaved tree decisions'
  if (input.dirty) return 'Unsaved changes'
  return input.revision ? `All changes saved (version ${input.revision})` : 'Not saved yet'
}
