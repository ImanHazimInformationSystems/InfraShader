import { workspaceStatus } from './save-status'

const base = { saveState: 'idle' as const, treeDirty: false, dirty: false, revision: 4 }

describe('workspace save status', () => {
  it('distinguishes saved, never saved, unsaved and tree-only drafts', () => {
    expect(workspaceStatus(base)).toBe('All changes saved (version 4)')
    expect(workspaceStatus({ ...base, revision: 0 })).toBe('Not saved yet')
    expect(workspaceStatus({ ...base, dirty: true })).toBe('Unsaved changes')
    expect(workspaceStatus({ ...base, treeDirty: true })).toBe('Unsaved tree decisions')
  })
  it('shows pending and failed saves instead of a plain unsaved label', () => {
    expect(workspaceStatus({ ...base, dirty: true, saveState: 'saving' })).toBe('Saving…')
    expect(workspaceStatus({ ...base, dirty: true, saveState: 'failed' })).toMatch(/^Save failed/)
    expect(workspaceStatus({ ...base, dirty: true, saveState: 'conflict' })).toMatch(
      /newer version/,
    )
  })
  it('does not keep a stale failure once the draft is saved or discarded', () => {
    expect(workspaceStatus({ ...base, saveState: 'failed' })).toBe('All changes saved (version 4)')
  })
})
