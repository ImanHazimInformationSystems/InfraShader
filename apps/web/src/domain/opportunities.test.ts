import {
  captureOpportunityToken,
  currentSubmissionId,
  forgetOpportunityToken,
  invitationLink,
  submissionLabel,
  type PackageSummary,
} from './opportunities'

const pkg = (version: number, kind: 'submission' | 'withdrawal'): PackageSummary => ({
  id: `p${version}`,
  version,
  kind,
  state: 'received',
  receipt_id: `RCPT-${version}`,
  received_at: '2026-11-15T10:00:00Z',
  reason: '',
  supersedes_id: null,
  package_sha256: 'x',
  pdf_file_id: null,
  package_file_id: null,
})

describe('opportunity labels', () => {
  it('marks only the newest unwithdrawn submission as current', () => {
    const history = [pkg(1, 'submission'), pkg(2, 'submission')]
    expect(currentSubmissionId(history)).toBe('p2')
    expect(submissionLabel(history[0], 'p2')).toBe('Received · superseded')
    expect(submissionLabel(history[1], 'p2')).toBe('Received · current')
    const withdrawn = [...history, pkg(3, 'withdrawal')]
    expect(currentSubmissionId(withdrawn)).toBeNull()
    expect(submissionLabel(withdrawn[2], null)).toBe('Withdrawal recorded')
    expect(submissionLabel(withdrawn[1], null)).toBe('Received · superseded')
  })

  it('keeps the invitation token in the URL fragment and removes it after capture', () => {
    expect(invitationLink('a b', 'http://localhost')).toBe('http://localhost/#opportunity=a%20b')
    window.history.replaceState(null, '', '/#opportunity=secret-token-value')
    expect(captureOpportunityToken()).toBe('secret-token-value')
    expect(window.location.hash).toBe('')
    expect(captureOpportunityToken()).toBe('secret-token-value') // survives sign-in in this tab
    forgetOpportunityToken()
    expect(captureOpportunityToken()).toBe('')
  })
})
