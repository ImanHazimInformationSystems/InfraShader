"""Author/reproduce the bounded MIT project primitive palette. No external assets.

Coordinates: metres, X east, Y up, Z south. Pivot: ground-centre (0,0,0).
The repository LICENSE covers this script and its generated original asset data.
"""
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
WOOD='#986b42';METAL='#52616a';GREEN='#4c8354';BLUE='#315f86'
def part(size,pos,color=WOOD,shape='box'):
    return dict(shape=shape,size=size,position=pos,color=color)
def box(w,h,d,x=0,y=None,z=0,color=WOOD):return part([w,h,d],[x,h/2 if y is None else y,z],color)
def cylinder(w,h,d,x=0,y=None,z=0,color=METAL):return part([w,h,d],[x,h/2 if y is None else y,z],color,'cylinder')
def sphere(w,h,d,x=0,y=None,z=0,color=GREEN):return part([w,h,d],[x,h/2 if y is None else y,z],color,'sphere')
definitions=[
 ('bench','Benches','Park bench','item',[box(1.8,.12,.55,y=.48),box(1.8,.45,.1,y=.78,z=.23),box(.12,.42,.48,x=-.65,color=METAL),box(.12,.42,.48,x=.65,color=METAL)]),
 ('bin','Bins','Litter bin','item',[cylinder(.55,.85,.55),cylinder(.62,.08,.62,y=.89,color='#374151')]),
 ('light','Lighting','Path light','item',[cylinder(.18,3,.18),box(.8,.15,.3,y=3.075,color='#e6d9a4')]),
 ('toilet','Toilets','Concept toilet module','item',[box(2.4,2.6,3.2,color='#bac8bd'),box(.85,2,.03,x=-.5,y=1,z=1.615,color=BLUE),box(2.6,.15,3.4,y=2.675,color=METAL)]),
 ('pergola','Pergolas','Open pergola','item',[box(.16,2.5,.16,x=x,z=z) for x in [-1.4,1.4] for z in [-1.4,1.4]]+[box(3.2,.15,.16,y=2.575,z=z) for z in [-1.4,-.7,0,.7,1.4]]),
 ('solar','Solar modules','Concept solar module','item',[box(.08,.8,.08,x=x,z=z,color=METAL) for x in [-.65,.65] for z in [-.35,.35]]+[box(1.8,.08,1.1,y=.84,color=BLUE)]+[box(.02,.005,1.1,x=x,y=.882,color='#a5c4da') for x in [-.6,0,.6]]),
 ('play','Play equipment','Concept play platform','item',[box(.12,1.5,.12,x=x,z=z,color=METAL) for x in [-.6,.6] for z in [-.6,.6]]+[box(1.4,.12,1.4,y=1.5,color='#d9a24e'),box(.8,.12,1.8,y=.65,z=1.1,color=BLUE)]),
 ('bike','Bike racks','Cycle parking rail','item',[cylinder(.08,.9,.08,x=x) for x in [-.65,.65]]+[box(1.38,.08,.08,y=.86,color=METAL)]),
 ('planter','Planters','Raised planter','item',[box(1.2,.5,.7,color='#a97850'),box(1.08,.03,.58,y=.515,color='#42372b'),sphere(.9,.55,.5,y=.8)]),
 ('path','Paths','Paving segment','m',[box(1.5,.08,4,color='#b4b1a7')]),
 ('fence','Fencing','Timber fence segment','m',[box(.12,1.2,.12,x=x) for x in [-1,1]]+[box(2.12,.18,.08,y=y) for y in [.35,.8,1.1]]),
 ('tree','Planting','Concept canopy tree','item',[cylinder(.35,2,.35,color=WOOD),sphere(3,3.5,3,y=3.25)]),
 ('canopy','Shelters','Shade canopy','item',[box(.12,2.7,.12,x=x,z=z,color=METAL) for x in [-1.8,1.8] for z in [-1.3,1.3]]+[box(4,.12,3,y=2.76,color='#d7c5a2')]),
 ('gazebo','Shelters','Garden gazebo','item',[box(.16,2.4,.16,x=x,z=z) for x in [-1.5,1.5] for z in [-1.5,1.5]]+[box(3.5,.18,3.5,y=2.49,color='#647869'),box(2.9,.22,2.9,y=2.69,color='#718575'),box(2.2,.22,2.2,y=2.91,color='#7e9280'),box(1.4,.2,1.4,y=3.12,color='#879b88')]),
 ('bollard-light','Lighting','Small path lamp','item',[cylinder(.16,.75,.16),cylinder(.24,.22,.24,y=.86,color='#f1dfa7'),cylinder(.28,.06,.28,y=1,color=METAL)]),
 ('ground-light','Lighting','Ground lamp','item',[cylinder(.28,.1,.28),cylinder(.24,.035,.24,y=.1175,color='#f1dfa7')]),
]
assets=[]
for key,category,name,unit,parts in definitions:
    lows=[min(p['position'][i]-p['size'][i]/2 for p in parts) for i in range(3)]
    highs=[max(p['position'][i]+p['size'][i]/2 for p in parts) for i in range(3)]
    # Centre any asymmetric model on its ground-footprint pivot.
    for p in parts:
        p['position']=[round(p['position'][0]-(lows[0]+highs[0])/2,6),round(p['position'][1]-lows[1],6),round(p['position'][2]-(lows[2]+highs[2])/2,6)]
    dimensions=[round(highs[i]-lows[i],6) for i in range(3)]
    triangles=sum({'box':12,'cylinder':32,'sphere':80}[p['shape']] for p in parts)
    asset=dict(id=key,version=1,name=name,category=category,unit=unit,dimensions=dimensions,pivot=[0,0,0],units='metres',license='MIT',source='scripts/object-assets.py',author='InfraShader project',scale_min=.5,scale_max=2,parts=parts,triangles=triangles,linear_axis='z' if key=='path' else 'x',warning='Concept only. No engineering, safety, shade or energy-output certification.')
    asset['sha256']=hashlib.sha256(json.dumps(asset,sort_keys=True).encode()).hexdigest();assets.append(asset)
