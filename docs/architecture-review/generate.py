"""Rebuild the local, dependency-free architecture review diagrams."""
from pathlib import Path
from html import escape
import re

ROOT = Path(__file__).parent
INK, GREEN, LINE = '#173b35', '#24705e', '#c9d8d2'

def begin(title, subtitle, height):
    return [f'''<svg xmlns="http://www.w3.org/2000/svg" width="1560" height="{height}" viewBox="0 0 1560 {height}" role="img" aria-labelledby="title desc">
<title id="title">{escape(title)}</title><desc id="desc">{escape(subtitle)}</desc>
<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9" fill="#24705e"/></marker></defs>
<style>text{{font-family:Segoe UI,Arial,sans-serif;fill:{INK}}}.title{{font-size:35px;font-weight:700}}.sub{{font-size:18px;fill:#536c65}}.head{{font-size:23px;font-weight:650}}.body{{font-size:18px}}.small{{font-size:16px;fill:#536c65}}.tag{{font-size:15px;font-weight:700;letter-spacing:1px;fill:#24705e}}</style>
<rect width="1560" height="{height}" fill="#f5f8f5"/>
<text class="tag" x="40" y="38">INFRASHADER / ARCHITECTURE REVIEW / 21 OCTOBER 2026</text>
<text class="title" x="40" y="84">{escape(title)}</text>
<text class="sub" x="40" y="117">{escape(subtitle)}</text>''']

def box(s,x,y,w,h,title,lines,fill='#ffffff',tag=None):
    s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{fill}" stroke="{LINE}"/>')
    yy=y+30
    if tag:
        s.append(f'<text class="tag" x="{x+22}" y="{yy}">{escape(tag)}</text>'); yy+=33
    s.append(f'<text class="head" x="{x+22}" y="{yy}">{escape(title)}</text>')
    for i,line in enumerate(lines):
        s.append(f'<text class="body" x="{x+22}" y="{yy+32+i*27}">{escape(line)}</text>')

def arrow(s,points,label=None,x=0,y=0):
    s.append(f'<polyline points="{points}" fill="none" stroke="{GREEN}" stroke-width="2.4" marker-end="url(#arrow)"/>')
    if label:s.append(f'<text class="small" x="{x}" y="{y}">{escape(label)}</text>')

def save(name,s):
    (ROOT/name).write_text('\n'.join(s)+ '\n</svg>',encoding='utf-8')

s=begin('Layered N-tier architecture', 'AS BUILT: three core runtime tiers, five logical responsibility layers, plus supporting services.',1290)
box(s,40,155,1050,165,'L1  Presentation and client adapters',[
    'React / TypeScript / React Router / Zod - Design Studio and Organisation Review',
    'MapLibre + Terra Draw + WebGL2 weather; API client; Supabase session client',
    'Browser PDF rendering from issued snapshots; separate Demo and scoped draft recovery'],tag='TIER 1  |  USER BROWSER')
s.append('<rect x="28" y="368" width="1074" height="552" rx="18" fill="#e9f1ee" stroke="#9dbbad" stroke-dasharray="8 5"/>')
arrow(s,'565,320 565,385','JSON / bearer JWT; multipart photos; responses return to browser',590,355)
box(s,40,385,1050,125,'L2  API and request boundary',[
    'FastAPI / Uvicorn - /api/v1, Pydantic contracts, CORS, body limits, errors and request IDs',
    'JWT verification at protected entry points; public bounded Explore endpoints are an exception'],tag=None)
s.append('<text class="tag" x="55" y="360">TIER 2  |  ONE PYTHON API PROCESS</text>')
arrow(s,'565,510 565,550')
box(s,40,550,630,180,'L3  Application workflows',[
    'Projects, workspace revisions, catalogue, estimates, reviews',
    'Organisation onboarding, invitations, project grants',
    'Evidence lifecycle and audience-filtered issue snapshots',
    'Active membership + capabilities + project access'])
box(s,690,550,400,180,'L3  Domain calculations',[
    'Geometry: Shapely / PyProj',
    'Solar and flat-ground shade: pvlib',
    'Pricing and rounding: Decimal',
    'Authoritative server computations'])
arrow(s,'670,640 690,640')
arrow(s,'565,730 565,770')
box(s,40,770,1050,125,'L4  Persistence and integration adapters',[
    'SQLAlchemy sessions / ORM + Psycopg; transaction locks and compare-and-swap revisions',
    'HTTPX private Storage proxy + Pillow sanitisation; JWKS/current-account Auth integration'])
arrow(s,'565,895 565,980','SQL to application DB / server-authorised HTTP to private Storage',590,949)
box(s,40,980,1050,180,'L5  Persistent application data and private files',[
    'PostgreSQL / PostGIS: business records, JSONB geometry, indexed WGS84 site envelopes',
    'NUMERIC rates; project/workspace history; artifacts and issued snapshot payloads',
    'Supabase private evidence bucket: photo bytes; metadata and SHA-256 remain in app DB'],tag='TIER 3  |  DATA AND FILE SERVICES')
