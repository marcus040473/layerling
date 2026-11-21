// Vasen-Generator 2: the mesh. The wall is one grid of rows (height) and columns (round the vase); every
// pattern is worked out straight on that grid as a height over the wall. Nothing is subdivided, cut, welded
// or repaired afterwards: the grid is closed by the way it is built, and its points go into typed arrays once.
//
// The columns turn with the twist, so a twisted polygon keeps its corners on columns and a twisted groove
// stays one clean line; they are spread evenly along the outline, so a pattern's cells keep their width.

import { MATERIALS, QUALITY, normalizeParams } from './params.mjs'
import { patternSamples, prepareLayer } from './patterns.mjs'
import { columnAngles, radiusFunction, sectionFunction } from './shape.mjs'

const TAU = 2 * Math.PI
const MAX_COLUMNS = 4096
const MAX_ROWS = 6000
const FILAMENT = 1.75
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const gcd = (a, b) => (b ? gcd(b, a % b) : a)

function hash(i, j, seed) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** 1 inside the height band, 0 outside, a soft step of `fade` mm at an end that is not the vase's own. */
function bandWeight(z, H, from, to, fade) {
  const a = (from / 100) * H, b = (to / 100) * H
  if (b - a < 1e-6) return 0
  const f = Math.min(fade, (b - a) / 2)
  const lower = from <= 0 ? 1 : f <= 0 ? (z >= a ? 1 : 0) : smooth((z - a) / f)
  const upper = to >= 100 ? 1 : f <= 0 ? (z <= b ? 1 : 0) : smooth((b - z) / f)
  return lower * upper
}

/** Everything about the vase that does not depend on the mesh: curves, cross-sections, layers. */
function prepare(p) {
  const H = p.height
  const R = radiusFunction(p)
  const secA = sectionFunction(p.section)
  const secB = p.section2.type !== 'none' ? sectionFunction(p.section2) : null
  const twist = (p.twist * Math.PI) / 180, sway = (p.sway * Math.PI) / 180
  const rotation = (z) => {
    const t = z / H
    return twist * t + (sway > 0 ? sway * Math.sin(TAU * p.swayCount * t) : 0)
  }
  const rotationRate = Math.abs(twist) / H + (sway > 0 ? (sway * TAU * p.swayCount) / H : 0)
  const mA = (p.morphFrom / 100) * H, mB = (p.morphTo / 100) * H
  const blend = !secB ? () => 0 : (z) => (mB - mA < 1e-6 ? (z < mA ? 0 : 1) : smooth((z - mA) / (mB - mA)))
  const lowpoly = p.style === 'lowpoly'
  const layers = lowpoly ? [] : p.layers
    .filter((layer) => layer.on && layer.depth !== 0 && layer.to - layer.from > 1e-6 && (layer.pattern !== 'image' || layer.image))
    .map((layer) => {
      const L = prepareLayer(layer)
      // Over and under alternate from cell to cell: only an even number closes round the vase.
      if (L.pattern === 'weave' && L.count % 2) L.count += 1
      L.from = layer.from
      L.to = layer.to
      L.fade = layer.fade
      L.turn = layer.turn / 360
      L.samples = patternSamples(layer)
      return L
    })
  const round = p.section.type === 'circle' && !secB
  return { p, H, R, secA, secB, rotation, rotationRate, blend, layers, lowpoly, round, mA, mB }
}

/** The heights of the rows from `a` to `b`: as far apart as `step(z)` allows, the last one exactly at `b`. */
function rowsBetween(a, b, step, scale, minStep) {
  const zs = [a]
  let z = a
  while (z < b - 1e-9 && zs.length < MAX_ROWS) {
    const d = Math.max(minStep, step(z) * scale)
    z = b - z <= d * 1.4 ? b : z + d
    zs.push(z)
  }
  if (zs[zs.length - 1] !== b) zs[zs.length - 1] = b
  return Float64Array.from(zs)
}

/** A growing mesh in typed arrays: rings of points, and the strips and fans between them. */
function meshBuffers(vertexCapacity, triangleCapacity) {
  const m = {
    positions: new Float32Array(vertexCapacity * 3),
    normals: new Float32Array(vertexCapacity * 3),
    indices: new Uint32Array(triangleCapacity * 3),
    v: 0, i: 0,
  }
  m.point = (x, y, z, nx, ny, nz) => {
    const o = m.v * 3
    m.positions[o] = x; m.positions[o + 1] = y; m.positions[o + 2] = z
    m.normals[o] = nx; m.normals[o + 1] = ny; m.normals[o + 2] = nz
    return m.v++
  }
  /** A ring again, with one normal for all its points (the flat rim, bottom and floor shade apart from the wall). */
  m.copyRing = (from, count, nx, ny, nz) => {
    const start = m.v
    for (let j = 0; j < count; j++) {
      const o = (from + j) * 3
      m.point(m.positions[o], m.positions[o + 1], m.positions[o + 2], nx, ny, nz)
    }
    return start
  }
  /** Between two rings of `count` points: `a` the lower or outer one. `lean` picks the shorter diagonal of a sheared quad. */
  m.strip = (a, b, count, flip, lean = false) => {
    const I = m.indices
    let i = m.i
    for (let j = 0; j < count; j++) {
      const k = j + 1 === count ? 0 : j + 1
      const p0 = a + j, p1 = a + k, p2 = b + k, p3 = b + j
      if (lean) {
        if (flip) { I[i] = p0; I[i + 1] = p3; I[i + 2] = p1; I[i + 3] = p1; I[i + 4] = p3; I[i + 5] = p2 } else { I[i] = p0; I[i + 1] = p1; I[i + 2] = p3; I[i + 3] = p1; I[i + 4] = p2; I[i + 5] = p3 }
      } else if (flip) { I[i] = p0; I[i + 1] = p2; I[i + 2] = p1; I[i + 3] = p0; I[i + 4] = p3; I[i + 5] = p2 } else { I[i] = p0; I[i + 1] = p1; I[i + 2] = p2; I[i + 3] = p0; I[i + 4] = p2; I[i + 5] = p3 }
      i += 6
    }
    m.i = i
  }
  /**
   * A strip of a wall with a pattern on it: each quad is split along its shorter diagonal, so the edge of a
   * bump or a joint that runs at a slant to the grid comes out as a line instead of as steps. A twisted
   * wall's sheared quads get their shorter diagonal the same way.
   */
  m.stripShort = (a, b, count) => {
    const I = m.indices, P = m.positions
    let i = m.i
    for (let j = 0; j < count; j++) {
      const k = j + 1 === count ? 0 : j + 1
      const p0 = a + j, p1 = a + k, p2 = b + k, p3 = b + j
      const o0 = p0 * 3, o1 = p1 * 3, o2 = p2 * 3, o3 = p3 * 3
      const ax = P[o0] - P[o2], ay = P[o0 + 1] - P[o2 + 1], az = P[o0 + 2] - P[o2 + 2]
      const bx = P[o1] - P[o3], by = P[o1 + 1] - P[o3 + 1], bz = P[o1 + 2] - P[o3 + 2]
      if (bx * bx + by * by + bz * bz < ax * ax + ay * ay + az * az) { I[i] = p0; I[i + 1] = p1; I[i + 2] = p3; I[i + 3] = p1; I[i + 4] = p2; I[i + 5] = p3 } else { I[i] = p0; I[i + 1] = p1; I[i + 2] = p2; I[i + 3] = p0; I[i + 4] = p2; I[i + 5] = p3 }
      i += 6
    }
    m.i = i
  }
  m.fan = (center, ring, count, flip) => {
    const I = m.indices
    let i = m.i
    for (let j = 0; j < count; j++) {
      const k = j + 1 === count ? 0 : j + 1
      I[i] = center
      I[i + 1] = flip ? ring + k : ring + j
      I[i + 2] = flip ? ring + j : ring + k
      i += 3
    }
    m.i = i
  }
  return m
}

