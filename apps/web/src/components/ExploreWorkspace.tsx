import type { SiteOutline } from '../domain/site-selection'
import { lazy, Suspense, useState } from 'react'
import type { Clock } from '../services/environment'
import type { Bounds } from '../domain/projects'
import BoundsForm from './BoundsForm'
import PlaceSearch from './PlaceSearch'
import ExploreTutorial from './ExploreTutorial'
import type { SiteTree } from '../domain/trees'
const SiteMap = lazy(() => import('./SiteMap'))

export default function ExploreWorkspace({
  bounds,
  outline,
  onOutline,
  viewport,
  onBounds,
  onViewport,
  onContinue,
  onExit,
  onClock,
  trees,
  onTrees,
  onTreeDirty,
}: {
  bounds: Bounds
  outline?: SiteOutline | null
  onOutline: (bounds: Bounds, outline: SiteOutline) => void
  viewport?: Bounds
  onBounds: (bounds: Bounds) => void
  onViewport: (bounds: Bounds) => void
  onContinue: () => void
  onExit: () => void
  onClock?: (clock: Clock) => void
  trees: SiteTree[]
  onTrees: (trees: SiteTree[]) => void
  onTreeDirty: (dirty: boolean) => void
}) {
  const [selecting, setSelecting] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div
      className="explore-fullscreen"
      data-selecting={selecting}
      data-site-controls={collapsed ? 'closed' : 'open'}
      aria-label="Fullscreen map exploration"
    >
      <Suspense fallback={<p role="status">Loading map…</p>}>
        <SiteMap
          bounds={bounds}
          trees={trees}
          onTrees={onTrees}
          onTreeDirty={onTreeDirty}
          outline={outline}
          onClock={onClock}
          onViewport={onViewport}
          onSelectionStart={() => {
            setCollapsed(true)
            setSelecting(true)
          }}
          onSelectionEnd={() => {
            setSelecting(false)
            setCollapsed(false)
          }}
          onSelect={(value, shape) => {
            onOutline(value, shape)
            setCollapsed(false)
          }}
        />
      </Suspense>
      <div className="explore-toolbar">
        <ExploreTutorial />
        <button className="button secondary compact" onClick={onExit}>
          ← Projects
        </button>
        <button
          className="button secondary compact"
          aria-expanded={!collapsed}
          aria-controls="explore-site-controls"
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? 'Show site controls' : 'Hide site controls'}
        </button>
      </div>
      <aside id="explore-site-controls" className="explore-site-controls" hidden={collapsed}>
        <h1>Explore Map</h1>
        <h2>Select a site extent</h2>
        <PlaceSearch onSelect={onBounds} />
        {outline && (
          <p className="notice">
            Custom site outline retained. Applying coordinates, a search result or the current map
            view replaces it with a rectangle.
          </p>
        )}
        <BoundsForm
          key={bounds.join(',')}
          initial={bounds}
          viewport={viewport}
          onApply={onBounds}
        />
        <button className="button primary full" onClick={onContinue}>
          Continue with this site
        </button>
        <p className="fine-print">
          Select a site to start a project. Sun and shadow preview works directly from the map's
          available building data.
        </p>
      </aside>
    </div>
  )
}
