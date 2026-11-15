import { describe, it, expect } from 'vitest'
import { planInput, type PlanReference } from './plan-reference'
import { draftWorkspace, workspaceInput } from './workspace'

const plan: PlanReference = {
  evidence_id: '00000000-0000-4000-8000-000000000001',
  source_name: 'synthetic.pdf',
  source_sha256: 'a'.repeat(64),
  page: 2,
  rights_confirmed: true,
  width: 1000,
  height: 500,
  point_a: [0, 0],
  point_b: [1000, 0],
  anchor: [101.682, 3.132],
  distance_m: 100,
  bearing_deg: 90,
  uncertainty_m: 1,
  source_note: 'Synthetic only',
  locked: true,
  visible: true,
  opacity: 0.5,
  calibration_id: 'b'.repeat(64),
  metric_crs: 'EPSG:32647',
  metres_per_pixel: 0.1,
  corners: [
    [101, 3],
    [102, 3],
    [102, 2],
    [101, 2],
  ],
}
describe('reference request boundary', () => {
  it('sends calibration inputs without pretending browser corners are authoritative', () => {
    const input = planInput(plan)
    expect(input).not.toHaveProperty('corners')
    expect(input).not.toHaveProperty('calibration_id')
    expect(input.source_sha256).toBe(plan.source_sha256)
    expect(input.page).toBe(2)
    expect(plan.corners).toHaveLength(4)
  })
  it('keeps trace binding while removing server-only review flags from saved drafts', () => {
    const data = draftWorkspace([101.681, 3.131, 101.683, 3.133])
    data.plan_reference = plan
    data.targets = [
      {
        id: '00000000-0000-4000-8000-000000000002',
        name: 'Target',
        geometry: data.boundary,
        source_note: 'Reference',
        provenance: 'sourced',
        reference_calibration: plan.calibration_id,
        reference_review_required: true,
      },
    ]
    const input = workspaceInput(data, 4)
    expect(input.targets[0].reference_calibration).toBe(plan.calibration_id)
    expect(input.targets[0]).not.toHaveProperty('reference_review_required')
    expect(input.plan_reference).not.toHaveProperty('corners')
    expect(data.targets[0].reference_review_required).toBe(true)
    expect(input.expected_revision).toBe(4)
  })
})