/**
 * The triangles of a patterned wall. Most of such a wall is plain: the faces of the cells between the joints,
 * the ridges between grooves. Where a block of 8 x 8 quads (or else 4 x 4, or else 2 x 2) lies within `tol` mm
 * of the flat patch through its four corners, it becomes one fan round its middle point instead of 128 (32, 8)
 * triangles. Along its sides a fan takes exactly the points its neighbours use (their corners, or every point of
 * the grid beside a part that is not plain), so triangles meet edge to edge and the mesh stays closed.
 */
function wallTriangles(m, S, rows, tol) {
  const SIZES = [8, 4, 2]
  const B = SIZES[0]
  const blocksUp = Math.floor(rows / B), blocksRound = S % B === 0 ? S / B : 0
  if (!blocksUp || !blocksRound) {
    for (let i = 0; i < rows; i++) m.stripShort(i * S, (i + 1) * S, S)
    return
  }
  const P = m.positions, I = m.indices
  const tol2 = tol * tol
  const at = (i, j) => i * S + (j >= S ? j - S : j)
  const plain = (i0, j0, b) => {
    const a = at(i0, j0) * 3, c = at(i0, j0 + b) * 3, d = at(i0 + b, j0) * 3, e = at(i0 + b, j0 + b) * 3
    for (let di = 0; di <= b; di++) {
      const w = di / b
      for (let dj = 0; dj <= b; dj++) {
        if ((di === 0 || di === b) && (dj === 0 || dj === b)) continue
        const u = dj / b
        const k0 = (1 - u) * (1 - w), k1 = u * (1 - w), k2 = (1 - u) * w, k3 = u * w
        const v = at(i0 + di, j0 + dj) * 3
        const x = P[v] - (k0 * P[a] + k1 * P[c] + k2 * P[d] + k3 * P[e])
        const y = P[v + 1] - (k0 * P[a + 1] + k1 * P[c + 1] + k2 * P[d + 1] + k3 * P[e + 1])
        const z = P[v + 2] - (k0 * P[a + 2] + k1 * P[c + 2] + k2 * P[d + 2] + k3 * P[e + 2])
        if (x * x + y * y + z * z > tol2) return false
      }
    }
    return true
  }
  // Per size, which blocks are plain; a block inside a larger plain one is not marked (the larger one stands for it).
  const flags = SIZES.map((b) => new Uint8Array((blocksUp * B / b) * (S / b)))
  // The points triangles will use: corners and middles of plain blocks, every point of the parts that are not plain,
  // and the lowest and highest rows whole (the bottom and the rim are built on them).
  const used = new Uint8Array((rows + 1) * S)
  used.fill(1, 0, S)
  used.fill(1, blocksUp * B * S)
  let n = m.i
  const fan = (level, bi, bj) => {
    const b = SIZES[level]
    const i0 = bi * b, j0 = bj * b, i1 = i0 + b, j1 = j0 + b
    const centre = at(i0 + b / 2, j0 + b / 2)
    let last = at(i0, j0)
    for (let k = 1; k <= b; k++) { const v = at(i0, j0 + k); if (used[v]) { I[n++] = last; I[n++] = v; I[n++] = centre; last = v } }
    for (let k = 1; k <= b; k++) { const v = at(i0 + k, j1); if (used[v]) { I[n++] = last; I[n++] = v; I[n++] = centre; last = v } }
    for (let k = b - 1; k >= 0; k--) { const v = at(i1, j0 + k); if (used[v]) { I[n++] = last; I[n++] = v; I[n++] = centre; last = v } }
    for (let k = b - 1; k >= 0; k--) { const v = at(i0 + k, j0); if (used[v]) { I[n++] = last; I[n++] = v; I[n++] = centre; last = v } }
  }
  const quad = (i, j) => {
    const p0 = at(i, j), p1 = at(i, j + 1), p2 = at(i + 1, j + 1), p3 = at(i + 1, j)
    const o0 = p0 * 3, o1 = p1 * 3, o2 = p2 * 3, o3 = p3 * 3
    const ax = P[o0] - P[o2], ay = P[o0 + 1] - P[o2 + 1], az = P[o0 + 2] - P[o2 + 2]
    const bx = P[o1] - P[o3], by = P[o1 + 1] - P[o3 + 1], bz = P[o1 + 2] - P[o3 + 2]
    if (bx * bx + by * by + bz * bz < ax * ax + ay * ay + az * az) { I[n] = p0; I[n + 1] = p1; I[n + 2] = p3; I[n + 3] = p1; I[n + 4] = p2; I[n + 5] = p3 } else { I[n] = p0; I[n + 1] = p1; I[n + 2] = p2; I[n + 3] = p0; I[n + 4] = p2; I[n + 5] = p3 }
    n += 6
  }
  const mark = (level, bi, bj) => {
    const b = SIZES[level]
    const i0 = bi * b, j0 = bj * b
    if (plain(i0, j0, b)) {
      flags[level][bi * (S / b) + bj] = 1
      used[at(i0, j0)] = used[at(i0, j0 + b)] = used[at(i0 + b, j0)] = used[at(i0 + b, j0 + b)] = used[at(i0 + b / 2, j0 + b / 2)] = 1
    } else if (level + 1 < SIZES.length) for (let q = 0; q < 4; q++) mark(level + 1, 2 * bi + (q >> 1), 2 * bj + (q & 1))
    else for (let di = 0; di <= b; di++) for (let dj = 0; dj <= b; dj++) used[at(i0 + di, j0 + dj)] = 1
  }
  const emit = (level, bi, bj) => {
    const b = SIZES[level]
    if (flags[level][bi * (S / b) + bj]) fan(level, bi, bj)
    else if (level + 1 < SIZES.length) for (let q = 0; q < 4; q++) emit(level + 1, 2 * bi + (q >> 1), 2 * bj + (q & 1))
    else for (let q = 0; q < 4; q++) quad(bi * 2 + (q >> 1), bj * 2 + (q & 1))
  }
  for (let bi = 0; bi < blocksUp; bi++) for (let bj = 0; bj < blocksRound; bj++) mark(0, bi, bj)
  for (let bi = 0; bi < blocksUp; bi++) for (let bj = 0; bj < blocksRound; bj++) emit(0, bi, bj)
  m.i = n
  for (let i = blocksUp * B; i < rows; i++) m.stripShort(i * S, (i + 1) * S, S)
}