box(s,1160,155,360,165,'Public map providers',[
    'OpenFreeMap style / tiles',
    'Photon explicit place search',
    'Direct browser HTTPS requests'],fill='#edf3fa')
arrow(s,'1090,210 1160,210','A',1119,198)
box(s,1160,385,360,210,'Local Supabase Auth',[
    'Browser login / refresh / recovery',
    'API fetches trusted JWKS',
    'Current verified-email lookup',
    'Own internal identity database'],fill='#edf3fa')
arrow(s,'1090,280 1124,280 1124,420 1160,420','B',1101,273)
arrow(s,'1090,475 1160,475','C',1119,463)
box(s,1160,635,360,260,'Cross-cutting controls',[
    'Tenant and project isolation',
    'No implicit admin bypass',
    'Server-only Storage secret',
    'Stale / partial / unavailable states',
    'Audit events and request IDs',
    'Tests, locks and migrations'],fill='#edf3fa')
box(s,1160,980,360,180,'Outside current runtime',[
    'Cross-organisation exchange',
    'Inbox / scoring / formal approvals',
    'Queue workers and live weather',
    'Gated BIM / AI / terrain features'],fill='#fff3e4')
s.append('<text class="small" x="40" y="1205">Arrows show request / call direction; responses return on the same connection. A: map data. B: identity. C: server trust lookup.</text>')
s.append('<text class="small" x="40" y="1235">Layering is a responsibility map, not five deployed services: workflow modules currently also contain ORM and adapter calls.</text>')
save('infrashader-layered-architecture.svg',s)

s=begin('Local deployment and trust boundaries','Configured development topology on one Windows PC. Port labels are configuration, not a live-service health claim.',1100)
box(s,40,160,430,160,'User browser',[
    'React application executes here',
    'Direct Auth + public map requests',
    'No business SQL or Storage secret'],tag='CLIENT EXECUTION')
box(s,580,160,460,160,'Vite development server',[
    '127.0.0.1:5173 - serves frontend assets',
    '/api dev proxy to FastAPI when used',
    'Production hosting is not deployed'],tag='WINDOWS HOST')
arrow(s,'470,225 580,225','Assets',492,212)
box(s,580,405,460,185,'FastAPI / Uvicorn',[
    '127.0.0.1:8000 - Python 3.12',
    'Application + domain + adapters',
    'JWT and project permissions',
    'Calculations execute in API requests'],tag='WINDOWS HOST')
arrow(s,'255,320 255,470 580,470','Protected API + public Explore requests',65,365)
arrow(s,'810,320 810,405','Optional /api proxy',830,365)
box(s,580,720,460,185,'Application PostgreSQL / PostGIS',[
    '127.0.0.1:54322 - business database',
    'Memberships, projects, revisions, artifacts',
    'Evidence metadata; separate test database',
    'Alembic 0001-0011'],tag='WINDOWS HOST / LOCAL DATABASE')
arrow(s,'810,590 810,720','Psycopg / SQL',830,659)
s.append('<rect x="1090" y="145" width="440" height="800" rx="18" fill="#edf3fa" stroke="#aac1d6"/>')
s.append('<text class="tag" x="1110" y="180">DOCKER DESKTOP / WSL 2 LINUX</text>')
box(s,1110,220,400,150,'Supabase gateway :54331',[
    'Auth endpoints + trusted JWKS',
    'Private Storage API / evidence bucket',
    'Not the application business API'])
box(s,1110,415,400,145,'Supabase internal database',[
    '127.0.0.1:54332',
    'Auth / Storage service state',
    'Separate from app DB :54322'])
arrow(s,'1310,370 1310,415')
box(s,1110,615,400,145,'Private file persistence',[
    'Supabase-managed local file storage',
    'Photo bytes, accessed through API',
    'Not a retained-PDF archive'])
arrow(s,'1510,300 1520,300 1520,680 1510,680')
box(s,1110,800,400,120,'Local operator tools',[
    'Studio :54333; local mail UI :54334',
    'Development / recovery tools only'])
arrow(s,'1040,460 1070,460 1070,295 1110,295','Auth / files',940,390)
arrow(s,'255,160 255,137 1540,137 1540,255 1510,255','Browser Auth client',560,133)
box(s,40,720,430,185,'External public services',[
    'OpenFreeMap and Photon via HTTPS',
    'Requested directly by the browser',
    'Offline coordinate fallback exists',
    'No paid provider or cloud deployment'],fill='#fff3e4')
