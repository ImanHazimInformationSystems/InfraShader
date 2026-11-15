import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, EyeOff, Loader2, MapPin, Sparkles } from 'lucide-react'
import type { Project } from '../domain/projects'
import type { ExamplePreviews } from '../domain/design-preview'
import { api } from '../services/api'
import {
  STUDIO_EXAMPLES,
  examplePreviews,
  installExample,
  listExamples,
  type ExampleIndex,
  type ExampleKind,
} from '../services/examples'
import { ringgit } from '../services/money'
import DesignPlan from './DesignPlan'
import './examples.css'
import './example-set.css'

const HIDDEN_KEY = (org: string, kind: ExampleKind) =>
  `infrashader:example-card-hidden:${org}:${kind}`

function readHidden(org: string, kind: ExampleKind) {
  try {
    return localStorage.getItem(HIDDEN_KEY(org, kind)) === '1'
  } catch {
    return false
  }
}

function writeHidden(org: string, kind: ExampleKind, hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(HIDDEN_KEY(org, kind), '1')
    else localStorage.removeItem(HIDDEN_KEY(org, kind))
  } catch {
    // Browser storage unavailable: the examples simply stay visible.
  }
}

function exampleLabel(marker: Project['example']) {
  if (!marker) return ''
  if (marker === 'review') return 'Example review'
  if (marker === 'studio') return 'Example'
  return `Example ${marker.slice(-1).toUpperCase()}`
}

export function ExampleBadge({ project }: { project: Pick<Project, 'example'> }) {
  if (!project.example) return null
  return (
    <span className="example-badge" title="Built-in example project">
      <Sparkles size={12} aria-hidden="true" /> {exampleLabel(project.example)}
    </span>
  )
}