/** Normals of a wall grid from its neighbours round and up; `sign` -1 for an inner wall. */
function gridNormals(m, start, S, rowCount, sign) {
  const P = m.positions, N = m.normals
  for (let i = 0; i < rowCount; i++) {
    const up = start + (i + 1 < rowCount ? i + 1 : i) * S, down = start + (i > 0 ? i - 1 : i) * S
    const row = start + i * S
    for (let j = 0; j < S; j++) {
      const a = (row + (j + 1 === S ? 0 : j + 1)) * 3, b = (row + (j === 0 ? S - 1 : j - 1)) * 3
      const c = (up + j) * 3, d = (down + j) * 3
      const tx = P[a] - P[b], ty = P[a + 1] - P[b + 1], tz = P[a + 2] - P[b + 2]
      const ux = P[c] - P[d], uy = P[c + 1] - P[d + 1], uz = P[c + 2] - P[d + 2]
      let nx = ty * uz - tz * uy, ny = tz * ux - tx * uz, nz = tx * uy - ty * ux
      const len = sign / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1)
      const o = (row + j) * 3
      N[o] = nx * len; N[o + 1] = ny * len; N[o + 2] = nz * len
    }
  }
}

/**
 * Builds the vase: an indexed, closed mesh in millimetres, z up, standing on z = 0 round the z axis.
 * `options.quality` and `options.budget` (triangles) overrule the settings' quality: a preview asks for less.
 * Returns positions, normals, indices, key figures (`stats`) and what to look out for when printing (`notes`).
 */
export function buildVase(input, options = {}) {
  const started = now()
  const p = options.normalized ? input : normalizeParams(input)
  const q = QUALITY[options.quality ?? p.quality]
  const budget = Math.max(2000, options.budget ?? q.budget)
  const ctx = prepare(p)
  const mesh = ctx.lowpoly ? buildFacets(ctx) : buildSmooth(ctx, q, budget, options)
  mesh.params = p
  mesh.ms = now() - started
  mesh.stats = vaseStats(ctx, mesh)
  mesh.notes = vaseNotes(ctx, mesh)
  mesh.ms = now() - started
  return mesh
}

