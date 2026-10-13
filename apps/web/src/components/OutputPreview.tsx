import { useEffect, useState } from 'react'
import type { Snapshot } from '../domain/calculations'
import { Button } from './ui/button'

export default function OutputPreview({
  snapshot,
  kind,
  onClose,
}: {
  snapshot: Snapshot
  kind: 'developer_brief' | 'proposal'
  onClose: () => void
}) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    let objectUrl = ''
    import('../services/pdf')
      .then(({ renderOutputPdf }) => renderOutputPdf(snapshot, 'DRAFT', kind))
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Preview could not be generated.')
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [snapshot, kind])
  return (
    <section
      aria-label="Draft output preview"
      className="my-4 rounded-lg border border-stone-300 p-4"
    >
      <h3>Draft PDF preview</h3>
      <p>
        Not issued or saved. This preview uses the inputs at the time you requested it. Generate it
        again after changing inputs; issuance rechecks current revisions.
      </p>
      <Button variant="outline" onClick={onClose}>
        Close preview
      </Button>
      {error && <p role="alert">{error}</p>}
      {!url && !error && <p role="status">Generating draft PDF...</p>}
      {url && (
        <>
          <p>
            <a href={url} download={`draft-${kind}.pdf`}>
              Download draft PDF
            </a>
          </p>
          <iframe title="Draft PDF preview" src={url} className="mt-4 h-[600px] w-full" />
        </>
      )}
    </section>
  )
}
