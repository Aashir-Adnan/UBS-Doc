import { useEffect, useRef } from 'react'

interface Props {
  className?: string
  opacity?: number
}

// Full-viewport aurora background. The fragment shader is unchanged from the
// three.js version this replaces; everything around it was rewritten because
// that version cost 6.7ms per megapixel per frame with nothing capping either
// number. Measured on an Intel Iris Xe it held 127fps at 1366x768 and 40fps at
// 2560x1440 — the page halved its frame rate purely as a function of monitor
// size. Three things fix that, in order of payoff:
//
//  1. The drawing buffer is capped at MAX_BUFFER_PIXELS and CSS upscales it, so
//     GPU cost is constant no matter how large the display is. The aurora is a
//     soft out-of-focus gradient; there is no detail for the upscale to lose.
//  2. Rendering is capped at TARGET_FPS and iTime advances by elapsed time
//     rather than a fixed step per frame. The old loop ran at the display's
//     refresh rate, so a 144Hz monitor did 2.4x the GPU work *and* played the
//     animation 2.4x too fast.
//  3. No three.js. It was 508 kB raw / 126 kB gzipped — half the main bundle,
//     eagerly loaded on every route — to draw one triangle with no scene graph,
//     camera, or geometry behind it. antialias is off for the same reason: a
//     full-screen triangle has no interior edges to smooth.
//
// three r163+ requires WebGL2, so requiring it here is not a new constraint.

// ~1.2 MP costs about 8ms/frame on the low-end integrated GPU above, which at
// 30fps leaves the rest of the frame budget alone. Tune this one constant if
// the background needs to be sharper or cheaper.
const MAX_BUFFER_PIXELS = 1_200_000
const TARGET_FPS = 30
const FRAME_MS = 1000 / TARGET_FPS
// The old loop added 0.016 to iTime per rendered frame at the refresh rate, so
// on the 60Hz screens this was authored against the aurora moved 0.96 units a
// second. Driving it from elapsed time at that rate keeps the motion identical
// to what it looks like today, and identical across refresh rates.
const TIME_UNITS_PER_SECOND = 0.96
// Reduced-motion renders one frame from mid-animation: frame 0 is nearly black,
// which reads as "no background" rather than a calmer one.
const STATIC_FRAME_TIME = 12

const VERT_SRC = `#version 300 es
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

const FRAG_SRC = `#version 300 es
precision highp float;

uniform float iTime;
uniform vec2 iResolution;

out vec4 fragColor;

#define NUM_OCTAVES 3

float rand(vec2 n) {
  return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 ip = floor(p);
  vec2 u = fract(p);
  u = u*u*(3.0-2.0*u);
  float res = mix(
    mix(rand(ip), rand(ip + vec2(1.0, 0.0)), u.x),
    mix(rand(ip + vec2(0.0, 1.0)), rand(ip + vec2(1.0, 1.0)), u.x), u.y);
  return res * res;
}

float fbm(vec2 x) {
  float v = 0.0;
  float a = 0.3;
  vec2 shift = vec2(100);
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < NUM_OCTAVES; ++i) {
    v += a * noise(x);
    x = rot * x * 2.0 + shift;
    a *= 0.4;
  }
  return v;
}