function buildSmooth(ctx, q, budget, options) {
  const { p, H, R, secA, secB, rotation, rotationRate, blend, layers, round } = ctx
  const hollow = p.body === 'hollow'
  const maxR = p.diameter / 2
  const detail = q.detail

  // Columns: what the body, the cross-section and the finest pattern need.
  const needs = [Math.max(q.smooth, Math.ceil(Math.PI / Math.acos(1 - Math.min(0.5, q.tol / maxR))))]
  let align = 1
  for (const s of secB ? [p.section, p.section2] : [p.section]) {
    if (s.type === 'polygon') needs.push(s.sides * Math.ceil((s.round > 0 ? 24 : 8) * detail))
    if (s.type === 'star') needs.push(2 * s.sides * Math.ceil(8 * detail))
    if (s.type === 'wave') needs.push(s.waves * Math.ceil(16 * detail))
    if (s.type === 'super') needs.push(Math.ceil(360 * detail))
    const repeat = s.type === 'polygon' ? s.sides : s.type === 'star' ? 2 * s.sides : s.type === 'wave' ? (s.style === 'sharp' ? 2 : 1) * s.waves : 1
    const both = (align * repeat) / gcd(align, repeat)
    align = both <= 512 ? both : Math.max(align, repeat)
  }
  const sectionColumns = Math.max(...needs)
  for (const L of layers) needs.push(Math.ceil(L.count * L.samples[0] * detail))
  // Finer than half a line shows in no print.
  const finest = Math.ceil((TAU * maxR) / ((0.5 * p.lineWidth) / detail))
  let S = Math.min(MAX_COLUMNS, Math.max(sectionColumns, Math.min(finest, Math.max(...needs))))

  // Rows: by the curvature of the body form, the twist, the change of cross-section and the patterns.
  const sections = secB ? [secA, secB] : [secA]
  const probe = columnAngles(256, sections)
  let meanA = 0, meanB = 0
  for (let j = 0; j < 256; j++) { meanA += secA.at(probe[j]); if (secB) meanB += secB.at(probe[j]) }
  meanA /= 256; meanB /= 256
  const meanRadius = (z) => R(z) * (secB ? meanA + (meanB - meanA) * blend(z) : meanA)
  let contour = 0
  { let prev = R(0); for (let k = 1; k <= 256; k++) { const r = R((H * k) / 256); contour += Math.hypot(H / 256, r - prev); prev = r } }
  const turning = !round || layers.length > 0
  const wallStep = (z) => {
    let step = q.maxStep
    const e = Math.min(1, H / 200)
    const curve = Math.abs(R(Math.min(H, z + e)) - 2 * R(z) + R(Math.max(0, z - e))) / (e * e)
    if (curve > 1e-9) step = Math.min(step, Math.sqrt((8 * q.tol) / curve))
    if (turning && rotationRate > 0) step = Math.min(step, Math.sqrt((8 * q.tol) / maxR) / rotationRate)
    if (secB && z >= ctx.mA - 1e-6 && z <= ctx.mB + 1e-6) step = Math.min(step, Math.max(0.5, (ctx.mB - ctx.mA) / (24 * detail)))
    return step
  }
  const outerStep = (z) => {
    let step = wallStep(z)
    for (const L of layers) {
      if (bandWeight(z, H, L.from, L.to, L.fade) <= 0 && bandWeight(z + step, H, L.from, L.to, L.fade) <= 0) continue
      const cell = L.pattern === 'rings' ? contour / L.count : ((TAU * meanRadius(z)) / L.count) * L.aspect
      if (L.samples[1] > 0) step = Math.min(step, cell / (L.samples[1] * detail))
      // A pattern that turns or swings moves sideways from row to row: not more than a point of its cell.
      const drift = L.count * (Math.abs(L.turn) / H + (L.pattern === 'ribs' ? (L.wave * TAU * L.waveCount) / H : 0))
      if (L.samples[0] > 0 && drift > 0) step = Math.min(step, 1.5 / (L.samples[0] * detail * drift))
      if (L.fade > 0 && (L.from > 0 || L.to < 100)) step = Math.min(step, Math.max(0.5, L.fade / 4))
    }
    return step
  }
  // Finer than half a layer shows in no print.
  const minStep = Math.max(0.08, p.layerHeight / 2)
  let zs = rowsBetween(0, H, outerStep, 1, minStep)
  const floorZ = hollow ? Math.min(p.bottom, H / 2) : 0
  let innerZs = hollow ? rowsBetween(floorZ, H, wallStep, 1, minStep) : null
  let reduced = false
  // The budget counts the whole grid; the plain parts of a patterned wall then take fewer triangles still (wallTriangles).
  const triangles = () => 2 * S * (zs.length - 1 + (innerZs ? innerZs.length + 3 : 2))
  if (triangles() > budget) {
    // Too fine for the budget: columns and rows grow coarser by the same share, never below what the body needs.
    reduced = true
    const f = Math.sqrt(triangles() / budget)
    S = Math.max(Math.min(sectionColumns, S), Math.round(S / f))
    for (let scale = f, round2 = 0; round2 < 6; round2++) {
      zs = rowsBetween(0, H, outerStep, scale, minStep)
      if (triangles() <= budget * 1.05) break
      scale *= Math.max(1.05, triangles() / budget)
    }
  }
  // Corners on columns; with patterns also a multiple of eight, for the blocks the plain parts of the wall are
  // made of; with grooves an even number of columns per groove, so each has its deepest line and all are alike.
  const lcm = (a, b) => (a * b) / gcd(a, b)
  if (layers.length && lcm(align, 8) <= S) align = lcm(align, 8)
  for (const L of layers) if (L.pattern === 'ribs' && lcm(align, 2 * L.count) <= 1.5 * S) align = lcm(align, 2 * L.count)
  if (align > 1 && align <= S) S = Math.min(MAX_COLUMNS - (MAX_COLUMNS % align), Math.ceil(S / align) * align)
  const rows = zs.length - 1

  // Per column: where it stands, and both cross-sections there.
  const angles = columnAngles(S, sections)
  const cosT = new Float64Array(S), sinT = new Float64Array(S), sa = new Float64Array(S), sb = secB ? new Float64Array(S) : null
  const tiltA = new Float64Array(S), tiltB = secB ? new Float64Array(S) : null
  for (let j = 0; j < S; j++) {
    const th = angles[j]
    cosT[j] = Math.cos(th); sinT[j] = Math.sin(th)
    sa[j] = secA.at(th)
    tiltA[j] = Math.min(3, Math.hypot(1, (secA.at(th + 1e-3) - secA.at(th - 1e-3)) / 2e-3 / sa[j]))
    if (secB) {
      sb[j] = secB.at(th)
      tiltB[j] = Math.min(3, Math.hypot(1, (secB.at(th + 1e-3) - secB.at(th - 1e-3)) / 2e-3 / sb[j]))
    }
  }

  // Per row and layer: how strong the pattern is there, how far up it has run and how far it has turned.
  let conformal = 0, arc = 0
  const rowConformal = new Float64Array(rows + 1), rowArc = new Float64Array(rows + 1)
  for (let i = 1; i <= rows; i++) {
    const r0 = R(zs[i - 1]), r1 = R(zs[i])
    const ds = Math.hypot(zs[i] - zs[i - 1], r1 - r0)
    arc += ds
    // Counted by the radius there: a cell is as high as it is wide wherever it sits, so it keeps its form at the neck.
    conformal += ds / (0.5 * (meanRadius(zs[i - 1]) + meanRadius(zs[i])))
    rowArc[i] = arc
    rowConformal[i] = conformal
  }

  const innerRowCount = innerZs ? innerZs.length : 0
  const m = meshBuffers((rows + 1) * S + innerRowCount * S + 8 * S + 4, 2 * S * rows + 2 * S * Math.max(0, innerRowCount - 1) + 12 * S)
  const P = m.positions
  const base = new Float64Array(S), radius = new Float64Array(S)
  const perimeter = new Float64Array(rows + 1), area = new Float64Array(rows + 1)
  let minBottomRadius = Infinity, maxRadius = 0

  for (let i = 0; i <= rows; i++) {
    const z = zs[i], Rz = R(z), rot = rotation(z)
    const bl = secB ? blend(z) : 0
    if (secB && bl > 0) for (let j = 0; j < S; j++) base[j] = Rz * (sa[j] + (sb[j] - sa[j]) * bl)
    else for (let j = 0; j < S; j++) base[j] = Rz * sa[j]
    radius.set(base)
    for (const L of layers) {
      const weight = bandWeight(z, H, L.from, L.to, L.fade)
      if (weight <= 0) continue
      const depth = L.depth * weight
      const t = z / H
      const b = L.pattern === 'rings' ? (rowArc[i] / arc) * L.count : (rowConformal[i] * L.count) / (TAU * L.aspect)
      const shift = L.count * L.turn * t + (L.pattern === 'ribs' && L.wave > 0 ? L.wave * Math.sin(TAU * L.waveCount * t) : 0)
      if (L.once) L.rowBand = (z - (L.from / 100) * H) / (((L.to - L.from) / 100) * H)
      const step = L.count / S, fn = L.fn
      if (L.invert) for (let j = 0; j < S; j++) radius[j] += depth * (1 - fn(j * step + shift, b, L, j * step - shift))
      else for (let j = 0; j < S; j++) radius[j] += depth * fn(j * step + shift, b, L, j * step - shift)
    }
    const c = Math.cos(rot), s = Math.sin(rot)
    let o = i * S * 3
    let firstX = 0, firstY = 0, prevX = 0, prevY = 0, per = 0, twiceArea = 0
    for (let j = 0; j < S; j++) {
      // No pattern goes deeper than a third of the body there: the wall never folds through the middle.
      const r = Math.max(radius[j], base[j] * 0.667)
      if (r > maxRadius) maxRadius = r
      if (i === 0 && r < minBottomRadius) minBottomRadius = r
      const x = r * (cosT[j] * c - sinT[j] * s), y = r * (sinT[j] * c + cosT[j] * s)
      P[o] = x; P[o + 1] = y; P[o + 2] = z
      o += 3
      if (j === 0) { firstX = x; firstY = y } else { per += Math.hypot(x - prevX, y - prevY); twiceArea += prevX * y - x * prevY }
      prevX = x; prevY = y
    }
    perimeter[i] = per + Math.hypot(firstX - prevX, firstY - prevY)
    area[i] = 0.5 * (twiceArea + prevX * firstY - firstX * prevY)
  }
  m.v = (rows + 1) * S
  // The normals come from the whole grid, so a simplified wall is shaded as finely as a full one.
  if (layers.length && options.simplify !== false) wallTriangles(m, S, rows, q.tol)
  else for (let i = 0; i < rows; i++) m.stripShort(i * S, (i + 1) * S, S)
  gridNormals(m, 0, S, rows + 1, 1)
  const outerTop = rows * S
  const weldStart = hollow ? m.v + innerRowCount * S : m.v
  const weld = []
  const ringCopy = (from, nx, ny, nz) => { for (let j = 0; j < S; j++) weld.push(from + j); return m.copyRing(from, S, nx, ny, nz) }
  const own = (count) => { for (let j = 0; j < count; j++) weld.push(-1) }

  let inner = null
  if (!hollow) {
    const bottom = ringCopy(0, 0, 0, -1), top = ringCopy(outerTop, 0, 0, 1)
    own(2)
    m.fan(m.point(0, 0, 0, 0, 0, -1), bottom, S, true)
    m.lid = m.i
    m.fan(m.point(0, 0, H, 0, 0, 1), top, S, false)
  } else {
    // Inner wall: smooth, behind the deepest place of the patterns, `wall` away measured square to the surface.
    const innerStart = m.v
    const innerArea = new Float64Array(innerRowCount)
    let thinnest = Infinity, narrow = false
    for (let i = 0; i < innerRowCount; i++) {
      const z = innerZs[i], Rz = R(z), rot = rotation(z)
      const bl = secB ? blend(z) : 0
      const e = Math.min(0.5, H / 400)
      const slope = (R(Math.min(H, z + e)) - R(Math.max(0, z - e))) / (Math.min(H, z + e) - Math.max(0, z - e))
      const tiltZ = Math.hypot(1, slope)
      let inward = 0
      for (const L of layers) if (L.depth < 0) inward += -L.depth * bandWeight(z, H, L.from, L.to, L.fade)
      const c = Math.cos(rot), s = Math.sin(rot)
      let firstX = 0, firstY = 0, prevX = 0, prevY = 0, twiceArea = 0
      for (let j = 0; j < S; j++) {
        const sec = secB ? sa[j] + (sb[j] - sa[j]) * bl : sa[j]
        const tilt = secB ? tiltA[j] + (tiltB[j] - tiltA[j]) * bl : tiltA[j]
        const outer = Rz * sec
        const gap = Math.min(inward, outer / 3) + p.wall * Math.min(3, tiltZ * tilt)
        let r = outer - gap
        if (r < 0.5) { r = 0.5; narrow = true }
        if (outer - r < thinnest) thinnest = outer - r
        const x = r * (cosT[j] * c - sinT[j] * s), y = r * (sinT[j] * c + cosT[j] * s)
        m.point(x, y, z, 0, 0, 0)
        if (j === 0) { firstX = x; firstY = y } else twiceArea += prevX * y - x * prevY
        prevX = x; prevY = y
      }
      innerArea[i] = 0.5 * (twiceArea + prevX * firstY - firstX * prevY)
    }
    for (let i = 0; i < innerRowCount - 1; i++) m.strip(innerStart + i * S, innerStart + (i + 1) * S, S, true, rotation(innerZs[i + 1]) > rotation(innerZs[i]))
    gridNormals(m, innerStart, S, innerRowCount, -1)
    const innerTop = innerStart + (innerRowCount - 1) * S
    m.strip(ringCopy(outerTop, 0, 0, 1), ringCopy(innerTop, 0, 0, 1), S, false)
    // The hole stays inside the floor, a millimetre of floor round it.
    let floorRadius = Infinity
    for (let j = 0; j < S; j++) floorRadius = Math.min(floorRadius, Math.hypot(P[(innerStart + j) * 3], P[(innerStart + j) * 3 + 1]))
    const hole = floorZ > 0 && p.hole > 0 ? Math.min(p.hole / 2, floorRadius - 1) : 0
    if (floorZ <= 0) {
      // No bottom: only the ring between the two walls.
      m.strip(ringCopy(0, 0, 0, -1), ringCopy(innerStart, 0, 0, -1), S, true)
    } else if (hole > 0.2) {
      const rot = rotation(floorZ), c = Math.cos(rot), s = Math.sin(rot)
      const lower = m.v
      own(2 * S)
      for (let j = 0; j < S; j++) m.point(hole * cosT[j], hole * sinT[j], 0, -cosT[j], -sinT[j], 0)
      const upper = m.v
      for (let j = 0; j < S; j++) {
        const x = cosT[j] * c - sinT[j] * s, y = sinT[j] * c + cosT[j] * s
        m.point(hole * x, hole * y, floorZ, -x, -y, 0)
      }
      m.strip(lower, upper, S, true)
      m.strip(ringCopy(0, 0, 0, -1), ringCopy(lower, 0, 0, -1), S, true)
      m.strip(ringCopy(innerStart, 0, 0, 1), ringCopy(upper, 0, 0, 1), S, false)
    } else {
      const bottom = ringCopy(0, 0, 0, -1), floor = ringCopy(innerStart, 0, 0, 1)
      own(2)
      m.fan(m.point(0, 0, 0, 0, 0, -1), bottom, S, true)
      m.fan(m.point(0, 0, floorZ, 0, 0, 1), floor, S, false)
    }
    inner = { zs: innerZs, area: innerArea, thinnest, narrow, hole: hole > 0.2 ? hole : 0, floorZ }
  }

  return finish(m, { S, rows, zs, perimeter, area, inner, weldStart, weld, reduced, flat: false, minBottomRadius, maxRadius, contour: arc })
}

