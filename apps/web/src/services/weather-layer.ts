import type { CustomLayerInterface, Map } from 'mapbox-gl'
import type { Weather } from './environment'

// Camera-relative procedural precipitation and an infinite visual cloud plane.
// No real weather, building collision, physical rain units or numerical shade effect.
// Single triangle, bounded shader work; no external textures or particle DOM nodes.
export function weatherLayer(
  map: Map,
  read: () => { weather: Weather; reduced: boolean; elevation: number },
  fail: () => void,
): CustomLayerInterface {
  let program: WebGLProgram | null = null,
    buffer: WebGLBuffer | null = null
  let vao: WebGLVertexArrayObject | null = null
  let position = -1,
    elapsed = 0,
    previous = 0
  let frames = 0
  const uniforms: Record<string, WebGLUniformLocation | null> = {}
  const vertex = `attribute vec2 a_pos; varying vec2 uv; void main(){uv=a_pos*.5+.5;gl_Position=vec4(a_pos,0.,1.);}`
  const fragment = `precision mediump float;
varying vec2 uv;
uniform vec2 size;
uniform float t,cloud,rain,wind,dir,bearing,pitch,fov,day,quality;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){return .57*noise(p)+.28*noise(p*2.03)+.15*noise(p*4.01);}
void main(){
 vec2 screen=(uv*2.-1.)*vec2(size.x/size.y,1.)*tan(fov*.5);
 vec3 ray=normalize(vec3(screen.x,sin(pitch)+screen.y*cos(pitch),-cos(pitch)+screen.y*sin(pitch)));
 vec2 world=vec2(ray.x*cos(bearing)+ray.y*sin(bearing),-ray.x*sin(bearing)+ray.y*cos(bearing));
 vec2 flow=vec2(sin(dir),cos(dir))*t*(.02+wind*.12);
 // Clouds occupy a stylised upper hemisphere; soft screen haze also works top-down.
 vec2 plane=world/max(.15,abs(ray.z)) * 2.5-flow;
 float field=fbm(plane);
 float clouds=smoothstep(1.-cloud*.85,1.05-cloud*.65,field)*cloud;
 clouds*=mix(.24,.7,smoothstep(-.4,.35,ray.z));
 float haze=cloud*.22;
 vec3 colour=mix(vec3(.10,.14,.21),mix(vec3(.86,.89,.91),vec3(.27,.32,.40),rain*.85),day);
 float alpha=clamp(clouds+haze,0.,.76);
 float streak=0.;
 for(int i=0;i<3;i++){
  if(float(i)>quality)break;
  float depth=1.+float(i)*.7;
  float tilt=sin(dir-bearing)*wind*.65;
  vec2 p=vec2(uv.x+uv.y*tilt,uv.y)*vec2(85.,35.)*depth;
  p.y+=t*(18.+wind*20.)*depth;
  vec2 cell=floor(p);vec2 f=fract(p);
  float seed=hash(vec2(cell.x,cell.y));
  float drop=(1.-smoothstep(.015,.055,abs(f.x-.5)))*smoothstep(.0,.7,f.y)*(1.-smoothstep(.7,1.,f.y));
  streak+=drop*step(seed,rain*.55)*(.35/depth);
 }
 float rainAlpha=clamp(streak,0.,.65)*rain;
 vec3 rainColour=mix(vec3(.45,.60,.76),vec3(.82,.90,.98),day);
 float total=alpha+rainAlpha*(1.-alpha);
 vec3 rgb=colour*alpha*(1.-rainAlpha)+rainColour*rainAlpha;
 gl_FragColor=vec4(rgb,total);
}`
  return {
    id: 'explore-weather',
    type: 'custom',
    renderingMode: '2d',
    onAdd(_map, gl) {
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type)!
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          gl.deleteShader(shader)
          throw new Error('Weather shader unsupported')
        }
        return shader
      }
      try {
        const vs = compile(gl.VERTEX_SHADER, vertex),
          fs = compile(gl.FRAGMENT_SHADER, fragment)
        program = gl.createProgram()!
        gl.attachShader(program, vs)
        gl.attachShader(program, fs)
        gl.linkProgram(program)
        gl.deleteShader(vs)
        gl.deleteShader(fs)
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw new Error('Weather renderer unsupported')
        buffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
        position = gl.getAttribLocation(program, 'a_pos')
        vao = (gl as WebGL2RenderingContext).createVertexArray()
        for (const key of [
          'size',
          't',
          'cloud',
          'rain',
          'wind',
          'dir',
          'bearing',
          'pitch',
          'fov',
          'day',
          'quality',
        ])
          uniforms[key] = gl.getUniformLocation(program, key)
      } catch {
        fail()
      }
    },
    render(gl) {
      const { weather: w, reduced, elevation } = read()
      const now = performance.now(),
        animate =
          w.enabled && !w.paused && !reduced && !document.hidden && (w.cloud > 0 || w.rain > 0)
      if (animate && previous) elapsed += Math.min(0.1, (now - previous) / 1000)
      previous = now
      map.getCanvas().dataset.weatherTime = String(elapsed)
      map.getCanvas().dataset.weatherAnimating = String(animate)
      if (!program || !buffer || !w.enabled || document.hidden) return
      // Isolate vertex state on WebGL2; restore touched state for the shared renderer.
      const gl2 = gl as WebGL2RenderingContext
      const oldVao = gl2.getParameter(gl2.VERTEX_ARRAY_BINDING)
      gl2.bindVertexArray(vao)
      const oldProgram = gl.getParameter(gl.CURRENT_PROGRAM),
        oldBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING)
      const blend = gl.isEnabled(gl.BLEND),
        depth = gl.isEnabled(gl.DEPTH_TEST),
        mask = gl.getParameter(gl.DEPTH_WRITEMASK)
      const srcRGB = gl.getParameter(gl.BLEND_SRC_RGB),
        dstRGB = gl.getParameter(gl.BLEND_DST_RGB),
        srcA = gl.getParameter(gl.BLEND_SRC_ALPHA),
        dstA = gl.getParameter(gl.BLEND_DST_ALPHA)
      gl.useProgram(program)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.enableVertexAttribArray(position)
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
      gl.disable(gl.DEPTH_TEST)
      gl.depthMask(false)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.uniform2f(uniforms.size, gl.drawingBufferWidth, gl.drawingBufferHeight)
      const rad = Math.PI / 180
      const values = {
        t: elapsed,
        cloud: w.cloud / 100,
        rain: w.rain / 100,
        wind: w.wind / 100,
        dir: w.direction * rad,
        bearing: map.getBearing() * rad,
        pitch: map.getPitch() * rad,
        fov: map.getVerticalFieldOfView() * rad,
        day: Math.max(0, Math.min(1, (elevation + 6) / 20)),
        quality: w.quality === 'Low' ? 0 : w.quality === 'Medium' ? 1 : 2,
      }
      for (const [key, value] of Object.entries(values)) gl.uniform1f(uniforms[key], value)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      map.getCanvas().dataset.weatherFrames = String(++frames)
      gl2.bindVertexArray(oldVao)
      gl.bindBuffer(gl.ARRAY_BUFFER, oldBuffer)
      gl.useProgram(oldProgram)
      gl.depthMask(mask)
      if (depth) gl.enable(gl.DEPTH_TEST)
      else gl.disable(gl.DEPTH_TEST)
      gl.blendFuncSeparate(srcRGB, dstRGB, srcA, dstA)
      if (!blend) gl.disable(gl.BLEND)
      if (animate) map.triggerRepaint()
    },
    onRemove(_map, gl) {
      if (vao) (gl as WebGL2RenderingContext).deleteVertexArray(vao)
      if (program) gl.deleteProgram(program)
      if (buffer) gl.deleteBuffer(buffer)
      program = null
      buffer = null
    },
  }
}
