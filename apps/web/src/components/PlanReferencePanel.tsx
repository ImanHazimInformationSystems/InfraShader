import { useEffect, useState } from 'react'
import { z } from 'zod'
import type { Project } from '../domain/projects'
import { planInput, planReferenceSchema, type PlanReference } from '../domain/plan-reference'
import { request } from '../services/api'
import { Button } from './ui/button'

type Props = {
  project: Project
  token?: string
  value?: PlanReference | null
  disabled: boolean
  onChange: (p: PlanReference | null) => void
  onImage: (image: { id: string; url: string } | null) => void
  onDirty: (dirty: boolean) => void
}
export default function PlanReferencePanel({
  project,
  token,
  value,
  disabled,
  onChange,
  onImage,
  onDirty,
}: Props) {
  const [draft, setDraft] = useState<PlanReference | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [page, setPage] = useState(1)
  const [source, setSource] = useState('')
  const [rights, setRights] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [image, setImage] = useState<{ id: string; url: string } | null>(null)
  const [pick, setPick] = useState<'point_a' | 'point_b'>('point_a')
  const [retry, setRetry] = useState(0)
  const active = draft ?? value
  const endpoint = `/api/v1/organisations/${project.organisation_id}/projects/${project.id}`
  const evidenceId = active?.evidence_id
  useEffect(() => {
    onDirty(Boolean(draft || file))
  }, [draft, file, onDirty])
  useEffect(() => {
    if (!evidenceId || !token) {
      onImage(null)
      return
    }
    let live = true,
      url: string | null = null
    const abort = new AbortController()
    fetch(`${import.meta.env.VITE_API_BASE_URL ?? ''}${endpoint}/evidence/${evidenceId}/content`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: abort.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            'Reference unavailable or access revoked. Retry after checking your session.',
          )
        const blob = await response.blob()
        if (!live) return
        url = URL.createObjectURL(blob)
        setImage({ id: evidenceId, url })
        onImage({ id: evidenceId, url })
      })
      .catch((reason) => {
        if (live) {
          setError(reason.message)
          onImage(null)
        }
      })
    return () => {
      live = false
      abort.abort()
      if (url) URL.revokeObjectURL(url)
      onImage(null)
    }
  }, [endpoint, evidenceId, token, retry, onImage])
  function edit(patch: Partial<PlanReference>) {
    if (active) setDraft({ ...active, ...patch })
  }
  async function upload() {
    if (!file || !rights || !source.trim()) {
      setError('Choose a file, enter its source and confirm your rights.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (file.size > 10 * 1024 * 1024 || !file.size) throw new Error('Use a file up to 10 MiB.')
      const bytes = await file.arrayBuffer()
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('')
      let raster: Blob = file,
        width: number,
        height: number
      if (file.type === 'application/pdf') {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = (
          await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        ).default
        const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true })
        try {
          const pdf = await task.promise
          if (pdf.numPages > 100 || page < 1 || page > pdf.numPages)
            throw new Error('Select an existing page of a PDF with at most 100 pages.')
          const selected = await pdf.getPage(page)
          const initial = selected.getViewport({ scale: 1 })
          const viewport = selected.getViewport({
            scale: Math.min(2, 3000 / Math.max(initial.width, initial.height)),
          })
          const canvas = document.createElement('canvas')
          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          await selected.render({ canvas, viewport }).promise
          raster = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error('Page rendering failed.'))),
              'image/png',
            ),
          )
          width = canvas.width
          height = canvas.height
        } finally {
          await task.destroy()
        }
      } else {
        if (!['image/png', 'image/jpeg'].includes(file.type))
          throw new Error('Use PNG, JPEG or PDF.')
        const bitmap = await createImageBitmap(file)
        width = bitmap.width
        height = bitmap.height
        if (width * height > 16_000_000 || width > 8192 || height > 8192) {
          bitmap.close()
          throw new Error('Reference exceeds supported pixel dimensions.')
        }
        // Normalise decoded orientation before the server strips image metadata.
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
        bitmap.close()
        raster = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Image conversion failed.'))),
            'image/png',
          ),
        )
      }
      if (width * height > 16_000_000 || width > 8192 || height > 8192)
        throw new Error('Reference exceeds supported pixel dimensions.')
      const form = new FormData()
      form.append('photo', raster, 'reference.png')
      form.append('description', `Reference: ${file.name} page ${page}`)
      form.append('source_note', source)
      form.append('rights_confirmed', 'true')
      const record = await request(`${endpoint}/evidence`, z.object({ id: z.uuid() }), token, {
        method: 'POST',
        body: form,
      })
      const bounds = project.site.bounds
      setDraft({
        evidence_id: record.id,
        source_name: file.name,
        source_sha256: hash,
        page: file.type === 'application/pdf' ? page : 1,
        rights_confirmed: true,
        width,
        height,
        point_a: [0, 0],
        point_b: [width, 0],
        anchor: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2],
        distance_m: 10,
        bearing_deg: 90,
        uncertainty_m: 1,
        source_note: source,
        locked: false,
        visible: true,
        opacity: 0.5,
      })
      setPick('point_a')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Reference upload failed.')
    } finally {
      setBusy(false)
    }
  }
  async function apply() {
    if (!active) return
    setBusy(true)
    setError('')
    try {
      const calibrated = await request(
        `${endpoint}/reference-preview`,
        planReferenceSchema,
        token,
        { method: 'POST', body: JSON.stringify(planInput({ ...active, locked: true })) },
      )
      onChange(calibrated)
      setDraft(null)
      setFile(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Calibration failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="rounded border p-4" open>
      <summary>Existing-plan reference • L05</summary>
      <p>
        Reference only. Verify dimensions on site. PDF processing keeps only the selected rendered
        page; the original file stays on your device. No CAD extraction or survey accuracy is
        claimed.
      </p>
      {error && (
        <p role="alert">
          {error}{' '}
          <Button type="button" onClick={() => setRetry((x) => x + 1)}>
            Retry reference image
          </Button>
        </p>
      )}
      <fieldset disabled={disabled || busy} className="grid gap-3">
        <label>
          Plan PNG / JPEG / PDF (10 MiB maximum)
          <input
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          PDF page
          <input
            type="number"
            min="1"
            max="100"
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
          />
        </label>
        <label>
          Plan source and revision
          <input value={source} onChange={(e) => setSource(e.target.value)} maxLength={1800} />
        </label>
        <label>
          <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />I
          have permission to use this plan.
        </label>
        <Button type="button" onClick={() => void upload()}>
          Upload reference page
        </Button>
        {active && (
          <>
            <p>
              {active.source_name} • page {active.page} • {active.width} × {active.height} pixels
            </p>
            {active.calibration_id && (
              <p>
                Calibration {active.calibration_id.slice(0, 12)} • {active.metric_crs} •{' '}
                {active.metres_per_pixel?.toFixed(4)} m/pixel • declared uncertainty ±
                {active.uncertainty_m} m. This is not an independently measured residual.
              </p>
            )}
            {image?.id === active.evidence_id && (
              <button
                type="button"
                style={{ position: 'relative', display: 'block', padding: 0, border: 0 }}
                aria-label={`Pick calibration ${pick === 'point_a' ? 'point A' : 'point B'}`}
                disabled={active.locked}
                onClick={(e) => {
                  const rect = e.currentTarget.querySelector('img')!.getBoundingClientRect()
                  edit({
                    [pick]: [
                      ((e.clientX - rect.left) / rect.width) * active.width,
                      ((e.clientY - rect.top) / rect.height) * active.height,
                    ],
                  })
                  setPick(pick === 'point_a' ? 'point_b' : 'point_a')
                }}
              >
                <img
                  src={image.url}
                  alt="Private plan calibration preview"
                  style={{ width: '100%', maxHeight: 450, objectFit: 'fill' }}
                />
                {(['point_a', 'point_b'] as const).map((key, index) => (
                  <span
                    key={key}
                    style={{
                      position: 'absolute',
                      left: `${Math.min(96, (active[key][0] / active.width) * 100)}%`,
                      top: `${Math.min(90, (active[key][1] / active.height) * 100)}%`,
                      background: '#123c3a',
                      color: 'white',
                      padding: '2px 6px',
                      pointerEvents: 'none',
                    }}
                  >
                    {index === 0 ? 'A' : 'B'}
                  </span>
                ))}
              </button>
            )}
            {active.locked ? (
              <Button type="button" onClick={() => edit({ locked: false })}>
                Unlock calibration
              </Button>
            ) : (
              <p>
                Click point A, then B on the preview, or enter pixel positions below (origin: top
                left). Confirm the known distance, point A location and direction A → B.
              </p>
            )}
            <fieldset disabled={active.locked} className="grid gap-2 sm:grid-cols-2">
              {(['point_a', 'point_b', 'anchor'] as const).flatMap((key) =>
                ([0, 1] as const).map((axis) => (
                  <label key={`${key}-${axis}`}>
                    {key === 'anchor'
                      ? `Point A ${axis === 0 ? 'longitude' : 'latitude'}`
                      : key === 'point_a'
                        ? `Point A pixel ${axis === 0 ? 'x' : 'y'}`
                        : `Point B pixel ${axis === 0 ? 'x' : 'y'}`}
                    <input
                      type="number"
                      step="any"
                      value={active[key][axis]}
                      onChange={(e) => {
                        const v: [number, number] = [...active[key]]
                        v[axis] = Number(e.target.value)
                        edit({ [key]: v })
                      }}
                    />
                  </label>
                )),
              )}
              {(['distance_m', 'bearing_deg', 'uncertainty_m'] as const).map((key) => (
                <label key={key}>
                  {key === 'distance_m'
                    ? 'Known distance A–B (m)'
                    : key === 'bearing_deg'
                      ? 'Direction A–B (degrees from grid north)'
                      : 'Declared uncertainty (m; not measured residual)'}
                  <input
                    type="number"
                    step="any"
                    value={active[key]}
                    onChange={(e) => edit({ [key]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </fieldset>
            <label>
              Opacity
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={active.opacity}
                onChange={(e) => edit({ opacity: Number(e.target.value) })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={active.visible}
                onChange={(e) => edit({ visible: e.target.checked })}
              />
              Show reference
            </label>
            <Button type="button" onClick={() => void apply()}>
              Apply and lock calibration
            </Button>
            {draft && (
              <Button
                type="button"
                onClick={() => {
                  setDraft(null)
                  setFile(null)
                }}
              >
                Discard unapplied calibration
              </Button>
            )}
            <Button
              type="button"
              onClick={() => {
                setDraft(null)
                setFile(null)
                onChange(null)
              }}
            >
              Remove reference from draft
            </Button>
            <p>
              Apply, then Save workspace to retain calibration and history. Replacement flags linked
              geometry for review; existing geometry is not moved.
            </p>
          </>
        )}
      </fieldset>
    </details>
  )
}