/** Facets: few points round and up, shifted at random, every face flat. Rim and bottom stay level. */
function buildFacets(ctx) {
  const { p, H, R, secA, secB, rotation, blend } = ctx
  const S = p.lowAround, rows = p.lowRows
  const hollow = p.body === 'hollow'
  const sectionAt = (th, z) => {
    const local = th - rotation(z)
    const a = secA.at(local)
    return secB ? a + (secB.at(local) - a) * blend(z) : a
  }
  const zs = new Float64Array(rows + 1)
  for (let i = 0; i <= rows; i++) zs[i] = (H * i) / rows
  const floorZ = hollow ? Math.min(p.bottom, H / 2) : 0
  const innerRows = hollow ? Math.max(2, Math.min(rows, Math.ceil((H - floorZ) / (H / rows)))) : 0
  const m = meshBuffers((rows + 1) * S + (innerRows + 1) * S + 8 * S + 4, 2 * S * rows + 2 * S * innerRows + 12 * S)
  const perimeter = new Float64Array(rows + 1), area = new Float64Array(rows + 1)
  const topAngles = new Float64Array(S)
  let minBottomRadius = Infinity, maxRadius = 0
  for (let i = 0; i <= rows; i++) {
    let firstX = 0, firstY = 0, prevX = 0, prevY = 0, per = 0, twiceArea = 0
    for (let j = 0; j < S; j++) {
      let th = (TAU * j) / S, z = zs[i]
      if (p.lowJitter > 0) {
        th += (hash(j, i, p.lowSeed) - 0.5) * p.lowJitter * (TAU / S)
        if (i > 0 && i < rows) z += (hash(j, i, p.lowSeed + 31) - 0.5) * p.lowJitter * (H / rows)
      }
      if (i === rows) topAngles[j] = th
      const r = R(z) * sectionAt(th, z)
      if (r > maxRadius) maxRadius = r
      if (i === 0 && r < minBottomRadius) minBottomRadius = r
      const x = r * Math.cos(th), y = r * Math.sin(th)
      m.point(x, y, z, 0, 0, 0)
      if (j === 0) { firstX = x; firstY = y } else { per += Math.hypot(x - prevX, y - prevY); twiceArea += prevX * y - x * prevY }
      prevX = x; prevY = y
    }
    perimeter[i] = per + Math.hypot(firstX - prevX, firstY - prevY)
    area[i] = 0.5 * (twiceArea + prevX * firstY - firstX * prevY)
  }
  for (let i = 0; i < rows; i++) m.strip(i * S, (i + 1) * S, S, false, i % 2 === 1)
  gridNormals(m, 0, S, rows + 1, 1)
  const outerTop = rows * S
  const weldStart = hollow ? m.v + (innerRows + 1) * S : m.v
  const weld = []
  const ringCopy = (from, nx, ny, nz) => { for (let j = 0; j < S; j++) weld.push(from + j); return m.copyRing(from, S, nx, ny, nz) }
  let inner = null
  if (!hollow) {
    const bottom = ringCopy(0, 0, 0, -1), top = ringCopy(outerTop, 0, 0, 1)
    weld.push(-1, -1)
    m.fan(m.point(0, 0, 0, 0, 0, -1), bottom, S, true)
    m.lid = m.i
    m.fan(m.point(0, 0, H, 0, 0, 1), top, S, false)
  } else {
    // Inner wall under the facets: every facet lies inside the smooth body by at most the sag of its chords.
    const sag = Math.cos(Math.min(1.4, ((1 + p.lowJitter) * Math.PI) / S))
    const reach = ((1 + p.lowJitter) * H) / rows
    const innerStart = m.v
    const innerZs = new Float64Array(innerRows + 1), innerArea = new Float64Array(innerRows + 1)
    let thinnest = Infinity, narrow = false
    for (let i = 0; i <= innerRows; i++) {
      const z = floorZ + ((H - floorZ) * i) / innerRows
      innerZs[i] = z
      let firstX = 0, firstY = 0, prevX = 0, prevY = 0, twiceArea = 0
      for (let j = 0; j < S; j++) {
        const th = topAngles[j]
        let low = Infinity
        for (let dz = -1; dz <= 1; dz++) for (let dt = -1; dt <= 1; dt++) {
          const zz = clamp(z + dz * reach, 0, H)
          low = Math.min(low, R(zz) * sectionAt(th + (dt * (1 + p.lowJitter) * TAU) / S, zz))
        }
        let r = low * sag - p.wall
        if (r < 0.5) { r = 0.5; narrow = true }
        thinnest = Math.min(thinnest, low * sag - r)
        const x = r * Math.cos(th), y = r * Math.sin(th)
        m.point(x, y, z, 0, 0, 0)
        if (j === 0) { firstX = x; firstY = y } else twiceArea += prevX * y - x * prevY
        prevX = x; prevY = y
      }
      innerArea[i] = 0.5 * (twiceArea + prevX * firstY - firstX * prevY)
    }
    for (let i = 0; i < innerRows; i++) m.strip(innerStart + i * S, innerStart + (i + 1) * S, S, true)
    gridNormals(m, innerStart, S, innerRows + 1, -1)
    const innerTop = innerStart + innerRows * S
    m.strip(ringCopy(outerTop, 0, 0, 1), ringCopy(innerTop, 0, 0, 1), S, false)
    if (floorZ <= 0) m.strip(ringCopy(0, 0, 0, -1), ringCopy(innerStart, 0, 0, -1), S, true)
    else {
      const bottom = ringCopy(0, 0, 0, -1), floor = ringCopy(innerStart, 0, 0, 1)
      weld.push(-1, -1)
      m.fan(m.point(0, 0, 0, 0, 0, -1), bottom, S, true)
      m.fan(m.point(0, 0, floorZ, 0, 0, 1), floor, S, false)
    }
    inner = { zs: innerZs, area: innerArea, thinnest, narrow, hole: 0, floorZ }
  }
  let contour = 0
  { let prev = R(0); for (let k = 1; k <= 256; k++) { const r = R((H * k) / 256); contour += Math.hypot(H / 256, r - prev); prev = r } }
  return finish(m, { S, rows, zs, perimeter, area, inner, weldStart, weld, reduced: false, flat: true, minBottomRadius, maxRadius, contour })
}

