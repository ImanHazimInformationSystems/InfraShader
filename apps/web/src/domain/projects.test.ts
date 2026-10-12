import { boundsPolygon, boundsSchema, emptyBrief, initialBounds, projectInputSchema } from './projects'

describe('geographic locator contract', () => {
  it('preserves longitude/latitude order and closes the selected extent polygon', () => {
    const bounds = boundsSchema.parse([101.6, 3.1, 101.7, 3.2])
    expect(boundsPolygon(bounds).geometry.coordinates[0]).toEqual([[101.6, 3.1], [101.7, 3.1], [101.7, 3.2], [101.6, 3.2], [101.6, 3.1]])
  })
  it.each([[101, 3, 100, 4], [101, 4, 102, 3], [180, 3, 181, 4], [101, 85, 101.01, 86], [101, 3, 102, 3.01], [NaN, 3, 101.01, 3.01]])('rejects invalid or unsupported bounds %s', (...bounds) => {
    expect(boundsSchema.safeParse(bounds).success).toBe(false)
  })
  it('allows a progressive brief with just name, stakeholder, purpose and valid extent', () => {
    const parsed = projectInputSchema.parse({ ...emptyBrief(initialBounds), name: 'Courtyard', stakeholder: 'Project team' })
    expect(parsed.problem).toBe(''); expect(parsed.use_periods).toBe('')
    expect(projectInputSchema.safeParse({ ...parsed, timezone: 'not/a/timezone' }).success).toBe(false)
    expect(projectInputSchema.safeParse({ ...parsed, stakeholder: '' }).success).toBe(false)
  })
})
