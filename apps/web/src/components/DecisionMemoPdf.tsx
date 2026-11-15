import { Document, Page, StyleSheet, Text, View, Font } from '@react-pdf/renderer'
import { wholeWords } from '../services/plan-sheet'
import type { DecisionPack } from '../domain/owner-review'
import { READINESS_LABEL } from '../domain/owner-review'

// O17 decision memorandum (renderer infrashader-react-pdf-decision-memo-v1). Rendered only from
// the retained, hash-checked decision-pack.json; it adds no new judgement or computed value.
Font.register({ family: 'Noto Sans', src: '/fonts/NotoSans-Regular.ttf' })
Font.registerHyphenationCallback(wholeWords)
const s = StyleSheet.create({
  page: { padding: 40, paddingBottom: 60, fontFamily: 'Noto Sans', fontSize: 9.5, color: '#2c1f2a' },
  title: { fontSize: 20, marginBottom: 6 },
  heading: { fontSize: 12.5, marginTop: 14, marginBottom: 5, color: '#5b1f37' },
  sub: { fontSize: 10.5, marginTop: 8, marginBottom: 3 },
  note: { fontSize: 7.5, color: '#5f5560', marginTop: 3 },
  head: { flexDirection: 'row', borderBottomWidth: 0.8, borderBottomColor: '#5f5560', paddingVertical: 3, fontSize: 8 },
  row: { flexDirection: 'row', borderBottomWidth: 0.4, borderBottomColor: '#d9d2da', paddingVertical: 3, fontSize: 8 },
  footer: { position: 'absolute', bottom: 25, left: 40, width: 515, fontSize: 7.5, color: '#5f5560' },
})
const short = (id: string) => `${id.slice(0, 8)}…`
const hash = (value: string) => `${value.slice(0, 32)} ${value.slice(32)}`
const at = (iso: string) => `${iso.slice(0, 16).replace('T', ' ')} UTC`

