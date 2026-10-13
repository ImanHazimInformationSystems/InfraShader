import { draftWorkspace } from '../domain/workspace'
import { clearWorkspaceDrafts, readWorkspaceDraft, workspaceDraftKey } from './workspace-draft'

describe('account-scoped tab recovery', () => {
  beforeEach(() => sessionStorage.clear())
  const draft = () => ({
    savedAt: Date.now(),
    revision: 2,
    data: draftWorkspace([101.68, 3.13, 101.69, 3.14]),
    form: {
      scenario: 'baseline',
      kind: 'target',
      name: 'Unsaved target',
      source: 'Measured fixture',
      coordinates: '',
      height: '',
      heightSource: '',
      count: '1',
      override: '',
      provenance: 'measured',
      editingId: null,
      pendingForm: true,
    },
  })
  it('separates accounts and removes only the signed-out account drafts', () => {
    const owner = workspaceDraftKey('owner', 'org', 'project')
    const foreign = workspaceDraftKey('foreign', 'org', 'project')
    sessionStorage.setItem(owner, JSON.stringify(draft()))
    expect(readWorkspaceDraft(foreign)).toBeNull()
    sessionStorage.setItem(foreign, JSON.stringify(draft()))
    clearWorkspaceDrafts('owner')
    expect(readWorkspaceDraft(owner)).toBeNull()
    expect(readWorkspaceDraft(foreign)?.form.name).toBe('Unsaved target')
  })
  it('expires old records and rejects invalid workspace contracts', () => {
    const key = workspaceDraftKey('owner', 'org', 'project')
    sessionStorage.setItem(
      key,
      JSON.stringify({ ...draft(), savedAt: Date.now() - 9 * 60 * 60 * 1000 }),
    )
    expect(readWorkspaceDraft(key)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
    sessionStorage.setItem(key, JSON.stringify({ ...draft(), data: { invalid: true } }))
    expect(readWorkspaceDraft(key)).toBeNull()
  })
  it('discarding one project preserves another project draft', () => {
    const one = workspaceDraftKey('owner', 'org', 'one')
    const two = workspaceDraftKey('owner', 'org', 'two')
    sessionStorage.setItem(one, JSON.stringify(draft()))
    sessionStorage.setItem(two, JSON.stringify(draft()))
    clearWorkspaceDrafts('owner', 'org', 'one')
    expect(readWorkspaceDraft(one)).toBeNull()
    expect(readWorkspaceDraft(two)?.revision).toBe(2)
  })
})
