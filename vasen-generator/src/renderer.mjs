// Vasen-Generator 2: the view. One mesh, drawn straight from the typed arrays the core fills; no scene graph.
// The shader also shows what the print check found: overhangs beyond the limit, and the layers of the print.

const VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
uniform mat4 viewProjection;
out vec3 vPosition;
out vec3 vNormal;
void main() {
  vPosition = position;
  vNormal = normal;
  gl_Position = viewProjection * vec4(position, 1.0);
}`

const FRAGMENT = `#version 300 es
precision highp float;
in vec3 vPosition;
in vec3 vNormal;
uniform vec3 eye;
uniform vec3 color;
uniform vec3 warnColor;
uniform float flatShading;
uniform float overhangLimit; // sine of the angle; above 1 = not shown
uniform float layerHeight;   // 0 = no layer lines
uniform float cut;           // 1 = the front half is taken away, to look into the wall
out vec4 outColor;
void main() {
  if (cut > 0.5 && vPosition.y < 0.0) discard;
  // Seen from behind (the inside of a vase shown open), the wall faces the other way.
  vec3 n = flatShading > 0.5 ? normalize(cross(dFdx(vPosition), dFdy(vPosition))) : normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 v = normalize(eye - vPosition);
  // Z is up. A soft sky from above, a key light over the viewer's shoulder, a little light from the other side.
  vec3 key = normalize(v + vec3(0.35, 0.25, 0.9));
  vec3 fill = normalize(vec3(-v.y, v.x, 0.25));
  float sky = 0.5 + 0.5 * n.z;
  float diffuse = max(dot(n, key), 0.0) * 0.6 + max(dot(n, fill), 0.0) * 0.14;
  vec3 base = color;
  if (overhangLimit <= 1.0 && vPosition.z > 0.3 && n.z > -0.995) {
    float over = smoothstep(overhangLimit - 0.03, overhangLimit + 0.03, -n.z);
    base = mix(base, warnColor, over * 0.85);
  }
  if (layerHeight > 0.0) {
    float period = layerHeight / max(fwidth(vPosition.z), 1e-5);
    float line = abs(fract(vPosition.z / layerHeight) - 0.5) * 2.0;
    base *= 1.0 - 0.16 * smoothstep(0.55, 1.0, line) * clamp((period - 2.5) / 4.0, 0.0, 1.0);
  }
  vec3 lit = base * (mix(0.22, 0.5, sky) + diffuse);
  float gloss = pow(max(dot(n, normalize(key + v)), 0.0), 40.0) * 0.1;
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.05;
  // Worked out in light, shown as the screen wants it.
  outColor = vec4(pow(lit + gloss + rim, vec3(1.0 / 2.2)), 1.0);
}`

const BED_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec3 position;
uniform mat4 viewProjection;
out vec2 vPlane;
void main() {
  vPlane = position.xy;
  gl_Position = viewProjection * vec4(position, 1.0);
}`

