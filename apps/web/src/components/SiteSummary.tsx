import { useState } from 'react'
import { CircleAlert, CircleCheck, Eye, MapPinned, TreeDeciduous } from 'lucide-react'
import type { WorkspaceData } from '../domain/workspace'

const PROVENANCE_TEXT: Record<string, string> = {
  measured: 'Measured',
  sourced: 'From a supplied source',
  estimated: 'Estimated from the map',
  unknown: 'Unknown',
}

/**
 * Step 1 summary: what is known about the site, how reliable it is and what still needs
 * checking. It only reads saved/draft records and never upgrades an estimate to a survey.
 */
export default function SiteSummary({
  data,
  areaM2,
  onShowExisting,
  onExistingTrees,
  onDesign,
  onMarkArea,
  onPreviewArea,
  onDrawArea,
  disabled,
}: {
  data: WorkspaceData
  areaM2: number | null | undefined
  onShowExisting: () => void
  onExistingTrees: () => void
  onDesign: () => void
  onMarkArea?: () => void
  onPreviewArea?: () => void
  onDrawArea?: () => void
  disabled?: boolean
}) {
  const [confirmArea, setConfirmArea] = useState(false)
  const open = data.constraints.filter((record) => !['verified', 'resolved'].includes(record.status))
  const critical = open.filter((record) => record.critical).length
  const existing = data.scenarios.baseline.items.length
  return (
    <section className="site-summary" aria-label="Site summary">
      <div className="site-summary-area">
        <MapPinned size={22} aria-hidden="true" />
        <div>
          <span className="eyebrow">Your site</span>
          <strong>
            {areaM2 == null ? 'Area not available yet' : `${Math.round(areaM2).toLocaleString()} m²`}
          </strong>
          <small>
            {PROVENANCE_TEXT[data.boundary_provenance] ?? data.boundary_provenance} ·{' '}
            {data.boundary_provenance === 'measured'
              ? 'check the source before construction'
              : 'not a survey; verify before construction'}
          </small>
        </div>
      </div>
      <dl className="site-summary-facts">
        <div>
          <dt>Boundary source</dt>
          <dd>{data.boundary_source}</dd>
        </div>
        <div>
          <dt>Measured in</dt>
          <dd>
            {data.metric_crs
              ? `A local metric grid (${data.metric_crs})`
              : 'Not yet checked: save the design to validate measurements'}
          </dd>
        </div>
        <div>
          <dt>Facts still to check</dt>
          <dd className={critical ? 'is-attention' : undefined}>
            {open.length ? (
              <>
                <CircleAlert size={14} aria-hidden="true" /> {open.length} open
                {critical ? `, ${critical} important` : ''}
              </>
            ) : data.constraints.length ? (
              <>
                <CircleCheck size={14} aria-hidden="true" /> All recorded facts checked
              </>
            ) : (
              'None recorded yet. Add utilities, setbacks, access or soil facts below.'
            )}
          </dd>
        </div>
        <div>
          <dt>Already on site</dt>
          <dd>
            {existing
              ? `${existing} existing item${existing === 1 ? '' : 's'}. Shared by both options and never priced.`
              : 'Nothing recorded yet.'}
          </dd>
        </div>
      </dl>
      <section aria-label="Proposal area">
        <h3>Mark the area this proposal covers</h3>
        <p>The proposal's site plan needs at least one marked area. {data.targets.length ? `${data.targets.length} area(s) marked; save any changes.` : 'No proposal area marked yet.'}</p>
        {data.targets.map(area => <p key={area.id}>{area.name} · {area.provenance}: {area.source_note}</p>)}
        <button type="button" disabled={disabled || data.targets.length >= 20 || !data.metric_crs} onClick={() => { onPreviewArea?.(); setConfirmArea(true) }}>Use the site boundary as the proposal area</button>
        {!data.metric_crs && <p>Save and validate the site boundary before using it as the proposal area.</p>}
        <button type="button" disabled={disabled} onClick={onDrawArea}>Draw a different proposal area</button>
        {confirmArea && <div className="notice" role="group" aria-label="Confirm proposal area">
          <strong>Review the highlighted site outline on the map.</strong>
          <p>This copies the entire current site boundary ({areaM2 == null ? 'area not validated' : `${Math.round(areaM2)} m²`}) into a proposal area. Source: {data.boundary_source}. It will be labelled estimated, not a survey. Only confirm if the whole boundary is the area you intend to propose.</p>
          <button type="button" disabled={disabled} onClick={() => { onMarkArea?.(); setConfirmArea(false) }}>Confirm this proposal area</button>
          <button type="button" onClick={() => setConfirmArea(false)}>Cancel</button>
        </div>}
      </section>
      <div className="site-summary-actions">
        <button type="button" onClick={onShowExisting}>
          <Eye size={15} aria-hidden="true" /> Show existing site
        </button>
        <button type="button" onClick={onExistingTrees}>
          <TreeDeciduous size={15} aria-hidden="true" /> Record existing trees
        </button>
        <button type="button" className="button primary" onClick={onDesign}>
          Next: design the work
        </button>
      </div>
    </section>
  )
}