function finish(m, grid) {
  return {
    positions: m.positions.subarray(0, m.v * 3),
    normals: m.normals.subarray(0, m.v * 3),
    indices: m.indices.subarray(0, m.i),
    vertexCount: m.v,
    triangleCount: m.i / 3,
    /**
     * A solid body closes with a lid the slicer's vase mode leaves out: its triangles come last, from this
     * index on, so a view can show the vase open as it prints. Without a lid: the number of indices.
     */
    lidStart: m.lid ?? m.i,
    /** Points from `weldStart` on are copies for shading: `weld[k]` is the point they stand on, or -1 for a point of their own. */
    weldStart: grid.weldStart,
    weld: Int32Array.from(grid.weld),
    flat: grid.flat,
    grid,
  }
}

/** Key figures: size, weight, filament, time, what it holds, and how it leans. */
function vaseStats(ctx, mesh) {
  const { p, H } = ctx
  const { S, rows, zs, perimeter, area, inner, minBottomRadius, maxRadius } = mesh.grid
  const N = mesh.normals
  // Leaning out (an overhang) and leaning in, as the sine of the angle against the upright, from the wall's normals.
  // A few steep points are not a steep wall: the lean counts that 0.5 % of the wall goes beyond.
  const BINS = 256
  const outBins = new Uint32Array(BINS + 1), inBins = new Uint32Array(BINS + 1)
  let samples = 0
  if (!mesh.flat) {
    for (let i = 1; i < rows; i++) {
      for (let j = 0, o = i * S * 3 + 2; j < S; j++, o += 3) {
        const nz = N[o]
        if (nz < 0) outBins[(-nz * BINS) | 0]++
        else inBins[(nz * BINS) | 0]++
      }
    }
    samples = S * (rows - 1)
  } else {
    // Facets: each triangle of the wall has its own lean.
    const P = mesh.positions, I = mesh.indices
    for (let t = 0; t < 2 * S * rows; t++) {
      const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2]
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const sin = -nz / (Math.hypot(nx, ny, nz) || 1)
      if (sin > 0) outBins[(Math.min(1, sin) * BINS) | 0]++
      else inBins[(Math.min(1, -sin) * BINS) | 0]++
    }
    samples = 2 * S * rows
  }
  const limit = Math.sin((p.maxOverhang * Math.PI) / 180)
  const steepest = (bins) => {
    let seen = 0
    for (let k = BINS; k > 0; k--) {
      seen += bins[k]
      if (seen > samples * 0.005) return Math.min(1, (k + 0.5) / BINS)
    }
    return 0
  }
  let over = 0
  for (let k = Math.ceil(limit * BINS); k <= BINS; k++) over += outBins[k]
  const worstOut = steepest(outBins), worstIn = steepest(inBins)
  // The body form alone, without cross-section and patterns: where it widens faster than the limit.
  const ranges = []
  let bodyOut = 0
  for (let k = 1; k < 400; k++) {
    const z = (H * k) / 400, e = H / 800
    const slope = (ctx.R(z + e) - ctx.R(z - e)) / (2 * e)
    const sin = slope / Math.hypot(1, slope)
    if (sin > bodyOut) bodyOut = sin
    if (sin > limit) {
      const last = ranges[ranges.length - 1]
      if (last && k - last.k <= 1) { last.to = z; last.k = k } else ranges.push({ from: z, to: z, k })
    }
  }
  const degrees = (sin) => (Math.asin(Math.min(1, sin)) * 180) / Math.PI
  const lean = Math.max(worstOut, worstIn)
  // One line on the next: how much of its width still lies on the line below at the steepest place.
  const shift = lean >= 0.9999 ? Infinity : (p.layerHeight * lean) / Math.sqrt(1 - lean * lean)
  const overlap = Math.max(0, 1 - shift / p.lineWidth)

  let path = 0, wallArea = 0, outerVolume = 0, moment = 0, mass = 0
  for (let i = 0; i < rows; i++) {
    const dz = zs[i + 1] - zs[i]
    const per = 0.5 * (perimeter[i] + perimeter[i + 1])
    path += (per * dz) / p.layerHeight
    wallArea += per * dz
    outerVolume += 0.5 * (area[i] + area[i + 1]) * dz
    moment += per * dz * 0.5 * (zs[i] + zs[i + 1])
    mass += per * dz
  }
  let volume, capacity = 0, seconds
  const vaseMode = p.body === 'solid'
  if (vaseMode) {
    // The slicer's vase mode: one line along the wall, and a bottom as thick as set.
    const bottom = area[0] * p.bottom
    volume = path * p.lineWidth * p.layerHeight + bottom
    for (let i = 0; i < rows; i++) {
      if (zs[i + 1] <= p.bottom) continue
      const from = Math.max(zs[i], p.bottom)
      capacity += Math.max(0, 0.5 * (area[i] + area[i + 1]) - 0.5 * (perimeter[i] + perimeter[i + 1]) * p.lineWidth) * (zs[i + 1] - from)
    }
    seconds = (path + bottom / (p.lineWidth * p.layerHeight)) / p.speed
  } else {
    let cavity = 0
    for (let i = 0; i < inner.zs.length - 1; i++) cavity += 0.5 * (inner.area[i] + inner.area[i + 1]) * (inner.zs[i + 1] - inner.zs[i])
    const holeVolume = Math.PI * inner.hole * inner.hole * inner.floorZ
    // Open at the bottom, the inside runs from the bed up: all of it is the cavity.
    volume = Math.max(0, outerVolume - cavity - holeVolume)
    capacity = inner.floorZ > 0 && inner.hole === 0 ? cavity : 0
    seconds = volume / (p.lineWidth * p.layerHeight) / p.speed
  }
  const density = MATERIALS[p.material] ?? MATERIALS.pla
  const centre = mass > 0 ? moment / mass : H / 2
  return {
    triangles: mesh.triangleCount,
    vertices: mesh.vertexCount,
    columns: S,
    rows,
    stlBytes: 84 + 50 * mesh.triangleCount,
    width: 2 * maxRadius,
    height: H,
    vaseMode,
    grams: (volume / 1000) * density,
    meters: volume / (Math.PI * (FILAMENT / 2) ** 2) / 1000,
    minutes: seconds / 60,
    capacityMl: capacity / 1000,
    /** The steepest overhang of the wall with its patterns, the share of the wall beyond the limit, and the body form's own. */
    overhang: degrees(worstOut),
    overhangShare: over / Math.max(1, samples),
    bodyOverhang: degrees(bodyOut),
    overhangRanges: ranges.slice(0, 3).map((r) => ({ from: r.from, to: r.to })),
    inwardLean: degrees(worstIn),
    overlap,
    tipAngle: (Math.atan2(minBottomRadius, centre) * 180) / Math.PI,
    thinnestWall: inner ? inner.thinnest : p.lineWidth,
    /** How far apart the points of the wall are at its widest, round and up: what the mesh can show. */
    resolution: { around: (TAU * maxRadius) / S, up: H / rows },
  }
}

