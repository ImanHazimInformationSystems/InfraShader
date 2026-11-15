import type { BriefScope } from '../domain/projects'

export default function BriefScopeFields({
  scope,
  onChange,
}: {
  scope: BriefScope
  onChange: (scope: BriefScope) => void
}) {
  return (
    <details className="my-4">
      <summary>Agreed scope, assumptions and sources</summary>
      <p>
        Save the scope here before recording acknowledgement. Editing a saved brief makes earlier
        acknowledgements historical; it does not re-confirm the new revision.
      </p>
      {(
        [
          'deliverables',
          'inclusions',
          'exclusions',
          'intended_use',
          'unresolved_questions',
        ] as const
      ).map((key) => (
        <label key={key}>
          Scope {key.replaceAll('_', ' ')}
          <textarea
            maxLength={key === 'intended_use' ? 2000 : 4000}
            rows={2}
            value={scope[key]}
            onChange={(e) => onChange({ ...scope, [key]: e.target.value })}
          />
        </label>
      ))}
      {scope.facts.map((fact, index) => (
        <fieldset key={index}>
          <legend>Brief fact {index + 1}</legend>
          <label>
            Fact {index + 1} statement
            <input
              maxLength={2000}
              value={fact.text}
              onChange={(e) =>
                onChange({
                  ...scope,
                  facts: scope.facts.map((value, i) =>
                    i === index ? { ...value, text: e.target.value } : value,
                  ),
                })
              }
            />
          </label>
          <label>
            Fact {index + 1} supplier / source
            <input
              maxLength={1000}
              value={fact.source}
              onChange={(e) =>
                onChange({
                  ...scope,
                  facts: scope.facts.map((value, i) =>
                    i === index ? { ...value, source: e.target.value } : value,
                  ),
                })
              }
            />
          </label>
          <label>
            Fact {index + 1} certainty
            <select
              aria-label={`Fact ${index + 1} certainty`}
              value={fact.state}
              onChange={(e) =>
                onChange({
                  ...scope,
                  facts: scope.facts.map((value, i) =>
                    i === index ? { ...value, state: e.target.value as typeof fact.state } : value,
                  ),
                })
              }
            >
              <option value="known">Known</option>
              <option value="estimated">Estimated</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <button
            type="button"
            className="button secondary"
            onClick={() => onChange({ ...scope, facts: scope.facts.filter((_, i) => i !== index) })}
          >
            Remove fact {index + 1}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={scope.facts.length >= 30}
        onClick={() =>
          onChange({
            ...scope,
            facts: [...scope.facts, { text: '', source: '', state: 'unknown' }],
          })
        }
      >
        Add sourced brief fact
      </button>
    </details>
  )
}
