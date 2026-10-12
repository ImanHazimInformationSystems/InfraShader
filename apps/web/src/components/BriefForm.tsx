import { useState, type FormEvent } from 'react'
import { ArrowRight, Building2, ClipboardList } from 'lucide-react'
import { projectInputSchema, type ProjectInput } from '../domain/projects'
type Props = { initial: ProjectInput; saving: boolean; onSave: (input: ProjectInput) => void; onCancel: () => void; onDirty: (dirty: boolean) => void; onDraftChange: (input: ProjectInput) => void; editing?: boolean }
export default function BriefForm({ initial, saving, onSave, onCancel, onDirty, onDraftChange, editing = false }: Props) {
  const [draft, setDraft] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  function change<K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) {
    const next = { ...draft, [key]: value }
    setDraft(next); onDirty(true); onDraftChange(next)
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = projectInputSchema.safeParse(draft)
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]))); return }
    setErrors({}); onSave(parsed.data)
  }
  const contractor = draft.purpose === 'contractor_proposal'
  return <form className="brief-form" onSubmit={submit}><fieldset className="save-fieldset" disabled={saving}>
    <fieldset className="purpose-fieldset"><legend>What are you working towards?</legend><div className="purpose-options">
      <label className={contractor ? 'purpose-card' : 'purpose-card selected'}><input type="radio" name="purpose" value="developer_decision" checked={!contractor} onChange={() => change('purpose', 'developer_decision')} /><Building2 size={22} /><strong>Developer decision</strong><span>Frame a site improvement and support an internal decision.</span></label>
      <label className={contractor ? 'purpose-card selected' : 'purpose-card'}><input type="radio" name="purpose" value="contractor_proposal" checked={contractor} onChange={() => change('purpose', 'contractor_proposal')} /><ClipboardList size={22} /><strong>Contractor proposal</strong><span>Develop an outdoor scope for a client.</span></label>
    </div></fieldset>
    <div className="form-grid"><label>Project name <span className="required">*</span><input autoComplete="off" required maxLength={160} value={draft.name} onChange={(e) => change('name', e.target.value)} placeholder="e.g. Courtyard improvement" aria-invalid={Boolean(errors.name)} />{errors.name && <span className="field-error">{errors.name}</span>}</label>
    <label>{contractor ? 'Client / customer' : 'Internal sponsor'} <span className="required">*</span><input required maxLength={160} value={draft.stakeholder} onChange={(e) => change('stakeholder', e.target.value)} placeholder={contractor ? 'Who is this proposal for?' : 'Who is sponsoring the decision?'} aria-invalid={Boolean(errors.stakeholder)} />{errors.stakeholder && <span className="field-error">{errors.stakeholder}</span>}</label></div>
    <div className="section-divider"><h3>The brief</h3><span>Complete now or return later</span></div>
    <label>What problem should this project address?<textarea rows={3} maxLength={4000} value={draft.problem} onChange={(e) => change('problem', e.target.value)} placeholder="Record the observed problem and what is still unknown." /></label>
    <div className="form-grid"><label>Who will use the space?<textarea rows={2} maxLength={2000} value={draft.intended_users} onChange={(e) => change('intended_users', e.target.value)} placeholder="People, activities and access needs" /></label><label>What outcome are you looking for?<textarea rows={2} maxLength={4000} value={draft.desired_outcome} onChange={(e) => change('desired_outcome', e.target.value)} placeholder="The decision or improvement you want to test" /></label></div>
    <label>Relevant use times<input maxLength={2000} value={draft.use_periods} onChange={(e) => change('use_periods', e.target.value)} placeholder="e.g. Weekdays 12:00–14:00; weekends 09:00–11:00" /><span className="fine-print">These notes do not run a shade analysis.</span>{errors.use_periods && <span className="field-error">{errors.use_periods}</span>}</label>
    <div className="form-grid"><label>Project timezone<input required value={draft.timezone} onChange={(e) => change('timezone', e.target.value)} />{errors.timezone && <span className="field-error">{errors.timezone}</span>}</label><label>Currency<input required maxLength={3} pattern="[A-Z]{3}" value={draft.currency} onChange={(e) => change('currency', e.target.value.toUpperCase())} />{errors.currency && <span className="field-error">{errors.currency}</span>}</label></div>
    <div className="form-actions"><button type="button" className="button secondary" disabled={saving} onClick={onCancel}>Cancel</button><button className="button primary" disabled={saving} type="submit">{saving ? 'Saving…' : editing ? 'Save brief' : 'Create project'}{!saving && <ArrowRight size={17} />}</button></div>
  </fieldset></form>
}
