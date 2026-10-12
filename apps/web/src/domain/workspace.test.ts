import { coordinateText, draftWorkspace, parseCoordinates, workspaceInput, workspaceSchema } from './workspace'

describe('workspace boundaries', () => {
  it('keeps independent options and strips server-derived values from edits', () => {
    const draft = draftWorkspace([101.681,3.131,101.683,3.133])
    draft.metric_crs = 'EPSG:32647'
    const input = workspaceInput(draft, 3)
    expect(input.expected_revision).toBe(3)
    expect(input).not.toHaveProperty('metric_crs')
    expect(draft.metric_crs).toBe('EPSG:32647')
    expect(draft.scenarios.option_a).not.toBe(draft.scenarios.option_b)
  })
  it('round trips the numeric alternative without swapping latitude and longitude', () => {
    const geometry = parseCoordinates('101.681, 3.131\n101.682, 3.132', 'LineString')
    expect(coordinateText(geometry)).toBe('101.681, 3.131\n101.682, 3.132')
    expect(() => parseCoordinates('101, 3\n102, 4', 'Point')).toThrow('exactly one')
    expect(() => parseCoordinates('NaN, 3', 'Point')).toThrow()
  })
  it('rejects invalid real API response contracts', () => {
    expect(workspaceSchema.safeParse({revision: -1, data: null}).success).toBe(false)
    expect(workspaceSchema.safeParse({revision: 1, data: {boundary: 'bad'}}).success).toBe(false)
  })
})
