import { lazy, Suspense, useState } from 'react'
import type { Bounds } from '../domain/projects'
import BoundsForm from './BoundsForm'
import PlaceSearch from './PlaceSearch'
const SiteMap = lazy(() => import('./SiteMap'))

export default function ExploreWorkspace({
  bounds,
  viewport,
  onBounds,
  onViewport,
  onContinue,
  onExit,
}: {
  bounds: Bounds
  viewport?: Bounds
  onBounds: (bounds: Bounds) => void
  onViewport: (bounds: Bounds) => void
  onContinue: () => void
  onExit: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="explore-fullscreen" aria-label="Fullscreen map exploration">
      <Suspense fallback={<p role="status">Loading map…</p>}>
        <SiteMap
          bounds={bounds}
          onViewport={onViewport}
          onSelectionStart={() => setCollapsed(true)}
          onSelect={(value) => {
            onBounds(value)
            setCollapsed(false)
          }}
        />
      </Suspense>
      <div className="explore-toolbar">
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
