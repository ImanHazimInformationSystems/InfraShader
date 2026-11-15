/* global document, URLSearchParams, location, localStorage, alert */
import './src/styles.css'
import './report-preview.css'
import { loadBasemap, mapOptions } from './src/services/map'
import 'mapbox-gl/dist/mapbox-gl.css'
import mapboxgl from 'mapbox-gl'
import workerUrl from 'mapbox-gl/dist/mapbox-gl-csp-worker.js?url'

mapboxgl.workerUrl = workerUrl
const leaf =
  '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 2 17 2c1 2 2 5 2 8a9 9 0 0 1-9 10Z"/><path d="M2 22c0-6 6-10 10-12"/></svg>'
const folder =
  '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 8V5h6l2 3h10v12H3Z"/><path d="M3 12h18"/></svg>'
const mapIcon =
  '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z M9 3v15 M15 6v15"/></svg>'
const root = document.querySelector('#preview')
const review = new URLSearchParams(location.search).get('view') === 'review'
const label = review ? 'Organisation Review' : 'Design Studio'
let current = 'A'
let maps = []
let preferred = localStorage.getItem('infrashader-report-concept-preferred') || 'A'
const options = {
  A: {
    total: 95000,
    paving: 240,
    planting: 180,
    canopy: 60,
    trees: 12,
    cut: 36,
    fill: 48,
    costs: [8400, 28800, 12600, 36000, 9200],
  },
  B: {
    total: 112000,
    paving: 300,
    planting: 210,
    canopy: 80,
    trees: 16,
    cut: 44,
    fill: 58,
    costs: [10000, 36000, 14000, 40000, 12000],
  },
}
const money = (value) => 'RM ' + value.toLocaleString('en-MY')
root.innerHTML = `<div class="app-shell"><aside class="sidebar"><button class="brand" aria-label="InfraShader home"><span class="brand-symbol">${leaf}</span><span>InfraShader<small>OUTDOOR PLANNING</small></span></button><div class="workspace-label">${label.toUpperCase()}</div><nav aria-label="Main navigation"><button class="nav-item">${folder}Projects</button>${review ? '' : `<button class="nav-item">${mapIcon}Explore Map<span style="margin-left:auto">→</span></button>`}<button class="nav-item">Settings and members</button></nav><div class="sidebar-bottom"><div class="sidebar-note">${leaf}<strong>Start with what you know.</strong><p>A site, an observation, a better possibility.</p></div><div class="sidebar-version">Ground-site foundation <span>v0.1</span></div></div></aside><div class="app-main"><header class="topbar"><div class="breadcrumb"><span>Sample organisation</span><span>›</span><strong>${label}</strong></div><div class="topbar-right"><select class="preview-switch" aria-label="Preview workspace"><option value="studio" ${!review ? 'selected' : ''}>Design Studio</option><option value="review" ${review ? 'selected' : ''}>Organisation Review</option></select></div></header><div class="demo-banner"><strong>Proposed UI preview</strong><span>Sample data · Interactive map · Not a saved project or validated estimate</span></div><main class="preview-main"><div class="page-heading"><div><span class="eyebrow">${review ? 'COMPARE & REVIEW' : 'GROUND GEOMETRY & OPTIONS'}</span><h1>${review ? 'Compare design options' : 'Outdoor Comfort Study'}</h1><p>${review ? 'Outdoor Comfort Study · Review the layout, budget and design rationale.' : 'Sample design team · Kuala Lumpur · Proposed outdoor layout'}</p></div><span class="preview-pill">${review ? 'Review concept' : 'Terrain tools: concept only'}</span></div><div id="content"></div><div class="preview-footer">${review ? 'Review preferences are saved only in this browser preview. No formal approval or organisation sharing.' : 'Flat map preview. Terrain markings are illustrative; no land elevation or earthwork calculation is performed.'}</div></main></div></div>`
document.querySelector('.preview-switch').onchange = (event) => {
  location.search = '?view=' + event.target.value
}
document.querySelector('.brand').onclick = () => {
  location.search = '?view=studio'
}
document
  .querySelectorAll('.nav-item')
  .forEach(
    (button) =>
      (button.onclick = () =>
        alert('Report preview only. Use the main InfraShader app for this page.')),
  )
