import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import {
  blocksIssue,
  issueButtonDisabled,
  issueError,
  issueErrors,
  issueGroups,
} from './issue-readiness'
import IssueChecklist from '../components/IssueChecklist'

describe('server issue checklist', () => {
  it.each(Object.keys(issueErrors))('turns %s into a plain message and a fix', (code) => {
    const issue = issueError(code)
    expect(issue.message).not.toContain(code)
    expect(issue.fix).toBeTruthy()
    expect(blocksIssue([issue])).toBe(true)
  })
  it('groups every blocker, including more than ten, without hiding any', () => {
    const issues = Object.keys(issueErrors).map((code, i) => ({
      ...issueError(code),
      group: issueGroups[i % issueGroups.length],
    }))
    const html = renderToStaticMarkup(
      createElement(IssueChecklist, { issues, pending: false, onFix: () => {} }),
    )
    for (const group of issueGroups) expect(html).toContain(`<h4>${group}</h4>`)
    expect(html.match(/>Fix it<\/button>/g)?.length).toBe(issues.length)
  })
  it('permits issue only with no blocking rows; warnings alone do not block', () => {
    expect(blocksIssue([])).toBe(false)
    expect(blocksIssue([{ ...issueError('price_review'), severity: 'warning' }])).toBe(false)
    expect(blocksIssue([issueError('brief_incomplete')])).toBe(true)
  })
  it('disables issue while checking, dirty, busy or blocked and enables a ready form', () => {
    expect(issueButtonDisabled([], false, false)).toBe(false)
    expect(issueButtonDisabled([], true, false)).toBe(true)
    expect(issueButtonDisabled([], false, true)).toBe(true)
    expect(issueButtonDisabled([issueError('stale_brief')], false, false)).toBe(true)
  })
  it('has safe retry guidance for an unknown refusal', () => {
    expect(issueError('private_server_detail').message).not.toContain('private_server_detail')
    expect(issueError('private_server_detail').fix).toBe('refresh')
  })
})
