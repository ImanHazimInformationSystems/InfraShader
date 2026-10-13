import { displayQuantity, type DisplayUnits } from '../services/display-units'
import {
  Document,
  Page,
  Text,
  View,
  Svg,
  Polygon,
  Polyline,
  Circle,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'
import type { Snapshot } from '../domain/calculations'

Font.register({ family: 'Noto Sans', src: '/fonts/NotoSans-Regular.ttf' })
const styles = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 60,
    fontFamily: 'Noto Sans',
    fontSize: 10,
    lineHeight: 1.45,
    color: '#18382f',
  },
  title: { fontSize: 22, marginBottom: 10 },
  heading: { fontSize: 13, marginTop: 16, marginBottom: 5 },
  note: { fontSize: 8, color: '#56655d', marginTop: 5 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.4,
    borderBottomColor: '#ccd5cd',
    paddingVertical: 6,
  },
  name: { width: '65%', paddingRight: 12 },
  quantity: { width: '35%' },
  footer: { position: 'absolute', bottom: 25, left: 40, right: 40, fontSize: 8, color: '#56655d' },
})

function Scope({
  title,
  items,
  units,
}: {
  title: string
  items: Snapshot['selected_scope']
  units: DisplayUnits
}) {
  return (
    <View>
      <Text style={styles.heading}>{title}</Text>
      {items.length ? (
        items.map((item) => (
          <View key={item.id} style={styles.row} wrap={false}>
            <View style={styles.name}>
              <Text>
                {item.name} ({item.status})
                {item.manual_basis === 'fixed' ? ' - fixed-price scope' : ''}
              </Text>
              <Text style={styles.note}>
                {item.provenance}: {item.source_note}
              </Text>
            </View>
            <Text style={styles.quantity}>
              {displayQuantity(Number(item.quantity), item.unit, units)}
            </Text>
          </View>
        ))
      ) : (
        <Text>No items recorded.</Text>
      )}
    </View>
  )
}
function SiteVisual({
  snapshot,
  items = [],
  title = 'Site and shared target zones',
}: {
  snapshot: Snapshot
  items?: Snapshot['selected_scope']
  title?: string
}) {
  if (snapshot.site_boundary.type !== 'Polygon') return null
  const ring = snapshot.site_boundary.coordinates[0]
  const xs = ring.map((point) => point[0]),
    ys = ring.map((point) => point[1])
  const west = Math.min(...xs),
    east = Math.max(...xs),
    south = Math.min(...ys),
    north = Math.max(...ys)
  const latitude = (((south + north) / 2) * Math.PI) / 180
  const width = (east - west) * Math.cos(latitude),
    height = north - south
  const scale = Math.min(450 / width, 180 / height)
  const points = (coordinates: number[][]) =>
    coordinates
      .map(
        ([x, y]) => `${10 + (x - west) * Math.cos(latitude) * scale},${10 + (north - y) * scale}`,
      )
      .join(' ')
  return (
    <View wrap={false}>
      <Text style={styles.heading}>{title} · north up</Text>
      <Svg width={470} height={200}>
        <Polygon points={points(ring)} fill="#e5ece0" stroke="#174d3d" strokeWidth={1} />
        {snapshot.targets.map((target, index) =>
          target.geometry.type === 'Polygon' ? (
            <Polygon
              key={index}
              points={points(target.geometry.coordinates[0])}
              fill="#dec990"
              fillOpacity={0.55}
              stroke="#9d7630"
              strokeWidth={1}
            />
          ) : null,
        )}
        {items.map((item) => {
          const geometry = item.geometry
          if (!geometry) return null
          if (geometry.type === 'Polygon')
            return (
              <Polygon
                key={item.id}
                points={points(geometry.coordinates[0])}
                fill="#75a7bd"
                fillOpacity={0.65}
                stroke="#214b60"
                strokeWidth={1}
              />
            )
          if (geometry.type === 'LineString')
            return (
              <Polyline
                key={item.id}
                points={points(geometry.coordinates)}
                stroke="#214b60"
                strokeWidth={2}
              />
            )
          if (geometry.type === 'Point') {
            const [cx, cy] = points([geometry.coordinates]).split(',').map(Number)
            return <Circle key={item.id} cx={cx} cy={cy} r={3} fill="#214b60" />
          }
          return null
        })}
      </Svg>
      <Text style={styles.note}>
        {snapshot.visual_source} Targets: {snapshot.targets.map((target) => target.name).join(', ')}
        .
      </Text>
    </View>
  )
}
function SharedHeader({ snapshot, id }: { snapshot: Snapshot; id: string }) {
  return (
    <>
      {snapshot.draft && <Text style={styles.heading}>DRAFT PREVIEW - NOT ISSUED</Text>}
      <Text style={styles.note}>INFRASHADER · {snapshot.title.toUpperCase()}</Text>
      <Text style={styles.title}>{snapshot.project_name}</Text>
      <Text>
        {snapshot.stakeholder} · Version {snapshot.version} · {snapshot.issued_at}
      </Text>
      <Text style={styles.note}>
        Snapshot {id} · Workspace {snapshot.source_workspace_revision} · Brief{' '}
        {snapshot.source_project_revision}
      </Text>
      <Text style={styles.heading}>Problem and desired outcome</Text>
      <Text>{snapshot.problem}</Text>
      <Text>{snapshot.desired_outcome}</Text>
      <Text style={styles.heading}>People and relevant times</Text>
      <Text>{snapshot.intended_users}</Text>
      <Text>
        {snapshot.use_periods} · {snapshot.timezone}
      </Text>
      <SiteVisual snapshot={snapshot} />
      {snapshot.customer_narrative && (
        <View>
          <Text style={styles.heading}>Scope narrative</Text>
          <Text>{snapshot.customer_narrative}</Text>
        </View>
      )}
      {snapshot.site_evidence.length > 0 && (
        <View>
          <Text style={styles.heading}>Selected site evidence references</Text>
          {snapshot.site_evidence.map((item) => (
            <View key={item.id}>
              <Text>{item.description}</Text>
              <Text>{item.observations}</Text>
              <Text style={styles.note}>
                {item.source_note} · Record {item.id}, revision {item.revision}. Photo retained
                privately in project gallery.
              </Text>
            </View>
          ))}
        </View>
      )}
      {snapshot.brief_details && (
        <>
          <Text style={styles.heading}>Project priorities and constraints</Text>
          <Text>Type: {snapshot.brief_details.project_type || 'Not specified'}</Text>
          <Text>Priorities: {snapshot.brief_details.priorities || 'Not specified'}</Text>
          <Text>Constraints: {snapshot.brief_details.constraints || 'Not specified'}</Text>
          {snapshot.brief_details.site_notes && (
            <Text>Site notes: {snapshot.brief_details.site_notes}</Text>
          )}
          {snapshot.brief_details.known_facts && (
            <Text>Known site facts: {snapshot.brief_details.known_facts}</Text>
          )}
          {snapshot.brief_details.unknown_facts && (
            <Text>Site facts to verify: {snapshot.brief_details.unknown_facts}</Text>
          )}
          {snapshot.brief_details.stakeholders.map((person, index) => (
            <Text key={index}>
              {person.name} ({person.role}): {person.needs}
            </Text>
          ))}
        </>
      )}
    </>
  )
}
function SharedEnd({ snapshot, id }: { snapshot: Snapshot; id: string }) {
  return (
    <>
      <Text style={styles.heading}>Shade limitations</Text>
      <Text>{snapshot.shade.reason}</Text>
      <Text style={styles.heading}>Assumptions</Text>
      <Text>{snapshot.assumptions}</Text>
      <Text style={styles.heading}>Exclusions</Text>
      <Text>{snapshot.exclusions}</Text>
      <Text style={styles.note}>
        {snapshot.draft
          ? 'Draft preview only. No output has been issued. Recheck the current inputs before issuance.'
          : 'Saved issue content is immutable. A new project revision requires a new review and issue. Site verification and commercial review remain necessary.'}
      </Text>
      <Text
        style={styles.footer}
        fixed
        render={({ pageNumber, totalPages }) =>
          `${snapshot.draft ? 'DRAFT - NOT ISSUED' : id} · ${pageNumber} / ${totalPages}`
        }
      />
    </>
  )
}
export function DeveloperBriefPdf({ snapshot, id }: { snapshot: Snapshot; id: string }) {
  return (
    <Document title={`${snapshot.project_name} — Developer decision brief`}>
      <Page size="A4" style={styles.page}>
        <SharedHeader snapshot={snapshot} id={id} />
        <Text style={styles.heading}>Decision criteria</Text>
        {snapshot.criteria?.map((criterion, index) => (
          <Text key={index}>
            {index + 1}. {criterion}
          </Text>
        ))}
        <Scope units={snapshot.display_units} title="Baseline" items={snapshot.baseline} />
        <SiteVisual
          snapshot={snapshot}
          items={snapshot.baseline}
          title="Baseline scope schematic"
        />
        <Scope units={snapshot.display_units} title="Option A" items={snapshot.option_a ?? []} />
        <SiteVisual
          snapshot={snapshot}
          items={snapshot.option_a ?? []}
          title="Option A scope schematic"
        />
        <Scope units={snapshot.display_units} title="Option B" items={snapshot.option_b ?? []} />
        <SiteVisual
          snapshot={snapshot}
          items={snapshot.option_b ?? []}
          title="Option B scope schematic"
        />
        {snapshot.option_budgets && (
          <View>
            <Text style={styles.heading}>Option budget comparison</Text>
            {Object.entries(snapshot.option_budgets).map(([option, budget]) => (
              <Text key={option}>
                {option === 'option_a' ? 'Option A' : 'Option B'}:{' '}
                {budget.status === 'complete'
                  ? `${snapshot.currency} ${budget.total} (indicative)`
                  : `${budget.status} - no complete current budget`}
              </Text>
            ))}
          </View>
        )}
        <Text style={styles.heading}>
          Preferred option: {snapshot.preferred_option === 'option_a' ? 'A' : 'B'}
        </Text>
        <Text>
          Indicative budget: {snapshot.currency} {snapshot.indicative_budget}
        </Text>
        <Text style={styles.heading}>Reviewer notes</Text>
        <Text>{snapshot.review_notes}</Text>
        <Text style={styles.note}>
          Reviewed {snapshot.reviewed_at} by {snapshot.reviewer_id}
        </Text>
        <SharedEnd snapshot={snapshot} id={id} />
      </Page>
    </Document>
  )
}
export function ContractorProposalPdf({ snapshot, id }: { snapshot: Snapshot; id: string }) {
  return (
    <Document title={`${snapshot.project_name} — Contractor client proposal`}>
      <Page size="A4" style={styles.page}>
        <SharedHeader snapshot={snapshot} id={id} />
        <Scope units={snapshot.display_units} title="Existing baseline" items={snapshot.baseline} />
        <SiteVisual
          snapshot={snapshot}
          items={snapshot.baseline}
          title="Baseline scope schematic"
        />
        <SiteVisual
          snapshot={snapshot}
          items={snapshot.selected_scope}
          title="Selected scope schematic"
        />
        <Scope
          units={snapshot.display_units}
          title="Selected scope"
          items={snapshot.selected_scope}
        />
        <Text style={styles.heading}>
          Customer selling price: {snapshot.currency} {snapshot.selling_total}
        </Text>
        <SharedEnd snapshot={snapshot} id={id} />
      </Page>
    </Document>
  )
}
