import { issueGroups, type IssueBlocker } from '../domain/issue-readiness'

export default function IssueChecklist({
  issues,
  pending,
  onFix,
}: {
  issues: IssueBlocker[]
  pending: boolean
  onFix: (issue: IssueBlocker) => void
}) {
  return (
    <section className="issue-checklist" aria-label="Before you can issue" aria-busy={pending}>
      <h3>Before you can issue</h3>
      <p role="status">
        {pending
          ? 'Checking the latest saved information…'
          : issues.length
            ? `${issues.filter((i) => i.severity === 'blocks_issue').length} things to fix. Use each button to go straight to the right place.`
            : 'Ready to issue. All required checks passed for these saved inputs.'}
      </p>
      {issueGroups.map((group) => {
        const rows = issues.filter((i) => i.group === group)
        return rows.length ? (
          <div key={group}>
            <h4>{group}</h4>
            <ul>
              {rows.map((row, index) => (
                <li key={`${row.code}:${row.field}:${row.item_id}:${index}`}>
                  <div>
                    <strong>{row.message}</strong>
                    <p>{row.why}</p>
                  </div>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => onFix(row)}
                    aria-label={`Fix it: ${row.message}`}
                  >
                    Fix it
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null
      })}
    </section>
  )
}