function feature(coords, kind, name) {
  return {
    type: 'Feature',
    properties: { kind, name },
    geometry: { type: 'Polygon', coordinates: [coords.concat([coords[0]])] },
  }
}
function rect(x, y, w, h, kind, name) {
  return feature(
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
    kind,
    name,
  )
}
function layout(option) {
  const b = option === 'B'
  const f = [
    rect(101.6853, 3.1392, 0.0015, 0.0015, 'boundary', 'Selected site'),
    rect(101.6858, 3.1396, b ? 0.00052 : 0.0004, 0.0004, 'target', 'Seating target'),
    rect(101.68635, 3.1395, 0.00025, b ? 0.0009 : 0.0007, 'planting', 'Proposed planting'),
    rect(101.68585, 3.13965, 0.0003, 0.00022, 'canopy', 'Proposed canopy'),
    rect(101.6855, 3.1402, 0.0006, 0.0003, 'grading', 'Illustrative grading zone'),
  ]
  if (b) f.push(rect(101.6861, 3.14015, 0.00024, 0.00018, 'canopy', 'Additional canopy'))
  f.push({
    type: 'Feature',
    properties: { kind: 'path', name: 'Proposed pedestrian route' },
    geometry: {
      type: 'LineString',
      coordinates: [
        [101.68555, 3.13935],
        [101.68565, 3.1398],
        [101.68605, 3.14005],
        [101.6866, 3.1404],
      ],
    },
  })
  for (let i = 0; i < (b ? 8 : 6); i++)
    f.push({
      type: 'Feature',
      properties: { kind: 'tree', name: 'Proposed tree' },
      geometry: { type: 'Point', coordinates: [101.68648, 3.13957 + i * 0.0001] },
    })
  return { type: 'FeatureCollection', features: f }
}
async function addMap(id, option) {
  const { style: s, available } = await loadBasemap()
  const map = new mapboxgl.Map({
    container: id,
    ...mapOptions(available),
    style: s,
    center: [101.68605, 3.13995],
    zoom: 17.5,
    pitch: 0,
    attributionControl: true,
  })
  if (review)
    map.fitBounds(
      [
        [101.6853, 3.1392],
        [101.6868, 3.1407],
      ],
      { padding: 34, duration: 0 },
    )
  maps.push(map)
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
  map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left')
  map.on('load', () => {
    map.addSource('proposal', { type: 'geojson', data: layout(option) })
    map.addLayer({
      id: 'proposal-fill',
      type: 'fill',
      source: 'proposal',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: {
        'fill-color': [
          'match',
          ['get', 'kind'],
          'target',
          '#c79a36',
          'planting',
          '#54835b',
          'canopy',
          '#567d8d',
          'grading',
          '#c59b61',
          '#819676',
        ],
        'fill-opacity': ['match', ['get', 'kind'], 'boundary', 0.08, 0.3],
      },
    })
    map.addLayer({
      id: 'proposal-outline',
      type: 'line',
      source: 'proposal',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: {
        'line-color': [
          'match',
          ['get', 'kind'],
          'target',
          '#b78422',
          'canopy',
          '#426d80',
          'grading',
          '#ad8045',
          '#37654b',
        ],
        'line-width': 2,
        'line-dasharray': [3, 2],
      },
    })
    map.addLayer({
      id: 'proposal-path',
      type: 'line',
      source: 'proposal',
      filter: ['==', ['get', 'kind'], 'path'],
      paint: { 'line-color': '#a68b69', 'line-width': 7 },
    })
    map.addLayer({
      id: 'proposal-trees',
      type: 'circle',
      source: 'proposal',
      filter: ['==', ['get', 'kind'], 'tree'],
      paint: {
        'circle-color': '#648759',
        'circle-radius': 7,
        'circle-stroke-color': '#31593d',
        'circle-stroke-width': 1.5,
      },
    })
    map.on('click', (event) => {
      const hits = map.queryRenderedFeatures(event.point, {
        layers: ['proposal-fill', 'proposal-trees'],
      })
      const hit = hits.find((f) => f.properties.kind !== 'boundary')
      if (hit)
        new mapboxgl.Popup()
          .setLngLat(event.lngLat)
          .setText(hit.properties.name + ' — sample design')
          .addTo(map)
    })
    document.getElementById(id).dataset.ready = 'true'
    if (!Object.keys(s.sources).length) {
      const note = document.createElement('div')
      note.className = 'preview-fallback'
      note.textContent = 'Basemap unavailable. Sample geometry remains interactive.'
      document.getElementById(id).append(note)
    }
  })
  return map
}
const legend =
  '<div class="preview-legend"><span style="--swatch:#e2c477">Target zone</span><span style="--swatch:#8ba783">Planting</span><span style="--swatch:#8eafbb">Canopy</span><span style="--swatch:#d4b48a">Grading concept</span></div>'