void main() {
  vec2 shake = vec2(sin(iTime * 1.2) * 0.005, cos(iTime * 2.1) * 0.005);
  vec2 p = ((gl_FragCoord.xy + shake * iResolution.xy) - iResolution.xy * 0.5) / iResolution.y * mat2(6.0, -4.0, 4.0, 6.0);
  vec2 v;
  vec4 o = vec4(0.0);

  float f = 2.0 + fbm(p + vec2(iTime * 5.0, 0.0)) * 0.5;

  for (float i = 0.0; i < 35.0; i++) {
    v = p + cos(i * i + (iTime + p.x * 0.08) * 0.025 + i * vec2(13.0, 11.0)) * 3.5
      + vec2(sin(iTime * 3.0 + i) * 0.003, cos(iTime * 3.5 - i) * 0.003);
    float tailNoise = fbm(v + vec2(iTime * 0.5, i)) * 0.3 * (1.0 - (i / 35.0));
    vec4 auroraColors = vec4(
      0.1 + 0.3 * sin(i * 0.2 + iTime * 0.4),
      0.3 + 0.5 * cos(i * 0.3 + iTime * 0.5),
      0.7 + 0.3 * sin(i * 0.4 + iTime * 0.3),
      1.0
    );
    vec4 cur = auroraColors * exp(sin(i * i + iTime * 0.8)) / length(max(v, vec2(v.x * f * 0.015, v.y * 1.5)));
    float thinness = smoothstep(0.0, 1.0, i / 35.0) * 0.6;
    o += cur * (1.0 + tailNoise * 0.8) * thinness;
  }

  o = tanh(pow(o / 100.0, vec4(1.6)));
  fragColor = o * 1.5;
}
`

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[aurora] shader compile failed:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export default function AnoAI({ className = '', opacity = 1 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const canvas = document.createElement('canvas')
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    })
    // No WebGL2 → leave the container empty. The CSS gradient behind it still
    // carries the page; the old three.js path would have thrown here.
    if (!gl) return undefined

    container.appendChild(canvas)

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let program: WebGLProgram | null = null
    let vbo: WebGLBuffer | null = null
    let uTime: WebGLUniformLocation | null = null
    let uResolution: WebGLUniformLocation | null = null
    let bufferW = 0
    let bufferH = 0
    let time = reduced ? STATIC_FRAME_TIME : 0
    let lastFrame = 0
    let rafId = 0
    let contextLost = false
    // Set by the ResizeObserver and consumed by the next rendered frame, so the
    // loop never reads clientWidth/clientHeight (a forced layout) on a frame
    // where nothing actually changed size.
    let needsResize = true

    const setup = () => {
      const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC)
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
      if (!vs || !fs) return false

      program = gl.createProgram()
      if (!program) return false
      gl.attachShader(program, vs)
      gl.attachShader(program, fs)
      gl.linkProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn('[aurora] program link failed:', gl.getProgramInfoLog(program))
        return false
      }
      gl.useProgram(program)

      // One oversized triangle rather than a two-triangle quad: it covers clip
      // space with a third of the vertex work and no interior edge.
      vbo = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      const aPos = gl.getAttribLocation(program, 'aPos')
      gl.enableVertexAttribArray(aPos)
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

      uTime = gl.getUniformLocation(program, 'iTime')
      uResolution = gl.getUniformLocation(program, 'iResolution')
      // Single draw over a cleared buffer, so blending would be a no-op.
      gl.disable(gl.BLEND)
      gl.disable(gl.DEPTH_TEST)
      bufferW = 0
      bufferH = 0
      return true
    }

    // Returns true when the buffer was actually resized.
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      let w = Math.max(1, Math.round((container.clientWidth || 1) * dpr))
      let h = Math.max(1, Math.round((container.clientHeight || 1) * dpr))

      const over = (w * h) / MAX_BUFFER_PIXELS
      if (over > 1) {
        const s = Math.sqrt(1 / over)
        w = Math.max(1, Math.round(w * s))
        h = Math.max(1, Math.round(h * s))
      }
      if (w === bufferW && h === bufferH) return false

      bufferW = w
      bufferH = h
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
      return true
    }

    const draw = () => {
      if (contextLost || !program) return
      // iResolution is the buffer, not the CSS box: gl_FragCoord counts buffer
      // pixels, and the three.js version passed CSS pixels, which left the
      // aurora off-centre and mis-scaled on any display with a DPR above 1.
      gl.uniform1f(uTime, time)
      gl.uniform2f(uResolution, bufferW, bufferH)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const frame = (now: number) => {
      rafId = requestAnimationFrame(frame)
      // rAF fires at the refresh rate; render only when a slot at TARGET_FPS is
      // due. The 1ms slack keeps a 60Hz display on an exact every-other-frame
      // cadence instead of occasionally skipping to 20fps.
      if (lastFrame && now - lastFrame < FRAME_MS - 1) return
      const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0
      lastFrame = now
      time += dt * TIME_UNITS_PER_SECOND
      if (needsResize) { needsResize = false; resize() }
      draw()
    }

    const start = () => {
      if (reduced) {
        needsResize = false
        resize()
        draw()
        return
      }
      lastFrame = 0
      rafId = requestAnimationFrame(frame)
    }

    const onLost = (e: Event) => {
      // Without preventDefault the context can never be restored, and the loop
      // would keep spinning against a dead context.
      e.preventDefault()
      contextLost = true
      cancelAnimationFrame(rafId)
      rafId = 0
    }

    const onRestored = () => {
      contextLost = false
      needsResize = true
      if (setup()) start()
    }

    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)

    let resizeTimer = 0
    const onResize = () => {
      // Reallocating the drawing buffer on every resize event is expensive, and
      // a drag fires dozens of them. Under reduced motion nothing else would
      // repaint the static frame, so it redraws here.
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        needsResize = true
        // Under reduced motion there is no loop to pick the flag up.
        if (reduced) { needsResize = false; if (resize()) draw() }
      }, 120)
    }
    const observer = new ResizeObserver(onResize)
    observer.observe(container)

    if (!setup()) {
      container.removeChild(canvas)
      observer.disconnect()
      return undefined
    }
    start()

    return () => {
      cancelAnimationFrame(rafId)
      window.clearTimeout(resizeTimer)
      observer.disconnect()
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      if (program) gl.deleteProgram(program)
      if (vbo) gl.deleteBuffer(vbo)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      if (container.contains(canvas)) container.removeChild(canvas)
    }
  }, [])

  return <div ref={containerRef} className={className} style={{ opacity }} />
}
