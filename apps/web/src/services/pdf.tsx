import { pdf } from '@react-pdf/renderer'
import type { Snapshot } from '../domain/calculations'
import { DeveloperBriefPdf, ContractorProposalPdf } from '../components/IssuedPdf'

export async function renderOutputPdf(
  snapshot: Snapshot,
  id: string,
  kind: 'developer_brief' | 'proposal',
) {
  return pdf(
    kind === 'developer_brief' ? (
      <DeveloperBriefPdf snapshot={snapshot} id={id} />
    ) : (
      <ContractorProposalPdf snapshot={snapshot} id={id} />
    ),
  ).toBlob()
}

export async function downloadIssuedPdf(
  snapshot: Snapshot,
  id: string,
  kind: 'developer_brief' | 'proposal',
) {
  const blob = await renderOutputPdf(snapshot, id, kind)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${kind}-${id}-v${snapshot.version}.pdf`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