arrow(s,'160,320 160,720','Map / search',55,650)
s.append('<text class="small" x="40" y="1000">Core tiers: browser presentation / Python application / persistent data. Supporting Auth and file services have their own runtime.</text>')
s.append('<text class="small" x="40" y="1030">Local HTTP is loopback development traffic. A future hosted design requires explicit TLS, ingress, secrets and operational planning.</text>')
save('infrashader-local-deployment.svg',s)

# A self-contained HTML document: no network fonts, scripts or diagram renderer.
def inline(value):
    value = escape(value)
    value = re.sub(r'`([^`]+)`', r'<code>\1</code>', value)
    value = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', value)
    return re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', value)

lines = (ROOT/'README.md').read_text(encoding='utf-8').splitlines()
body = []
i = 0
while i < len(lines):
    line = lines[i]
    if not line.strip():
        i += 1
        continue
    if line.startswith('|'):
        rows = []
        while i < len(lines) and lines[i].startswith('|'):
            cells = [c.strip() for c in lines[i].strip('|').split('|')]
            if not all(re.fullmatch(r'[-: ]+', c) for c in cells): rows.append(cells)
            i += 1
        body.append('<div class="table-wrap"><table>')
        for n,row in enumerate(rows):
            tag = 'th' if n == 0 else 'td'
            body.append('<tr>' + ''.join(f'<{tag}>{inline(c)}</{tag}>' for c in row) + '</tr>')
        body.append('</table></div>')
        continue
    if line.startswith('#'):
        level = len(line)-len(line.lstrip('#'))
        body.append(f'<h{level}>{inline(line[level:].strip())}</h{level}>')
    elif line.startswith('- ') or re.match(r'^\d+\. ', line):
        ordered = not line.startswith('- ')
        tag = 'ol' if ordered else 'ul'
        body.append(f'<{tag}>')
        while i < len(lines) and (re.match(r'^\d+\. ',lines[i]) if ordered else lines[i].startswith('- ')):
            body.append('<li>' + inline(re.sub(r'^(?:- |\d+\. )','',lines[i])) + '</li>')
            i += 1
        body.append(f'</{tag}>')
        continue
    else:
        body.append('<p>'+inline(line)+'</p>')
    i += 1
diagrams = ''.join('<section class="diagram">'+(ROOT/name).read_text(encoding='utf-8')+'</section>' for name in ['infrashader-layered-architecture.svg','infrashader-local-deployment.svg'])
html = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>InfraShader - Layered N-tier Architecture Review</title><style>
*{box-sizing:border-box}body{margin:0;background:#f1f5f2;color:#173b35;font:16px/1.65 "Segoe UI",Arial,sans-serif}header{padding:18px 4%;background:#173b35;color:white;display:flex;gap:24px;flex-wrap:wrap;align-items:center}header a{color:white}header strong{margin-right:auto}main{max-width:1440px;margin:auto;padding:30px 24px}.intro{max-width:900px;margin:0 0 25px}.diagram{background:white;border:1px solid #cad9d0;border-radius:15px;overflow:hidden;margin:0 0 30px}.diagram svg{display:block;width:100%;height:auto}.notes{background:white;padding:35px 45px;border:1px solid #cad9d0;border-radius:15px}h1{font-size:30px;line-height:1.25}h2{margin-top:36px;font-size:24px;line-height:1.3;border-bottom:1px solid #d9e4dd;padding-bottom:10px}p,li{max-width:1120px}li{margin:8px 0}a{color:#176650}code{font-size:.9em;background:#edf3ef;padding:2px 4px;overflow-wrap:anywhere}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:12px;text-align:left;vertical-align:top;border-bottom:1px solid #d9e4dd}th{background:#edf3ef}button{font:inherit;color:#173b35;background:white;border:0;border-radius:5px;padding:6px 16px;cursor:pointer}@media(max-width:700px){main{padding:15px 10px}.notes{padding:22px 18px}.diagram{overflow:auto}.diagram svg{min-width:1050px}}@media print{@page{size:A3 landscape;margin:12mm}header,.intro{display:none}body{background:white}main{padding:0;max-width:none}.diagram{border:0;break-after:page;margin:0}.diagram svg{width:100%;max-height:260mm}.notes{border:0;padding:0}h2{break-after:avoid}tr{break-inside:avoid}a{color:inherit}code{background:none}}
</style></head><body><header><strong>InfraShader / architecture review v1.0</strong><a href="README.md">Detailed source document</a><a href="infrashader-layered-architecture.svg">Layered SVG</a><a href="infrashader-local-deployment.svg">Deployment SVG</a><button onclick="window.print()">Print review</button></header><main><p class="intro"><strong>For review - 21 October 2026.</strong> The diagrams describe the current local implementation. Logical layers, runtime tiers and supporting services are separated deliberately. The source mapping, trust boundaries and future exclusions follow below.</p>'''+diagrams+'<article class="notes">'+''.join(body)+'</article></main></body></html>'
(ROOT/'REVIEW.html').write_text(html,encoding='utf-8')