function panel() {
  const o = options[current]
  document.querySelector('#quantities').innerHTML = `<h3>Sample quantities</h3>${[
    ['Paving', o.paving + ' m²'],
    ['Planting', o.planting + ' m²'],
    ['Canopy', o.canopy + ' m²'],
    ['Trees', o.trees],
    ['Cut / fill', o.cut + ' / ' + o.fill + ' m³'],
  ]
    .map(([k, v]) => `<div class="preview-row"><span>${k}</span><strong>${v}</strong></div>`)
    .join(
      '',
    )}<p class="preview-note" style="margin:12px 0 18px">Illustrative values, not measured from this drawing. Cut/fill requires a future terrain model.</p><h3>Illustrative estimate</h3>${['Earthworks', 'Paving', 'Planting', 'Canopy', 'Furniture'].map((n, i) => `<div class="preview-row"><span>${n}</span><strong>${money(o.costs[i])}</strong></div>`).join('')}<div class="preview-total"><span>Total</span><span>${money(o.total)}</span></div><button class="button primary full" id="save-layout">Save preview choice</button><div class="preview-status" id="studio-status" role="status">Preview only · No project data is changed</div>`
  document.querySelector('#save-layout').onclick = () => {
    localStorage.setItem('infrashader-report-concept-option', current)
    document.querySelector('#studio-status').textContent =
      'Option ' + current + ' remembered in this browser only.'
  }
}
if (!review) {
  document.querySelector('#content').innerHTML =
    `<div class="preview-tabs"><button class="button secondary" id="baseline">Baseline</button><button class="button primary option" data-option="A">Option A</button><button class="button secondary option" data-option="B">Option B</button></div><div class="preview-grid"><section class="preview-card"><div class="preview-toolbar"><strong style="font-size:12px;margin-right:auto">Site plan / 2D</strong><button class="button secondary compact" id="reset-map">Reset site view</button><button class="button secondary compact" id="layers">Hide proposed layout</button></div><div class="preview-map-wrap"><div class="preview-map" id="studio-map" aria-label="Interactive Design Studio map"></div><div class="preview-terrain"><h3>Terrain shaping</h3><p>Proposed controls · visual preview only</p><div class="tools">${['Raise', 'Lower', 'Smooth', 'Flatten'].map((x, i) => `<button class="button secondary ${i ? '' : 'preview-selected'}" data-terrain="${x}">${x}</button>`).join('')}</div><label>Brush size <span id="brush-value">8 m</span><input id="brush" type="range" min="2" max="20" value="8"></label><p id="terrain-status" style="margin:10px 0 0">Raise selected · no elevation changed</p></div></div>${legend}</section><section class="preview-card"><header><h2>Quantities & estimate</h2></header><div class="preview-panel" id="quantities"></div></section></div>`
  panel()
  addMap('studio-map', 'A')
  document.querySelectorAll('.option').forEach(
    (button) =>
      (button.onclick = () => {
        current = button.dataset.option
        document
          .querySelectorAll('.option')
          .forEach(
            (b) => (b.className = 'button ' + (b === button ? 'primary' : 'secondary') + ' option'),
          )
        document.querySelector('#baseline').className = 'button secondary'
        maps[0]?.getSource('proposal')?.setData(layout(current))
        panel()
      }),
  )
  document.querySelector('#baseline').onclick = (event) => {
    maps[0]?.getSource('proposal')?.setData({
      type: 'FeatureCollection',
      features: layout('A').features.filter((f) => f.properties.kind === 'boundary'),
    })
    event.target.className = 'button primary'
    document.querySelectorAll('.option').forEach((b) => (b.className = 'button secondary option'))
    document.querySelector('#quantities').innerHTML =
      '<h3>Baseline site</h3><p>No proposed work shown. Choose Option A or B to view the illustrative quantities and budget.</p>'
  }
  document.querySelector('#reset-map').onclick = () =>
    maps[0]?.jumpTo({ center: [101.68605, 3.13995], zoom: 17.5 })
  let visible = true
  document.querySelector('#layers').onclick = (event) => {
    visible = !visible
    for (const id of ['proposal-fill', 'proposal-outline', 'proposal-path', 'proposal-trees'])
      if (maps[0]?.getLayer(id))
        maps[0].setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
    event.target.textContent = visible ? 'Hide proposed layout' : 'Show proposed layout'
  }
  document.querySelectorAll('[data-terrain]').forEach(
    (button) =>
      (button.onclick = () => {
        document
          .querySelectorAll('[data-terrain]')
          .forEach((b) => b.classList.toggle('preview-selected', b === button))
        document.querySelector('#terrain-status').textContent =
          button.dataset.terrain + ' selected · no elevation changed'
      }),
  )
  document.querySelector('#brush').oninput = (event) =>
    (document.querySelector('#brush-value').textContent = event.target.value + ' m')
} else {
  document.querySelector('#content').innerHTML = `<div class="preview-review-grid">${['A', 'B']
    .map((key) => {
      const o = options[key]
      return `<section class="preview-card" id="card-${key}"><header><h2>Option ${key} · ${key === 'A' ? 'Compact courtyard' : 'Connected walk'}</h2><span class="preview-pill" id="preferred-${key}"></span></header><div class="preview-map" id="map-${key}" aria-label="Option ${key} interactive map"></div><div class="preview-metrics"><span>Paving<strong>${o.paving} m²</strong></span><span>Planting<strong>${o.planting} m²</strong></span><span>Canopy<strong>${o.canopy} m²</strong></span></div><div class="preview-budget"><div><p class="preview-note" style="margin-bottom:4px">Illustrative estimate</p><strong>${money(o.total)}</strong></div><button class="button secondary compact" data-prefer="${key}">Prefer Option ${key}</button></div></section>`
    })
    .join(
      '',
    )}</div><section class="preview-card preview-review-notes"><div><h2>Review notes</h2><label for="notes" class="preview-note">Design rationale and items to verify</label><textarea id="notes" placeholder="Record your review notes"></textarea></div><div><label>Preferred option<select id="preferred"><option value="A">Option A</option><option value="B">Option B</option></select></label><button class="button primary" id="save-review">Save preview review</button><div class="preview-status" id="review-status" role="status">Draft · Local preview only</div></div></section>`
  addMap('map-A', 'A')
  addMap('map-B', 'B')
  function update() {
    document.querySelector('#preferred').value = preferred
    ;['A', 'B'].forEach((k) => {
      document.querySelector('#preferred-' + k).textContent =
        preferred === k ? 'Preferred option' : 'Alternative'
      document.querySelector('#card-' + k).classList.toggle('preview-preferred', preferred === k)
    })
  }
  update()
  document.querySelector('#notes').value =
    localStorage.getItem('infrashader-report-concept-notes') ??
    'Prefer Option A for its lower initial cost and compact seating layout. Verify drainage, accessible gradients and site measurements before progressing.'
  document.querySelectorAll('[data-prefer]').forEach(
    (b) =>
      (b.onclick = () => {
        preferred = b.dataset.prefer
        update()
        document.querySelector('#review-status').textContent = 'Unsaved preview preference'
      }),
  )
  document.querySelector('#preferred').onchange = (event) => {
    preferred = event.target.value
    update()
    document.querySelector('#review-status').textContent = 'Unsaved preview preference'
  }
  document.querySelector('#save-review').onclick = () => {
    localStorage.setItem('infrashader-report-concept-preferred', preferred)
    localStorage.setItem('infrashader-report-concept-notes', document.querySelector('#notes').value)
    document.querySelector('#review-status').textContent = 'Saved in this browser preview only.'
  }
}
