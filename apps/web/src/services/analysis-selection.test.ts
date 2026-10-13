import { matchesAnalysisTime } from './analysis-selection'
it('compares the same instant across offsets and project-local time; changed input is incompatible', () => {
  expect(
    matchesAnalysisTime(
      '2026-03-21T04:00:00Z',
      '2026-03-21T12:00:00+08:00',
      'offset',
      'Asia/Kuala_Lumpur',
    ),
  ).toBe(true)
  expect(
    matchesAnalysisTime('2026-03-21T04:00:00Z', '2026-03-21T12:00', 'local', 'Asia/Kuala_Lumpur'),
  ).toBe(true)
  expect(
    matchesAnalysisTime('2026-03-21T04:00:00Z', '2026-03-21T13:00', 'local', 'Asia/Kuala_Lumpur'),
  ).toBe(false)
  expect(matchesAnalysisTime('2026-03-21T04:00:00Z', '', 'offset', 'Asia/Kuala_Lumpur')).toBe(false)
})