const BED_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vPlane;
uniform vec3 lineColor;
uniform float radius;
out vec4 outColor;
void main() {
  // A grid of 10 mm on the bed, fading out towards its edge.
  vec2 cell = abs(fract(vPlane / 10.0 - 0.5) - 0.5) / fwidth(vPlane / 10.0);
  float line = 1.0 - min(min(cell.x, cell.y), 1.0);
  float fade = 1.0 - smoothstep(0.35, 1.0, length(vPlane) / radius);
  outColor = vec4(lineColor, line * fade * 0.5);
}`

function program(gl, vertex, fragment) {
  const make = (type, source) => {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader')
    return shader
  }
  const p = gl.createProgram()
  gl.attachShader(p, make(gl.VERTEX_SHADER, vertex))
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fragment))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'program')
  const uniforms = {}
  for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
    const info = gl.getActiveUniform(p, i)
    uniforms[info.name] = gl.getUniformLocation(p, info.name)
  }
  return { p, uniforms }
}

function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2)
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]
}

function lookAt(eye, target) {
  // Z is up.
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2]
  const zl = Math.hypot(zx, zy, zz) || 1
  zx /= zl; zy /= zl; zz /= zl
  let xx = -zy, xy = zx, xz = 0 // up x z
  const xl = Math.hypot(xx, xy) || 1
  xx /= xl; xy /= xl
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx
  return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1]
}

function multiply(a, b) {
  const out = new Float32Array(16)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
  }
  return out
}

/**
 * The view on a canvas. `setMesh` takes the core's arrays, `set` the colours and what to show, `frame` fits the
 * camera to a vase. Draws only when something changed. Returns null where WebGL 2 is not there.
 */
export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, powerPreference: 'high-performance' })
  if (!gl) return null
  const body = program(gl, VERTEX, FRAGMENT)
  const bed = program(gl, BED_VERTEX, BED_FRAGMENT)
  const vao = gl.createVertexArray()
  const positionBuffer = gl.createBuffer(), normalBuffer = gl.createBuffer(), indexBuffer = gl.createBuffer()
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
  const bedVao = gl.createVertexArray(), bedBuffer = gl.createBuffer()
  gl.bindVertexArray(bedVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, bedBuffer)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)

  const state = {
    count: 0, flat: false, color: [0.5, 0.66, 0.6], warn: [0.85, 0.2, 0.15], line: [0.5, 0.5, 0.5],
    overhang: 2, layerHeight: 0, cut: false, yaw: -0.6, pitch: 0.22, distance: 420, target: [0, 0, 90], bedRadius: 150, dirty: true, raf: 0,
  }

  const draw = () => {
    state.raf = 0
    if (!state.dirty) return
    state.dirty = false
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr)), height = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch)
    const eye = [state.target[0] + state.distance * cp * Math.cos(state.yaw), state.target[1] + state.distance * cp * Math.sin(state.yaw), state.target[2] + state.distance * sp]
    const fov = (32 * Math.PI) / 180
    const viewProjection = multiply(perspective(fov, width / height, Math.max(1, state.distance / 50), state.distance * 6 + 2000), lookAt(eye, state.target))
    gl.enable(gl.DEPTH_TEST)
    if (state.count) {
      gl.useProgram(body.p)
      gl.uniformMatrix4fv(body.uniforms.viewProjection, false, viewProjection)
      gl.uniform3fv(body.uniforms.eye, eye)
      gl.uniform3fv(body.uniforms.color, state.color)
      gl.uniform3fv(body.uniforms.warnColor, state.warn)
      gl.uniform1f(body.uniforms.flatShading, state.flat ? 1 : 0)
      gl.uniform1f(body.uniforms.overhangLimit, state.overhang)
      gl.uniform1f(body.uniforms.layerHeight, state.layerHeight)
      gl.uniform1f(body.uniforms.cut, state.cut ? 1 : 0)
      gl.bindVertexArray(vao)
      gl.drawElements(gl.TRIANGLES, state.count, gl.UNSIGNED_INT, 0)
    }
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.depthMask(false)
    gl.useProgram(bed.p)
    gl.uniformMatrix4fv(bed.uniforms.viewProjection, false, viewProjection)
    gl.uniform3fv(bed.uniforms.lineColor, state.line)
    gl.uniform1f(bed.uniforms.radius, state.bedRadius)
    gl.bindVertexArray(bedVao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.depthMask(true)
    gl.disable(gl.BLEND)
    gl.bindVertexArray(null)
  }
  const invalidate = () => {
    state.dirty = true
    if (!state.raf) state.raf = requestAnimationFrame(draw)
  }
  const setBed = (radius) => {
    state.bedRadius = radius
    gl.bindBuffer(gl.ARRAY_BUFFER, bedBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-radius, -radius, 0, radius, -radius, 0, -radius, radius, 0, radius, radius, 0]), gl.STATIC_DRAW)
  }
  setBed(150)

  // Turning with one finger or the mouse, zooming with the wheel or two fingers.
  const pointers = new Map()
  let pinch = 0
  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId)
    pointers.set(event.pointerId, [event.clientX, event.clientY])
    pinch = 0
  })
  canvas.addEventListener('pointermove', (event) => {
    const last = pointers.get(event.pointerId)
    if (!last) return
    if (pointers.size === 1) {
      state.yaw -= (event.clientX - last[0]) * 0.008
      state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch + (event.clientY - last[1]) * 0.006))
    }
    pointers.set(event.pointerId, [event.clientX, event.clientY])
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      const spread = Math.hypot(a[0] - b[0], a[1] - b[1])
      if (pinch > 0 && spread > 0) state.distance = Math.max(30, Math.min(4000, (state.distance * pinch) / spread))
      pinch = spread
    }
    invalidate()
  })
  const release = (event) => { pointers.delete(event.pointerId); pinch = 0 }
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', release)
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault()
    state.distance = Math.max(30, Math.min(4000, state.distance * Math.exp(event.deltaY * 0.0012)))
    invalidate()
  }, { passive: false })
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(invalidate).observe(canvas)

  return {
    setMesh(mesh) {
      gl.bindVertexArray(vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW)
      gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.DYNAMIC_DRAW)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.DYNAMIC_DRAW)
      gl.bindVertexArray(null)
      // A solid body is shown as it prints in vase mode: open at the top.
      state.count = mesh.lidStart ?? mesh.indices.length
      state.flat = Boolean(mesh.flat)
      invalidate()
    },
    set(values) {
      Object.assign(state, values)
      invalidate()
    },
    /** The camera at a distance that shows the whole vase, looking at its middle. */
    frame(width, height) {
      state.target = [0, 0, height * 0.48]
      const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight)
      const half = Math.tan((16 * Math.PI) / 180)
      state.distance = Math.max((height * 0.68) / half, (width * 0.66) / (half * Math.max(0.2, aspect))) + width * 0.5
      const bedRadius = Math.max(120, width * 1.4)
      if (bedRadius !== state.bedRadius) setBed(bedRadius)
      invalidate()
    },
    invalidate,
    /** The picture as it stands, for a file: drawn now, so the buffer is still there to read. */
    snapshot() {
      state.dirty = true
      draw()
      return canvas.toDataURL('image/png')
    },
  }
}
