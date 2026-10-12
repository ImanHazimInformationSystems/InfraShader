# Implemented stack and boundaries

Exact dependencies are pinned by `package-lock.json` and `apps/api/uv.lock`.

| Area | Runtime/library | Actual use |
|---|---|---|
| Web | React 19.3, TypeScript 5.9, Vite 8.3 | Session, projects, geometry, calculations, review and downloads |
| UI | Tailwind 4.3, editable shadcn-style Radix/CVA button, Lucide | Workspace layouts and controls; existing semantic CSS tokens retained |
| Maps | MapLibre 6.13, Terra Draw 1.37, adapter 1.5 | Site canvas, polygon/line/point drawing; numeric alternative |
| Validation | Zod 4.6 / Pydantic | Runtime API contracts / authoritative server validation |
| API | Python 3.12.15, FastAPI, Uvicorn, uv | Versioned API and bounded calculations |
| Database | PostgreSQL 17.11, PostGIS 3.6.2, SQLAlchemy 2, Psycopg 3, Alembic | Real persistence, spatial envelope, revisions, append-only artifacts |
| Geometry | Shapely 2, PyProj 3 | Validation, local UTM, quantities, clipping/unions |
| Solar | pvlib 0.16 | NREL solar position; restricted flat-ground opaque projection |
| Money | Decimal, PostgreSQL NUMERIC | Rate versions, rounding, markup/margin and charges |
| PDF | @react-pdf/renderer 4.9, Noto Sans (OFL) | Distinct browser PDFs from approved immutable snapshots |
| Identity/files | Supabase JS 2.117, CLI 2.120, asymmetric JWT/JWKS, private Storage adapter | Code/configuration present; real local verification awaits restart |
| Uploads | Pillow, python-multipart, httpx | PNG/JPEG decoding, EXIF/GPS removal, private server proxy |
| Checks | ESLint 10, Vitest 5, Playwright 1.64, Ruff, pytest, pypdf | Unit, real DB, browser and PDF checks |
| Containers | Docker Desktop 4.94 / Docker 29.8; WSL 2.7.13 | Installed with approval; Windows reports restart required |

GeoPandas/OSMnx/pybdshadow are optional candidates. Three.js/Blender/IfcOpenShell/ezdxf belong to independently gated F13/F18–F20; AI/reference overlays remain F16/F17 gates. They are not represented by nonfunctional controls or unused dependencies.

No hosted project, paid resource, remote write or deployment was created. Basemap/search provider remains unresolved; there are no silent public tile/geocoder calls.

Font: [Noto Sans upstream](https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf/NotoSans); bundled licence at `apps/web/public/fonts/OFL.txt`. Broader-script glyph coverage still needs acceptance testing.
