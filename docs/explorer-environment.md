# Explorer day/night and simulated weather

Implemented locally on 17–18 October 2026. This extends Explore Map only. No new
dependency, paid service, model download, weather API, database migration or deployment.
The existing map component remains lazy-loaded; the environment code ships in that chunk.

## Try it

Start Docker, then use the usual two terminals from the repository root:

```powershell
.\scripts\local-db.ps1 start
.\scripts\supabase.ps1 start
.\scripts\api.ps1 migrate
.\scripts\api.ps1 dev
```

```powershell
npm run dev
```

Open http://127.0.0.1:5173, sign in (or use the separate Browser Demo), and open
Explore Map. Search for Universiti Teknologi PETRONAS, or use a small extent around
100.958 longitude / 4.386 latitude. Internet access supplies public map tiles/search;
the local API supplies solar positions and ground-shadow previews.

1. Hide site controls, zoom to building level and choose Explore in 3D.
2. Set 17 October 2026, UTC offset +8. Compare 09:00, 12:00, Sunset, and 00:00.
3. Play time at the labelled speed; crossing midnight advances the date. Now converts
   the current instant into the selected offset, independently of browser timezone.
4. Open Environment. Try Clear, Partly Cloudy, Overcast, Light Rain, Heavy Rain, Storm.
5. Advanced controls change cloud coverage, rain intensity, wind strength and wind
   direction. Direction is where the visual wind travels, clockwise from north.
6. Pause weather animation, turn effects off, or select Low/Medium/High quality.
7. Under Preview data & limits, enable sun-path dots. At an early morning time with
   the sun just above the horizon, Face sun direction tilts/rotates toward it. The sun
   may be outside the camera view at high elevations; the direction indicator remains.
8. Continue with this site. Its extent is retained and the selected time is carried
   into the new brief's editable Relevant use times text. Confirm saved project analysis
   settings separately; existing projects/results are never silently overwritten.

## Model, rendering and state

- One explorer clock owns local date/minute/explicit UTC offset. Preferences are
  ephemeral component state; no new persisted environment schema or credentials.
- `POST /api/v1/explore/solar-day` returns exactly 1,441 minute samples, including
  the following midnight, for one local date and location. It uses the same pvlib
  NREL/geometric-elevation model and altitude assumption as the shadow endpoint.
- Solar sample coordinates and shadow coordinates both use the map centre in WGS84
  longitude/latitude order. Pan/zoom invalidates old solar context. Camera rotation
  changes the screen projection, not geographic sun azimuth.
- Daylight means geometric elevation >=0 degrees; civil twilight is -6 to 0;
  Night is below -6. The existing ground-shadow model requires elevation >=5 degrees.
  Below the horizon it reports No direct sunlight, never 100% useful shade.
- Sunrise/set shortcuts use the -0.833-degree standard approximate horizon convention,
  sampled to one minute. Solar noon is the day's interior maximum elevation to one
  minute. Missing events are disabled and described; no polar sunrise/set is invented.
  These are not observed terrain-aware rise/set predictions or DST inference.
- Sun/path are directional sky indicators projected through the current bearing,
  pitch, vertical FOV and aspect. Disc is hidden below the horizon/behind the camera.
  They are not building-occlusion, ephemeris stars or roof-shading simulations.
- Native MapLibre sky/light and map-layer colours communicate time in 2D and 3D;
  labels and selected-site edges stay readable at night. Installed MapLibre 6 uses
  map-anchored light azimuth clockwise from north and polar angle from zenith.
- `weather-layer.ts` is a custom shared-WebGL2 layer: one triangle, bounded procedural
  cloud noise and 1/2/3 rain strata for Low/Medium/High. Pixel ratio is capped at 2.
  Clouds use camera rays and a visual horizontal plane; wind rotates with the map.
  Rain is camera-relative, not roof-aware precipitation. No external textures/assets.
- Shader state restores the shared vertex array, program, buffer, depth and blend
  settings. Resources/listeners are removed on unmount/style replacement; context
  restoration reinstalls the effect. Unsupported GPU rendering reports a fallback.
- MapLibre owns repaint scheduling. Weather pauses while hidden, paused, or reduced
  motion is requested. It repaints again on visibility/control/camera changes.
  Reduced motion also disables automatic timeline playback. Lightning/audio omitted.
- Shadow geometry is debounced 450 ms, cancelled on superseding input and hidden
  immediately when stale. Requests have a 15-second timeout. Solar data is requested
  once per changed day/offset/location, not per rendered frame. Old responses cannot
  update an obsolete clock. Weather changes send no analytical/project writes.
- Reload map rendering reuses the selected provider style and reinstalls environment,
  selected-site and preview layers. It is rendering recovery, not a provider SLA.

## Scientific and operational limits

Simulated weather is neither observation nor forecast. Intensity/wind strength are
visual 0–100 scales, not mm/hour or physical wind speed. Weather does not correct
geometric shade coverage or change quantities, prices, estimates or decisions.
No thermal, drainage/flood, wind-load, structural or electrical conclusions follow.

Existing preview limits remain: loaded provider data only, estimated heights, up to
500 parts/10,000 vertices/128 vertices per ring and 1,000 m heights. Courtyards,
trees, terrain and roof/facade occlusion remain excluded. Field validation is open.
Physical low-end laptop/mobile, long-duration GPU soak and full assistive-technology
acceptance remain separate checks. E08 live weather is not implemented or required.

## Verification entry points

```powershell
npm run lint
npm run typecheck
npm test
npm run build
.\scripts\api.ps1 lint
.\scripts\api.ps1 test -q
node node_modules/@playwright/test/cli.js test --config playwright.environment.config.mjs
node node_modules/@playwright/test/cli.js test --config playwright.environment-foundation.config.mjs
```

The new environment suite owns separate ports 8001/5174 so it can run alongside the
usual development API. It uses real local solar/shadow calculations and public tiles;
some failure/race checks deliberately delay or reject network responses. It does not
claim Supabase account or saved-project acceptance. Screenshots and frame profiles
are written under ignored `artifacts/environment-*`. See validation.md for results.

Official references: [MapLibre sky](https://maplibre.org/maplibre-gl-js/docs/examples/sky-fog-terrain/),
[custom layers](https://maplibre.org/maplibre-gl-js/docs/API/interfaces/CustomLayerInterface/),
[light](https://maplibre.org/maplibre-style-spec/light/),
[pvlib solar positions](https://pvlib-python.readthedocs.io/en/latest/reference/solarposition.html).
Installed type declarations/source and existing locked packages were checked for
compatibility. Three.js was unnecessary for this bounded visual effect.


## L02 maintenance checkpoint ? 4 November 2026

Failed map styles can now be retried without losing selected coordinates or explorer date/time. Full map reconstruction resets transient view/weather controls. Preview data & limits distinguishes loaded parts, supported provider heights, unknown heights, unsupported geometry/heights and capacity omissions; these are loaded tile counts, not complete surveyed building coverage. Numeric site selection remains available without WebGL. Mobile site controls suppress the floating environment readout while open. Existing project geometry is preserved when exploration starts a separate project.

Scope remains KEEP: approved provider switching and further weather realism are deferred. See [verification evidence](tracking/evidence/l02-2026-11-04.md) and the canonical [L02 specification](features/L02.md).