function useExamples(organisationId: string, token: string) {
  const [index, setIndex] = useState<ExampleIndex | null | undefined>(undefined)
  const [previews, setPreviews] = useState<ExamplePreviews | null>(null)
  useEffect(() => {
    let active = true
    listExamples(organisationId, token)
      .then((value) => active && setIndex(value))
      .catch(() => active && setIndex(null))
    examplePreviews(organisationId, token)
      .then((value) => active && setPreviews(value))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [organisationId, token])
  return { index, setIndex, previews }
}

function HiddenNote({ onShow, text }: { onShow: () => void; text: string }) {
  return (
    <p className="example-card-hidden">
      <BookOpen size={15} aria-hidden="true" /> {text}{' '}
      <button type="button" className="button text compact" onClick={onShow}>
        Show again
      </button>
    </p>
  )
}

/** Design Studio project folder: three example designs for the same park. */
export function StudioExamples({
  organisationId,
  token,
  canCreate,
  onOpen,
}: {
  organisationId: string
  token: string
  canCreate: boolean
  onOpen: (project: Project) => void
}) {
  const { index, setIndex, previews } = useExamples(organisationId, token)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [hidden, setHidden] = useState(() => readHidden(organisationId, 'studio'))
  if (index === undefined) return null
  const installed = Boolean(index && STUDIO_EXAMPLES.every((key) => index[key]))
  if (!installed && !canCreate) return null
  if (hidden)
    return (
      <HiddenNote
        text="Example projects hidden."
        onShow={() => {
          writeHidden(organisationId, 'studio', false)
          setHidden(false)
        }}
      />
    )

  async function open(key: (typeof STUDIO_EXAMPLES)[number]) {
    setBusy(key)
    setError('')
    try {
      const id = index?.[key]
      let project: Project | undefined
      if (id) project = await api.project(organisationId, id, token)
      else {
        const created = await installExample(organisationId, 'studio', token)
        setIndex((current) => ({
          studio_a: created[0]?.id ?? null,
          studio_b: created[1]?.id ?? null,
          studio_c: created[2]?.id ?? null,
          review: current?.review ?? null,
        }))
        project = created.find((item) => item.example === key)
      }
      if (project) onOpen(project)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="example-set" aria-labelledby="studio-examples-title">
      <header className="example-set-head">
        <div>
          <span className="eyebrow">
            <Sparkles size={12} aria-hidden="true" /> Example projects · Shah Alam, Selangor
          </span>
          <h2 id="studio-examples-title">Three ways to design the same park</h2>
          <p>
            Three fictional contractors each designed the same 0.94 ha open field for one residents’
            association. Open any of them to see a finished project: brief, site plan, trees, paths
            and objects, quantities, a full estimate and an issued proposal. The same three
            proposals are compared in Organisation Review.
          </p>
        </div>
        <button
          type="button"
          className="button text compact"
          onClick={() => {
            writeHidden(organisationId, 'studio', true)
            setHidden(true)
          }}
        >
          <EyeOff size={14} aria-hidden="true" /> Hide examples
        </button>
      </header>
      <div className="example-grid">
        {STUDIO_EXAMPLES.map((key) => {
          const preview = previews?.[key]
          const letter = key.slice(-1).toUpperCase()
          return (
            <article className="example-tile" key={key} aria-label={`Example ${letter}`}>
              <div className="example-tile-plan">
                {preview ? (
                  <DesignPlan preview={preview.preview} title={`Example ${letter} plan`} compact />
                ) : (
                  <div className="example-plan-placeholder" aria-hidden="true" />
                )}
                <span className="example-tile-letter">Example {letter}</span>
              </div>
              <div className="example-tile-body">
                <h3>{preview?.title ?? `Example ${letter}`}</h3>
                <p className="example-tile-contractor">{preview?.contractor}</p>
                <p>{preview?.summary}</p>
                {preview && (
                  <dl className="example-tile-facts">
                    <div>
                      <dt>Estimate</dt>
                      <dd>{ringgit(preview.total)}</dd>
                    </div>
                    <div>
                      <dt>Programme</dt>
                      <dd>{Math.round(preview.programme_days / 7)} weeks</dd>
                    </div>
                  </dl>
                )}
                <button
                  type="button"
                  className="button primary"
                  disabled={Boolean(busy)}
                  onClick={() => void open(key)}
                >
                  {busy === key ? (
                    <Loader2 size={16} className="spin" aria-hidden="true" />
                  ) : (
                    <BookOpen size={16} aria-hidden="true" />
                  )}
                  {busy === key && !index?.[key] ? 'Preparing examples…' : `Open Example ${letter}`}
                  {busy !== key && <ArrowRight size={16} aria-hidden="true" />}
                </button>
              </div>
            </article>
          )
        })}
      </div>
      {busy && !installed && (
        <p className="fine-print" role="status">
          Building the three examples through the normal workflow (design, quantities, estimate and
          issue). This takes a few seconds and happens once.
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <p className="fine-print example-set-note">
        <MapPin size={12} aria-hidden="true" /> Real location (3.073° N, 101.511° E), fictional
        client, contractors and rates. Not a survey, a commission or a market quotation.
      </p>
    </section>
  )
}

/** Organisation Review folder: the example review comparing the three example proposals. */
export function ReviewExample({
  organisationId,
  token,
  canCreate,
  onOpen,
}: {
  organisationId: string
  token: string
  canCreate: boolean
  onOpen: (project: Project) => void
}) {
  const { index, setIndex, previews } = useExamples(organisationId, token)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hidden, setHidden] = useState(() => readHidden(organisationId, 'review'))
  if (index === undefined) return null
  if (!index?.review && !canCreate) return null
  if (hidden)
    return (
      <HiddenNote
        text="Example review hidden."
        onShow={() => {
          writeHidden(organisationId, 'review', false)
          setHidden(false)
        }}
      />
    )

  async function open() {
    setBusy(true)
    setError('')
    try {
      const project = index?.review
        ? await api.project(organisationId, index.review, token)
        : (await installExample(organisationId, 'review', token))[0]
      setIndex((current) => (current ? { ...current, review: project.id } : current))
      onOpen(project)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="example-set" aria-labelledby="review-example-title">
      <header className="example-set-head">
        <div>
          <span className="eyebrow">
            <Sparkles size={12} aria-hidden="true" /> Example review · Shah Alam, Selangor
          </span>
          <h2 id="review-example-title">Compare 3 proposals for one park</h2>
          <p>
            A residents’ association received three proposals for the same park. Open the example to
            see the three site plans side by side, compare prices line by line, read the scores and
            then make the recommendation yourself.
          </p>
        </div>
        <button
          type="button"
          className="button text compact"
          onClick={() => {
            writeHidden(organisationId, 'review', true)
            setHidden(true)
          }}
        >
          <EyeOff size={14} aria-hidden="true" /> Hide example
        </button>
      </header>
      <div className="example-review-strip">
        {STUDIO_EXAMPLES.map((key) => {
          const preview = previews?.[key]
          return (
            <div key={key} className="example-review-plan">
              {preview ? (
                <DesignPlan
                  preview={preview.preview}
                  title={`${preview.contractor} plan`}
                  compact
                />
              ) : (
                <div className="example-plan-placeholder" aria-hidden="true" />
              )}
              <strong>{preview?.contractor ?? 'Proposal'}</strong>
              <span>{preview ? ringgit(preview.total) : ''}</span>
            </div>
          )
        })}
      </div>
      <div className="example-card-actions">
        <button
          type="button"
          className="button primary"
          disabled={busy}
          onClick={() => void open()}
        >
          {busy ? (
            <Loader2 size={16} className="spin" aria-hidden="true" />
          ) : (
            <BookOpen size={16} aria-hidden="true" />
          )}
          {busy && !index?.review ? 'Preparing the example…' : 'Open the example review'}
          {!busy && <ArrowRight size={16} aria-hidden="true" />}
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <p className="fine-print">
        Fictional residents’ association and contractors; the designs are the three Design Studio
        examples. Not a real tender.
      </p>
    </section>
  )
}

/** Shown at the top of an open Studio example project. */
export function ExampleBanner({ project, token }: { project: Project; token?: string }) {
  const [previews, setPreviews] = useState<ExamplePreviews | null>(null)
  const marker = project.example
  useEffect(() => {
    if (!marker || marker === 'review' || !token) return
    let active = true
    examplePreviews(project.organisation_id, token)
      .then((value) => active && setPreviews(value))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [marker, project.organisation_id, token])
  if (!marker || marker === 'review') return null
  const preview = marker === 'studio' ? undefined : previews?.[marker]
  return (
    <aside className="example-banner" aria-label="About this example project">
      <div className="example-banner-head">
        <span className="example-banner-icon" aria-hidden="true">
          <Sparkles size={18} />
        </span>
        <div>
          <strong>
            You are in {exampleLabel(marker)}
            {preview ? ` of 3: ${preview.title} by ${preview.contractor}` : ''}.
          </strong>
          <p>
            Explore freely: changes save as normal revisions and never affect other projects. To
            start over, archive it and open the example again from Projects. This design is one of
            the three proposals compared in the Organisation Review example.
          </p>
        </div>
      </div>
      <div className="example-banner-body">
        {preview && (
          <div className="example-banner-plan">
            <DesignPlan preview={preview.preview} title={`${exampleLabel(marker)} site plan`} />
          </div>
        )}
        <ol className="example-tour">
          <li>
            <span className="example-tour-number">1</span>
            <span>
              <strong>Brief and site</strong>This page: problem, users, budget, stakeholders and the
              site outline.
            </span>
          </li>
          <li>
            <span className="example-tour-number">2</span>
            <span>
              <strong>Design</strong>Open the geometry workspace to see the trees, paths, ground
              textures and objects on the level site. Baseline shows the existing trees.
            </span>
          </li>
          <li>
            <span className="example-tour-number">3</span>
            <span>
              <strong>Quantities and estimate</strong>Below the workspace, each estimate line is
              traced to its quantity and example rate
              {preview ? `; the total is ${ringgit(preview.total)}` : ''}.
            </span>
          </li>
          <li>
            <span className="example-tour-number">4</span>
            <span>
              <strong>Proposal</strong>
              {marker === 'studio_a'
                ? 'Issued outputs show proposal v1 (now stale) and v2 after the client’s change request in the change register.'
                : 'Issued outputs hold the proposal sent to the residents’ association.'}
            </span>
          </li>
        </ol>
      </div>
    </aside>
  )
}
