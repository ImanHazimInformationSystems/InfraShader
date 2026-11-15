import type { ReactNode } from 'react'
import { ClipboardCheck, FileStack, FolderOpen, Scale } from 'lucide-react'
import './review-layout.css'

/** In Organisation Review the comparison leads; brief, map and settings fold away below it. */
export function ReviewProjectDetails({
  collapse,
  children,
}: {
  collapse: boolean
  children: ReactNode
}) {
  if (!collapse) return <>{children}</>
  return (
    <details className="review-project-details">
      <summary>
        <span>Project details, site and settings</span>
        <small>
          Brief, site outline, history and access. You rarely need these while comparing.
        </small>
      </summary>
      <div className="review-project-details-body">{children}</div>
    </details>
  )
}

/** Explains how the review folder is organised, for people new to procurement. */
export function ReviewFolderIntro() {
  return (
    <section className="review-folder-intro" aria-label="How Organisation Review works">
      <div className="review-folder-intro-head">
        <span className="eyebrow">How this works</span>
        <h2>One review per thing you are buying</h2>
        <p>
          Each review below is one project, for example “upgrade the neighbourhood park”. Inside it
          you collect the proposals contractors sent you and compare them fairly before anyone
          decides. Open a review to see all of its proposals side by side.
        </p>
      </div>
      <ol className="review-folder-steps">
        <li>
          <FolderOpen size={18} aria-hidden="true" />
          <strong>1. Open a review</strong>
          <span>One card = one project you are choosing a contractor for.</span>
        </li>
        <li>
          <FileStack size={18} aria-hidden="true" />
          <strong>2. See every proposal</strong>
          <span>Site plans, prices and what is included, side by side.</span>
        </li>
        <li>
          <Scale size={18} aria-hidden="true" />
          <strong>3. Score them fairly</strong>
          <span>Against rules you set before looking at prices.</span>
        </li>
        <li>
          <ClipboardCheck size={18} aria-hidden="true" />
          <strong>4. Recommend and approve</strong>
          <span>Record the decision and its reasons in a decision pack.</span>
        </li>
      </ol>
    </section>
  )
}

/**
 * Design Studio project page: the brief agreement, change register, history and access are
 * kept in one disclosure below the site so the main action (open the design map) comes first.
 * Outside Design Studio the children render unchanged.
 */
export function ProjectRecords({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  if (!enabled) return <>{children}</>
  return (
    <details className="review-project-details project-records">
      <summary>
        <span>Brief agreement, changes, history and access</span>
        <small>
          Client acknowledgement, change requests after an issue, earlier brief versions, sharing
          and templates.
        </small>
      </summary>
      <div className="review-project-details-body">{children}</div>
    </details>
  )
}