function Table({ widths, head, rows }: { widths: string[]; head: string[]; rows: string[][] }) {
  return (
    <View>
      <View style={s.head} minPresenceAhead={30}>
        {head.map((cell, i) => (
          <Text key={i} style={{ width: widths[i], paddingRight: 4 }}>
            {cell}
          </Text>
        ))}
      </View>
      {rows.map((row, r) => (
        <View key={r} style={s.row} wrap={false}>
          {row.map((cell, i) => (
            <Text key={i} style={{ width: widths[i], paddingRight: 4 }}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

export function DecisionMemoPdf({ pack, packSha256 }: { pack: DecisionPack; packSha256: string }) {
  const { decision, basis, rubric, evaluation } = pack
  const bidder = new Map(pack.submissions.map((sub) => [sub.key, sub.payload.bidder_name]))
  const recommended = bidder.get(decision.recommended_submission) ?? decision.recommended_submission
  const ranked = evaluation.results.filter((r) => r.rank === 1)
  const unresolved = evaluation.results.filter((r) => r.readiness !== 'comparable')
  const openClarifications = pack.clarifications.filter((c) => c.payload.state === 'open')
  return (
    <Document title={`${pack.project.name} — Decision memorandum`}>
      <Page size="A4" style={s.page}>
        <View style={s.footer} fixed>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Decision memorandum · pack SHA-256 ${packSha256.slice(0, 16)}… · ${pageNumber} / ${totalPages}`
            }
          />
        </View>
        <Text style={s.note}>INFRASHADER · ORGANISATION REVIEW · DECISION MEMORANDUM</Text>
        <Text style={s.title}>{pack.project.name}</Text>
        <Text>
          Approved {at(pack.approved_at)} by {short(pack.approved_by)} · comparison basis{' '}
          {basis.payload.title} (revision {basis.revision}) · rubric revision {rubric.revision}
        </Text>

        <Text style={s.heading}>Decision</Text>
        <Text>Recommended and approved offer: {recommended}</Text>
        <Text>
          Ranking position:{' '}
          {ranked.some((r) => r.submission_key === decision.recommended_submission)
            ? `rank 1${ranked.length > 1 ? ' (tie reported, not broken)' : ''}`
            : 'not rank 1 — exception recorded below'}
        </Text>
        <Text style={s.sub}>Recommendation rationale (human)</Text>
        <Text>{decision.rationale}</Text>
        {decision.exception_reason && (
          <>
            <Text style={s.sub}>Exception reason</Text>
            <Text>{decision.exception_reason}</Text>
          </>
        )}
        {decision.decision_reason && (
          <>
            <Text style={s.sub}>Approver reason</Text>
            <Text>{decision.decision_reason}</Text>
          </>
        )}
        <Text style={s.sub}>Signoff history</Text>
        {decision.history.map((h, i) => (
          <Text key={i}>
            {at(h.at)} — {h.action} by {short(h.by)}
            {h.reason ? `: ${h.reason}` : ''}
          </Text>
        ))}

        <Text style={s.heading}>Evaluation basis</Text>
        <Text>
          Currency {basis.payload.currency}, tax {basis.payload.tax_basis}; budget{' '}
          {basis.payload.budget ?? 'not recorded'}; deadline {basis.payload.deadline ?? 'not recorded'};
          self-approval {basis.payload.self_approval}. Missing scores: {rubric.payload.missing_score_rule.replaceAll('_', ' ')};
          reviewer aggregation: {rubric.payload.reviewer_aggregation}; ties: reported only.
        </Text>
        <Text style={s.note}>
          These policy settings were chosen explicitly for this project. They are not an adopted
          organisational procurement policy unless separately approved.
        </Text>
        <Table
          widths={['12%', '40%', '12%', '18%', '18%']}
          head={['Code', 'Criterion', 'Weight', 'Direction', 'Scale / gate']}
          rows={rubric.payload.criteria.map((c) => [
            c.code,
            c.name,
            `${c.weight}%`,
            c.direction.replaceAll('_', ' '),
            `${c.scale_min}–${c.scale_max}${c.mandatory_gate ? `; pass ${c.pass_mark}` : ''}`,
          ])}
        />

        <Text style={s.heading}>Results (official evaluation)</Text>
        <Table
          widths={['22%', '15%', '7%', '11%', '14%', '14%', '17%']}
          head={['Offer', 'Readiness', 'Rank', 'Score', 'Quoted', 'Comparison', 'Reasons']}
          rows={evaluation.results.map((r) => [
            `${r.bidder_name}${r.document_only ? ' (document-only)' : ''}`,
            READINESS_LABEL[r.readiness] ?? r.readiness,
            r.rank != null ? `${r.rank}${r.tie ? ' (tie)' : ''}` : '—',
            r.weighted_score ?? '—',
            r.quoted_total ?? '—',
            r.comparison_total ?? '—',
            r.reasons.join('; ') || '—',
          ])}
        />
        <Text style={s.note}>
          {pack.project.currency}. Comparison totals include recorded comparison-only adjustments.
          Evaluation hash {hash(evaluation.hash)}. Rule: {evaluation.rule}
        </Text>

        <Text style={s.heading}>Reviewer rationale</Text>
        {pack.score_sheets.map((sheet) => (
          <View key={`${sheet.key}-${sheet.revision}`} wrap={false}>
            <Text style={s.sub}>
              {bidder.get(sheet.payload.submission_key) ?? sheet.payload.submission_key} — reviewer{' '}
              {short(sheet.payload.reviewer_id)} · {sheet.payload.state} · package v
              {sheet.payload.package_version} · rubric r{sheet.payload.rubric_revision}
              {sheet.payload.conflict === 'declared' ? ' · CONFLICT DECLARED (recused)' : ''}
            </Text>
            {sheet.payload.scores.map((score) => (
              <Text key={score.criterion}>
                {score.criterion}: {score.score ?? 'no score'} — {score.rationale || 'no rationale'}
              </Text>
            ))}
          </View>
        ))}

        <Text style={s.heading}>Unresolved qualifications and limitations</Text>
        {unresolved.length === 0 && openClarifications.length === 0 && (
          <Text>No offer was outside the comparable state and no clarification remained open.</Text>
        )}
        {unresolved.map((r) => (
          <Text key={r.submission_key}>
            {r.bidder_name}: {READINESS_LABEL[r.readiness] ?? r.readiness}
            {r.reasons.length ? ` — ${r.reasons.join('; ')}` : ''}
          </Text>
        ))}
        {openClarifications.map((c) => (
          <Text key={c.key}>
            Open clarification
            {c.payload.submission_key ? ` (${bidder.get(c.payload.submission_key) ?? 'offer'})` : ' (all offers)'}:{' '}
            {c.payload.question}
          </Text>
        ))}
        {pack.disclosures.map((line, i) => (
          <Text key={i} style={s.note}>
            {line}
          </Text>
        ))}

        <Text style={s.heading}>Source documents and input versions</Text>
        <Table
          widths={['34%', '22%', '10%', '34%']}
          head={['Received document', 'Offer', 'Package', 'SHA-256']}
          rows={pack.source_manifest.map((f) => [
            f.filename,
            f.submission_key ? (bidder.get(f.submission_key) ?? short(f.submission_key)) : '—',
            `v${f.package_version}`,
            hash(f.sha256),
          ])}
        />
        <Text style={s.note}>
          Submissions:{' '}
          {pack.submissions
            .map((sub) => `${sub.payload.bidder_name} package v${sub.payload.package_version} (record r${sub.revision})`)
            .join('; ')}
          . This memorandum is rendered from the retained decision pack (decision-pack.json SHA-256{' '}
          {hash(packSha256)}); the pack and its CSV appendix remain the authoritative record.
        </Text>
      </Page>
    </Document>
  )
}
