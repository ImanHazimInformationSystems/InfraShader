import { RESPONSIBILITY_LABEL, type MaintenanceTask } from '../domain/calculations'
import { incompleteTasks } from '../services/plan-sheet'

const blank = (): MaintenanceTask => ({
  task: '',
  responsibility: 'to_be_agreed',
  frequency: '',
  included_in_price: false,
  assumptions: '',
})

/** L22 CORE: issuer-supplied maintenance responsibilities/frequencies/assumptions. Nothing is
 * suggested automatically; every row is typed by the issuer and labelled as supplied. */
export default function MaintenanceChecklist({
  tasks,
  onChange,
  disabled,
}: {
  tasks: MaintenanceTask[]
  onChange: (tasks: MaintenanceTask[]) => void
  disabled?: boolean
}) {
  const update = (index: number, patch: Partial<MaintenanceTask>) =>
    onChange(tasks.map((task, i) => (i === index ? { ...task, ...patch } : task)))
  return (
    <fieldset className="maintenance-checklist">
      <legend>Maintenance checklist (optional, supplied by you)</legend>
      <p className="field-hint">
        Each row states who is responsible, how often and whether it is in this price. InfraShader
        does not recommend maintenance; the issued PDF labels these as your stated assumptions.
      </p>
      {tasks.map((task, index) => (
        <div className="maintenance-row" key={index} role="group" aria-label={`Maintenance task ${index + 1}`}>
          <label>
            Task
            <input
              maxLength={300}
              value={task.task}
              disabled={disabled}
              onChange={(event) => update(index, { task: event.target.value })}
            />
          </label>
          <label>
            Responsibility
            <select
              aria-label="Responsibility"
              value={task.responsibility}
              disabled={disabled}
              onChange={(event) =>
                update(index, { responsibility: event.target.value as MaintenanceTask['responsibility'] })
              }
            >
              {Object.entries(RESPONSIBILITY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Frequency
            <input
              maxLength={120}
              placeholder="e.g. Monthly; after storms"
              value={task.frequency}
              disabled={disabled}
              onChange={(event) => update(index, { frequency: event.target.value })}
            />
          </label>
          <label className="maintenance-included">
            <input
              type="checkbox"
              checked={task.included_in_price}
              disabled={disabled}
              onChange={(event) => update(index, { included_in_price: event.target.checked })}
            />
            Included in this price
          </label>
          <label className="maintenance-assumptions">
            Task assumptions
            <input
              maxLength={1000}
              value={task.assumptions}
              disabled={disabled}
              onChange={(event) => update(index, { assumptions: event.target.value })}
            />
          </label>
          <button
            type="button"
            className="button secondary"
            disabled={disabled}
            onClick={() => onChange(tasks.filter((_, i) => i !== index))}
          >
            Remove task {index + 1}
          </button>
        </div>
      ))}
      {incompleteTasks(tasks) > 0 && (
        <p className="field-hint" role="status">
          Complete the task and frequency for each row, or remove it, before previewing or issuing.
        </p>
      )}
      <button
        type="button"
        className="button secondary"
        disabled={disabled || tasks.length >= 30}
        onClick={() => onChange([...tasks, blank()])}
      >
        Add maintenance task
      </button>
    </fieldset>
  )
}