/**
 * What to look out for when printing, as codes with their numbers (the page says them in its language):
 * { level: 'warn' | 'info', code, ... }.
 */
function vaseNotes(ctx, mesh) {
  const { p, layers } = ctx
  const s = mesh.stats
  const notes = []
  // The body form too steep needs supports; a pattern too steep only over its own depth mostly prints, but roughly.
  if (s.bodyOverhang > p.maxOverhang + 0.5) notes.push({ level: 'warn', code: 'overhang', degrees: Math.round(s.bodyOverhang), limit: p.maxOverhang, ranges: s.overhangRanges })
  else if (s.overhang > Math.max(p.maxOverhang, 55) && s.overhangShare > 0.01) notes.push({ level: s.overhang > 65 ? 'warn' : 'info', code: 'patternOverhang', degrees: Math.round(s.overhang), limit: p.maxOverhang, share: s.overhangShare })
  if (s.vaseMode && s.overlap < 0.3) notes.push({ level: 'warn', code: 'overlap', percent: Math.round(s.overlap * 100) })
  if (s.tipAngle < 12) notes.push({ level: 'warn', code: 'tippy', degrees: Math.round(s.tipAngle) })
  if (!s.vaseMode) {
    if (mesh.grid.inner.narrow) notes.push({ level: 'warn', code: 'narrow' })
    else if (p.wall < 2 * p.lineWidth - 1e-6) notes.push({ level: 'warn', code: 'thinWall', wall: p.wall, lines: 2 * p.lineWidth })
    if (p.bottom === 0) notes.push({ level: 'info', code: 'openBottom' })
    else if (p.bottom < 0.8) notes.push({ level: 'warn', code: 'thinBottom', bottom: p.bottom })
    if (p.hole > 0 && mesh.grid.inner.hole === 0 && p.bottom > 0) notes.push({ level: 'info', code: 'noHole' })
  }
  layers.forEach((L, index) => {
    const cell = (Math.PI * p.diameter) / L.count
    const feature = L.pattern === 'rings' ? (mesh.grid.contour / L.count) * L.width : cell * Math.min(1, L.width)
    if (feature < p.lineWidth) notes.push({ level: 'warn', code: 'tooFine', layer: index, pattern: L.pattern, mm: feature, line: p.lineWidth })
    if (Math.abs(L.depth) < 0.3) notes.push({ level: 'info', code: 'shallow', layer: index, pattern: L.pattern, mm: Math.abs(L.depth) })
  })
  if (mesh.grid.reduced) notes.push({ level: 'info', code: 'reduced', around: s.resolution.around, up: s.resolution.up })
  if (s.vaseMode) notes.push({ level: 'info', code: 'vaseMode', bottomLayers: Math.max(1, Math.ceil(p.bottom / p.layerHeight)), line: p.lineWidth })
  return notes
}

/** The radius of the outer wall without patterns at an angle and a height: for accessories built round the vase. */
export function vaseSampler(input) {
  const ctx = prepare(normalizeParams(input))
  const { R, secA, secB, rotation, blend } = ctx
  return (theta, z) => {
    const local = theta - rotation(z)
    const a = secA.at(local)
    return R(z) * (secB ? a + (secB.at(local) - a) * blend(z) : a)
  }
}