payload=json.dumps(assets,indent=2)+'\n'
for folder in ['apps/api/app/data','apps/web/public/objects']:
    path=ROOT/folder;path.mkdir(parents=True,exist_ok=True);(path/'catalogue.json').write_text(payload,encoding='utf-8')
(ROOT/'apps/web/public/objects/LICENSE.txt').write_text((ROOT/'LICENSE').read_text(),encoding='utf-8')
# Isometric thumbnails share the exact part bounding boxes. The live Three view renders curved primitives.
for asset in assets:
    polygons=[]
    def project(x,y,z):return ((x-z)*.866,(x+z)*.5-y)
    coords=[]
    for p in asset['parts']:
        x,y,z=p['position'];w,h,d=[s/2 for s in p['size']]
        vertices=[project(x+xx*w,y+yy*h,z+zz*d) for xx,yy,zz in [(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]]
        coords.extend(vertices)
        for face in [(1,2,6,5),(2,3,7,6),(4,5,6,7)]:polygons.append((vertices,face,p['color']))
    minx,miny=min(p[0] for p in coords),min(p[1] for p in coords);maxx,maxy=max(p[0] for p in coords),max(p[1] for p in coords)
    scale=min(100/(maxx-minx),80/(maxy-miny))
    elements=[]
    for vertices,face,color in polygons:
        points=' '.join(f'{60+(vertices[i][0]-(minx+maxx)/2)*scale:.2f},{50+(vertices[i][1]-(miny+maxy)/2)*scale:.2f}' for i in face)
        elements.append(f'<polygon points="{points}" fill="{color}" stroke="#ffffff55" stroke-width=".6"/>')
    (ROOT/f'apps/web/public/objects/{asset["id"]}.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100">'+''.join(elements)+'</svg>',encoding='utf-8')
print(f'Generated {len(assets)} MIT presets; {sum(a["triangles"] for a in assets)} triangles across unique assets.')
