import type { Project } from '../domain/projects'
export default function BriefReadiness({ project }: { project: Project }) {
  const fields = [
    ['Problem', project.problem],
    ['Intended users', project.intended_users],
    ['Desired outcome', project.desired_outcome],
    ['Relevant use times', project.use_periods],
  ]
  return (
    <section
      className="my-4 rounded border border-stone-300 p-4"
      aria-label="Brief readiness and site facts"
    >
      <h2>Brief readiness</h2>
      <p>
        A partial brief can be saved. Complete these fields before issuing an output; saved targets
        and a complete current estimate are also required.
      </p>
      <ul>
        {fields.map(([label, value]) => (
          <li key={label}>
            {label}: {value.trim() ? 'Recorded' : 'Missing - edit brief'}
          </li>
        ))}
      </ul>
      <h3>Site information</h3>
      <p>
        Budget constraint: {project.currency} {project.details?.budget_min ?? 'Unspecified minimum'}{' '}
        to {project.details?.budget ?? 'Unspecified ceiling'}. This does not establish
        affordability.
      </p>
      <p className="whitespace-pre-wrap">
        {project.details?.site_notes || 'No site visit notes recorded.'}
      </p>
      <p className="whitespace-pre-wrap">
        Known facts: {project.details?.known_facts || 'Not recorded'}
      </p>
      <p className="whitespace-pre-wrap">
        Unknown facts to verify: {project.details?.unknown_facts || 'Not recorded'}
      </p>
      <p>
        Brief revision {project.revision}; last saved {project.updated_at}. Source notes are
        supporting evidence and do not establish a survey.
      </p>
    </section>
  )
}
