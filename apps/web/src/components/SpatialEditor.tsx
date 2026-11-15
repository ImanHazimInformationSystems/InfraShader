import { useState } from 'react'
import {
  workspaceDataSchema,
  workspaceInput,
  type WorkspaceData,
  type ScenarioKey,
} from '../domain/workspace'
import { request } from '../services/api'
import { Button } from './ui/button'

type Props = {
  data: WorkspaceData
  scenario: ScenarioKey
  endpoint: string
  token?: string
  revision: number
  storageKey: string
  disabled: boolean
  onChange: (data: WorkspaceData) => void
  onWorking: (busy: boolean) => void
  selection: string[]
  setSelection: (ids: string[]) => void
  onSelect: (id: string) => void
}
const operations = {
  move: 'Move',
  snap_grid: 'Snap to a grid',
  fix_dimensions: 'Keep current size',
  release_dimensions: 'Allow size changes',
  rotate: 'Rotate',
  resize: 'Resize',
  duplicate: 'Duplicate',
  align_x: 'Align left to right',
  align_y: 'Align bottom to top',
  distribute_x: 'Space evenly left to right',
  distribute_y: 'Space evenly bottom to top',
  group: 'Add to a group',
  layer: 'Add to a layer',
  lock: 'Lock items',
  unlock: 'Unlock items',
  hide: 'Hide items',
  show: 'Show items',
  delete: 'Delete items',
  cutout: 'Cut one area out of another',
  merge: 'Join areas or paths',
  split: 'Split an area or path',
} as const
const operationHelp: Record<keyof typeof operations, string> = {
  move: 'Move the selected items across the site.',
  snap_grid: 'Line up item centres to a regular metric grid.',
  fix_dimensions: 'Keep the current width and depth when moving items.',
  release_dimensions: 'Allow the selected items to change size or angle.',
  rotate: 'Turn selected items around their shared centre.',
  resize: 'Set the selected item’s width and depth.',
  duplicate: 'Make copies at regular east and north offsets.',
  align_x: 'Line up item centres with the leftmost item.',
  align_y: 'Line up item centres with the bottommost item.',
  distribute_x: 'Space item centres evenly from left to right.',
  distribute_y: 'Space item centres evenly from bottom to top.',
  group: 'Give the selected items a shared group name.',
  layer: 'Give the selected items a shared layer name.',
  lock: 'Prevent accidental edits to the selected items.',
  unlock: 'Allow edits to the selected items again.',
  hide: 'Hide selected items from the map. They still count in quantities.',
  show: 'Show selected items on the map again.',
  delete: 'Remove selected items from this draft. You can undo before saving.',
  cutout: 'Use the second selected area to make a hole in the first.',
  merge: 'Join connected areas or paths that use compatible settings.',
  split: 'Divide an area or path with a straight cut.',
}
export default function SpatialEditor({
  data,
  scenario,
  endpoint,
  token,
  revision,
  storageKey,
  disabled,
  onChange,
  onWorking,
  onSelect,
  selection,
  setSelection,
}: Props) {
  const [savedSelections, setSavedSelections] = useState<Record<string, string[]>>(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
      return Object.fromEntries(
        Object.entries(raw).filter(
          ([name, ids]) =>
            name.length <= 80 &&
            Array.isArray(ids) &&
            ids.length <= 150 &&
            ids.every((id) => typeof id === 'string'),
        ),
      )
    } catch {
      return {}
    }
  })
  const [operation, setOperation] = useState<keyof typeof operations>('move')
  const [east, setEast] = useState('0'),
    [north, setNorth] = useState('0')
  const [angle, setAngle] = useState('0'),
    [width, setWidth] = useState('10'),
    [depth, setDepth] = useState('10')
  const [copies, setCopies] = useState('1'),
    [label, setLabel] = useState('')
  const [grid, setGrid] = useState('1')
  const [impact, setImpact] = useState<{ name: string; before: string; after: string }[]>([])
  const [search, setSearch] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const items = data.scenarios[scenario].items
  const selected = selection.filter((id) => items.some((i) => i.id === id))
  function remember(remove = false) {
    if (!label.trim()) {
      setError('Enter a selection name.')
      return
    }
    const next = { ...savedSelections }
    if (remove) delete next[label.trim()]
    else next[label.trim()] = selected
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
      setSavedSelections(next)
      setError('')
    } catch {
      setError('Browser storage unavailable. Current selection is retained in this tab.')
    }
  }
  async function apply() {
    if (disabled || !selected.length) return
    if (
      operation === 'delete' &&
      !window.confirm(
        `Delete ${selected.length} selected item(s)? Workspace undo is available before saving.`,
      )
    )
      return
    setError('')
    setNotice('')
    onWorking(true)
    try {
      const numbers = [east, north, angle, width, depth, copies, grid]
      if (numbers.some((v) => !v.trim() || !Number.isFinite(Number(v))))
        throw new Error('Enter finite numeric dimensions and offsets.')
      const result = await request(endpoint, workspaceDataSchema, token, {
        method: 'POST',
        body: JSON.stringify({
          workspace: workspaceInput(data, revision),
          scenario,
          ids: selected,
          operation,
          east_m: Number(east),
          north_m: Number(north),
          angle_deg: Number(angle),
          width_m: Number(width),
          depth_m: Number(depth),
          copies: Number(copies),
          grid_m: Number(grid),
          label,
        }),
      })
      const nextItems = result.scenarios[scenario].items
      const oldItems = data.scenarios[scenario].items
      const quantity = (item: (typeof oldItems)[number] | undefined) =>
        !item
          ? 'Removed / absent'
          : item.quantity
            ? `${item.quantity.value.toFixed(3)} ${item.quantity.calculated.unit}${item.quantity.is_override ? ' (override retained)' : ''}`
            : 'Not previously validated'
      setImpact(
        [
          ...new Set([
            ...selected,
            ...nextItems.filter((i) => !oldItems.some((old) => old.id === i.id)).map((i) => i.id),
          ]),
        ].map((id) => {
          const before = oldItems.find((i) => i.id === id),
            after = nextItems.find((i) => i.id === id)
          return {
            name: after?.name ?? before?.name ?? id,
            before: quantity(before),
            after: quantity(after),
          }
        }),
      )
      onChange(result)
      setNotice(
        'Validated operation applied as one undo step. Quantities recalculated; save a revision before pricing or issuing.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed; previous draft retained.')
    } finally {
      onWorking(false)
    }
  }
  return (
    <details className="spatial-editor" open>
      <summary className="spatial-editor-summary">
        <span className="spatial-editor-title">Select and edit items</span>
        <span className="sr-only">Spatial editing tools</span>
        <span className="spatial-editor-subtitle">Changes stay in your draft until you save.</span>
      </summary>
      <div className="spatial-editor-content">
        <section className="spatial-editor-card" aria-labelledby="spatial-select-heading">
          <div className="spatial-editor-card-heading">
            <div>
              <h4 id="spatial-select-heading">1. Choose items</h4>
              <p>Select items on the map or find them here.</p>
            </div>
            <span className="spatial-selection-count" aria-live="polite">
              {selected.length} selected
            </span>
          </div>
          <label className="spatial-field">
            Find items
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, type or group"
            />
          </label>
          <div className="spatial-selection-actions">
            <Button
              variant="outline"
              onClick={() =>
                setSelection(
                  items
                    .filter((i) =>
                      `${i.name} ${i.category} ${i.editor_group ?? ''}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((i) => i.id),
                )
              }
            >
              Select all matches
            </Button>
            <Button variant="outline" disabled={!selected.length} onClick={() => setSelection([])}>
              Clear
            </Button>
          </div>
          <div className="spatial-item-list" aria-label="Spatial selection">
            {items
              .filter((i) =>
                `${i.name} ${i.category} ${i.editor_group ?? ''}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((item) => (
                <div key={item.id} className="flex items-center gap-2 border-b py-1">
                  <label
                    className="flex-1"
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      style={{ width: 'auto', flexShrink: 0 }}
                      checked={selected.includes(item.id)}
                      onChange={(e) =>
                        setSelection(
                          e.target.checked
                            ? [...selected, item.id]
                            : selected.filter((id) => id !== item.id),
                        )
                      }
                    />{' '}
                    Select {item.name}{' '}
                    {item.editor_locked || item.object_instance?.locked ? '(locked)' : ''}
                  </label>
                  <Button variant="outline" onClick={() => onSelect(item.id)}>
                    View
                  </Button>
                </div>
              ))}
            {items.length === 0 && <p className="spatial-empty">No items in this option yet.</p>}
            {items.length > 0 &&
              !items.some((i) =>
                `${i.name} ${i.category} ${i.editor_group ?? ''}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              ) && <p className="spatial-empty">No items match that search.</p>}
          </div>
          {selected.length > 0 && (
            <div className="spatial-selected-preview">
              <strong>Selected items</strong>
              <span>
                {selected
                  .map((id) => items.find((item) => item.id === id)?.name)
                  .filter(Boolean)
                  .slice(0, 3)
                  .join(', ')}
                {selected.length > 3 ? ` and ${selected.length - 3} more` : ''}
              </span>
            </div>
          )}
          <details className="spatial-saved-selections">
            <summary>Save and reuse a selection</summary>
            <p>Saved only in this browser for this account, project and option.</p>
            <label className="spatial-field">
              Selection name
              <input
                maxLength={80}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Seating area"
              />
            </label>
            <div className="spatial-selection-actions">
              <Button variant="outline" disabled={!selected.length} onClick={() => remember()}>
                Save selection
              </Button>
              <Button variant="outline" onClick={() => remember(true)}>
                Forget saved selection
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  setSelection(
                    items.filter((i) => i.editor_group === label && label !== '').map((i) => i.id),
                  )
                }
              >
                Select this group
              </Button>
            </div>
            <label className="spatial-field">
              Saved selection
              <select
                aria-label="Saved selection"
                value=""
                onChange={(e) => {
                  setSelection(savedSelections[e.target.value] ?? [])
                  setLabel(e.target.value)
                }}
              >
                <option value="">Choose a saved selection</option>
                {Object.keys(savedSelections).map((key) => (
                  <option key={key}>{key}</option>
                ))}
              </select>
            </label>
          </details>
        </section>
        <fieldset className="spatial-editor-card spatial-action-card" disabled={disabled}>
          <legend>2. Choose an action</legend>
          <label className="spatial-field">
            Choose an action
            <select
              aria-label="Spatial operation"
              value={operation}
              onChange={(e) => setOperation(e.target.value as keyof typeof operations)}
            >
              <optgroup label="Move and arrange">
                {(['move', 'rotate', 'resize', 'duplicate', 'align_x', 'align_y', 'distribute_x', 'distribute_y', 'snap_grid'] as const).map((key) => <option key={key} value={key}>{operations[key]}</option>)}
              </optgroup>
              <optgroup label="Organise and show">
                {(['group', 'layer', 'lock', 'unlock', 'hide', 'show'] as const).map((key) => <option key={key} value={key}>{operations[key]}</option>)}
              </optgroup>
              <optgroup label="Change shape">
                {(['fix_dimensions', 'release_dimensions', 'cutout', 'merge', 'split', 'delete'] as const).map((key) => <option key={key} value={key}>{operations[key]}</option>)}
              </optgroup>
            </select>
          </label>
          <p className="spatial-action-help">{operationHelp[operation]}</p>
          {operation === 'group' && (
            <label className="spatial-field">
              Group name
              <input
                maxLength={80}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Seating area"
              />
            </label>
          )}
          {operation === 'layer' && (
            <label className="spatial-field">
              Layer name
              <input
                maxLength={80}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. North garden"
              />
            </label>
          )}
          {['move', 'duplicate', 'split'].includes(operation) && (
            <div className="grid grid-cols-2 gap-2">
              <label>
                East offset (m)
                <input type="number" value={east} onChange={(e) => setEast(e.target.value)} />
              </label>
              <label>
                North offset (m)
                <input type="number" value={north} onChange={(e) => setNorth(e.target.value)} />
              </label>
            </div>
          )}
          {['rotate', 'split'].includes(operation) && (
            <label>
              Clockwise angle (degrees)
              <input type="number" value={angle} onChange={(e) => setAngle(e.target.value)} />
            </label>
          )}
          {operation === 'resize' && (
            <div className="grid grid-cols-2 gap-2">
              <label>
                Grid width (m)
                <input
                  type="number"
                  min="0.001"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                />
              </label>
              <label>
                Grid depth (m)
                <input
                  type="number"
                  min="0.001"
                  value={depth}
                  onChange={(e) => setDepth(e.target.value)}
                />
              </label>
            </div>
          )}
          {operation === 'fix_dimensions' && (
            <p className="spatial-caution">
              Size is held within a 1 mm software tolerance. This does not indicate survey accuracy.
            </p>
          )}
          {operation === 'release_dimensions' && (
            <p className="spatial-caution">
              Releasing this setting allows later edits to change the item’s size or angle.
            </p>
          )}
          {operation === 'snap_grid' && (
            <label>
              Metric grid spacing (m)
              <input
                type="number"
                min="0.001"
                max="100"
                value={grid}
                onChange={(e) => setGrid(e.target.value)}
              />
            </label>
          )}
          {operation === 'duplicate' && (
            <label>
              Number of additional copies
              <input
                type="number"
                min="1"
                max="30"
                value={copies}
                onChange={(e) => setCopies(e.target.value)}
              />
            </label>
          )}
          {operation === 'cutout' && (
            <p>
              Select the outer area first, then the inner area. The inner item is consumed; the
              first item keeps its ID and rate. No bound plant/material schedules or overrides.
            </p>
          )}
          {operation === 'split' && (
            <p>
              Cut through the selection centre plus offsets. At 0° the cutting line runs east–west.
              Parts receive new IDs. Bound plant/material schedules must be removed first.
            </p>
          )}
          <Button
            className="spatial-apply-button"
            disabled={!selected.length}
            aria-label="Apply spatial operation"
            onClick={() => void apply()}
          >
            Apply changes to draft
          </Button>
        </fieldset>
      </div>
      {impact.length > 0 && (
        <details className="spatial-impact">
          <summary>See quantity changes</summary>
          <p>
            Comparison when the change was made. Later edits or undo may change these values.
          </p>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Before</th>
                <th>After operation</th>
              </tr>
            </thead>
            <tbody>
              {impact.map((row, index) => (
                <tr key={index}>
                  <td>{row.name}</td>
                  <td>{row.before}</td>
                  <td>{row.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {error && <p className="spatial-feedback spatial-feedback-error" role="alert">{error}</p>}
      {notice && <p className="spatial-feedback spatial-feedback-success" role="status">{notice}</p>}
    </details>
  )
}
