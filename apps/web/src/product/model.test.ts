import { describe, expect, it } from 'vitest'
import { areaFeatures, areas, features, productPath } from './model'
import { parseRoute } from '../services/routes'

describe('roadmap UI reachability', () => {
  it('gives 85 current project roadmap records a permitted workspace and round-trippable deep link', () => {
    expect(features).toHaveLength(85)
    expect(new Set(features.map((f) => f.id)).size).toBe(85)
    for (const feature of features) {
      const workspace = feature.id.startsWith('O') ? 'review' : 'studio'
      expect(areas.some((a) => a.id === feature.group)).toBe(true)
      expect(areaFeatures(workspace, feature.group).some((f) => f.id === feature.id)).toBe(true)
      expect(parseRoute(productPath(workspace, feature.group, feature.id))).toMatchObject({
        screen: 'product',
        workspace,
        area: feature.group,
        feature: feature.id,
      })
      expect(feature.fields.length).toBeGreaterThanOrEqual(3)
    }
    expect(features.find((feature) => feature.id === 'L31')).toBeDefined()
    expect(productPath('studio', 'design', 'L31')).toBe('/studio/workspace/design/L31')
  })
  it('keeps workspace-specific features separate and shares platform/AI capabilities', () => {
    expect(areaFeatures('studio', 'briefs')).toEqual([])
    expect(areaFeatures('review', 'design')).toEqual([])
    expect(areaFeatures('studio', 'assistant').some((f) => f.id === 'A01')).toBe(true)
    expect(areaFeatures('review', 'assistant').some((f) => f.id === 'A01')).toBe(true)
    expect(areaFeatures('studio', 'organisation').some((f) => f.id === 'O27')).toBe(false)
  })
  it('preserves existing project routes and rejects malformed UI links', () => {
    expect(
      parseRoute(
        '/studio/organisations/00000000-0000-4000-8000-000000000001/projects/00000000-0000-4000-8000-000000000002/edit',
      ),
    ).toMatchObject({ screen: 'edit', workspace: 'studio' })
    expect(parseRoute('/demo/projects/00000000-0000-4000-8000-000000000002')).toMatchObject({
      screen: 'project',
      demo: true,
    })
    expect(parseRoute('/studio/workspace/briefs/../settings')).toBeNull()
  })
})
