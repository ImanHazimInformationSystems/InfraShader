import { useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  MapPin,
  Scan,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import './explore-tutorial.css'

const steps = [
  {
    title: 'Find your place',
    icon: MapPin,
    body: 'Search for a place in the site controls and choose a result. Drag the map to move around, then zoom in until you can see your site clearly.',
    tip: 'Controls hidden? Choose “Show site controls”. If search is unavailable, enter coordinates instead.',
    label: 'Find a location',
  },
  {
    title: 'Mark your site',
    icon: Scan,
    body: 'Choose ?Select site on map? to open the shape controls. Pick Rectangle or Ellipse, or choose Custom polygon and click each corner, then Finish polygon.',
    tip: 'Drag the centre to move and the round arrow to rotate. Use handles or numeric controls to resize. Undo reverses changes; Cancel keeps the previous site.',
    label: 'Shape, move and rotate',
  },
  {
    title: 'Check the selected area',
    icon: SlidersHorizontal,
    body: 'The site controls reopen after selection. Check the west, south, east and north coordinates. If you edit them, choose “Apply coordinates”.',
    tip: 'You can also choose “Use current map view”. This is a project locator, not a surveyed boundary. Sun and shadow previews depend on available map data.',
    label: 'Review your extent',
  },
  {
    title: 'Start your project',
    icon: Check,
    body: 'When the extent looks right, choose “Continue with this site”. On the next page, enter your project name and brief, then create the project.',
    tip: 'Reading this guide does not select a site or save a project. You can reopen Tips / tutorial at any time on this map.',
    label: 'Continue to the brief',
  },
]

export default function ExploreTutorial() {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [step, setStep] = useState(0)
  const current = steps[step]
  const Icon = current.icon
  return (
    <>
      <button
        ref={trigger}
        className="button secondary compact explore-tutorial-trigger"
        onClick={() => {
          setStep(0)
          dialog.current?.showModal()
        }}
        aria-haspopup="dialog"
      >
        <BookOpen size={16} aria-hidden="true" /> Tips / tutorial
      </button>
      <dialog
        ref={dialog}
        className="explore-tutorial"
        aria-labelledby="explore-tutorial-title"
        onClose={() => trigger.current?.focus()}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return
          const buttons =
            event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
          const first = buttons[0]
          const last = buttons[buttons.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }}
      >
        <header>
          <span>
            <BookOpen size={16} aria-hidden="true" /> SITE SELECTION GUIDE
          </span>
          <button
            className="tutorial-close"
            aria-label="Close tutorial"
            onClick={() => dialog.current?.close()}
            autoFocus
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="tutorial-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
          {steps.map((item, index) => (
            <span key={item.title} className={index <= step ? 'reached' : ''} />
          ))}
        </div>
        <div className="tutorial-step" key={step}>
          <div className={`tutorial-illustration tutorial-scene-${step}`} aria-hidden="true">
            <div className="tutorial-site-outline">
              <span className="tutorial-corner first">1</span>
              <span className="tutorial-corner second">2</span>
              <Icon size={38} strokeWidth={1.5} />
            </div>
            <span className="tutorial-map-caption">{current.label}</span>
          </div>
          <div className="tutorial-copy" aria-live="polite" aria-atomic="true">
            <span className="eyebrow">
              Step {step + 1} of {steps.length}
            </span>
            <h2 id="explore-tutorial-title">{current.title}</h2>
            <p>{current.body}</p>
            <div className="tutorial-tip">{current.tip}</div>
          </div>
        </div>
        <footer>
          <button className="button text" onClick={() => dialog.current?.close()}>
            Skip guide
          </button>
          <div>
            <button
              className="button secondary"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft size={15} aria-hidden="true" /> Back
            </button>
            <button
              className="button primary"
              onClick={() =>
                step === steps.length - 1 ? dialog.current?.close() : setStep(step + 1)
              }
            >
              {step === steps.length - 1 ? 'Start exploring' : 'Next'}
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        </footer>
      </dialog>
    </>
  )
}
