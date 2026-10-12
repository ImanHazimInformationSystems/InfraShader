import { fireEvent, render, screen } from '@testing-library/react'
import BoundsForm from './BoundsForm'
import { initialBounds } from '../domain/projects'

describe('numeric site selection', () => {
  it('rejects an oversized viewport and preserves a valid numeric geographic extent', () => {
    const apply = vi.fn()
    render(<BoundsForm initial={initialBounds} viewport={[100, 3, 101, 4]} onApply={apply} />)
    fireEvent.click(screen.getByRole('button', { name: 'Use current map view' }))
    expect(screen.getByRole('alert').textContent).toContain('Zoom in')
    expect(apply).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('West longitude'), { target: { value: '101.681' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply coordinates' }))
    expect(apply).toHaveBeenCalledWith([101.681, 3.13, 101.7, 3.15])
  })
})
