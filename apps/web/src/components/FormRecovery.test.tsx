import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import FormRecovery from './FormRecovery'

describe('revision-safe form recovery', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })
  function draft(revision: string, savedAt = Date.now()) {
    sessionStorage.setItem(
      'fixture',
      JSON.stringify({ revision, savedAt, values: { notes: 'Keep my review' } }),
    )
  }
  it('recovers matching revisions without saving to the server', () => {
    draft('1/2/3')
    const restore = vi.fn()
    render(
      <FormRecovery
        storageKey="fixture"
        revision="1/2/3"
        values={{}}
        dirty={false}
        onRestore={restore}
      />,
    )
    fireEvent.click(screen.getByText('Recover form draft'))
    expect(restore).toHaveBeenCalledWith({ notes: 'Keep my review' })
  })
  it('blocks restoration when saved inputs changed and permits discard', () => {
    draft('1/2/3')
    const restore = vi.fn()
    render(
      <FormRecovery
        storageKey="fixture"
        revision="1/3/3"
        values={{}}
        dirty={false}
        onRestore={restore}
      />,
    )
    expect((screen.getByText('Recover form draft') as HTMLButtonElement).disabled).toBe(true)
    expect(restore).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Discard form draft'))
    expect(sessionStorage.getItem('fixture')).toBeNull()
  })
  it('expires old recovery records', () => {
    draft('1', Date.now() - 9 * 60 * 60 * 1000)
    render(
      <FormRecovery
        storageKey="fixture"
        revision="1"
        values={{}}
        dirty={false}
        onRestore={vi.fn()}
      />,
    )
    expect(screen.queryByText('Recover form draft')).toBeNull()
    expect(sessionStorage.getItem('fixture')).toBeNull()
  })
})
