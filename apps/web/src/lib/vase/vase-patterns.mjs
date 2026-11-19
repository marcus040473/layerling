/**
 * Patterns of the vase's wall that are worked out on the wall itself: rings, honeycomb, bumps, a hammered face,
 * scales, knitting, a weave, bricks and a rough grain.
 *
 * Each is a height between 0 and 1 over the unrolled wall. `a` runs round the vase in cells, a whole number of
 * them, so a pattern closes without a seam; `b` runs up the wall in cells. The wall is a grid of rows and
 * columns already, so a pattern only moves the grid's own points in or out: nothing is subdivided, cut or
 * repaired afterwards, the mesh stays closed by the way it is built, and the pattern comes with every bottom,
 * lid, leg and cut-out the vase has. A body with a Surface Texture is a finished mesh that is refined and
 * mended for seconds; a pattern here costs what its points cost.
 *
 * A cell is as high as it is wide wherever it sits (`patternCoordinates` counts the height by the radius
 * there), so a honeycomb gets smaller at the neck instead of squeezed.
 *
 * No objects are made per point: a pattern that needs more than its two coordinates reads it from the prepared
 * layer `L`.
 */

/** The patterns, by the names the settings use. */
export const PATTERNS = { ringe: 'Ringe', waben: 'Waben', noppen: 'Noppen', gehaemmert: 'Gehämmert', schuppen: 'Schuppen', strick: 'Strick', geflecht: 'Geflecht', ziegel: 'Ziegel', rauschen: 'Rauschen' }
/** How a groove, a joint, a bump or a strand falls off from its middle to its edge. */
export const PATTERN_FLANKS = { rund: 'Rund', spitz: 'Spitz', flach: 'Flach', gewoelbt: 'Gewölbt' }
/** Into the wall, or standing out of it. */
export const PATTERN_WAYS = { innen: 'Nach innen', aussen: 'Nach außen' }

/** What suits each pattern when it is first chosen: how many round the vase, how deep, how wide, which way. */
export const PATTERN_STARTERS = {
  ringe: { count: 24, depth: 1, width: 0.5, aspect: 1, flank: 'rund', way: 'innen' },
  waben: { count: 22, depth: 0.9, width: 0.28, aspect: 1, flank: 'rund', way: 'innen' },
  noppen: { count: 26, depth: 1, width: 0.8, aspect: 1, flank: 'gewoelbt', way: 'aussen' },
  gehaemmert: { count: 18, depth: 0.8, width: 1, aspect: 1, flank: 'rund', way: 'innen' },
  schuppen: { count: 18, depth: 0.9, width: 0.4, aspect: 1, flank: 'rund', way: 'aussen' },
  strick: { count: 30, depth: 0.9, width: 0.5, aspect: 0.8, flank: 'gewoelbt', way: 'aussen' },
  geflecht: { count: 20, depth: 1, width: 0.8, aspect: 1, flank: 'gewoelbt', way: 'aussen' },
  ziegel: { count: 14, depth: 0.8, width: 0.14, aspect: 0.5, flank: 'flach', way: 'innen' },
  rauschen: { count: 24, depth: 1, width: 1, aspect: 1, flank: 'rund', way: 'aussen' },
}

/** The settings of the two pattern places: the vase's pattern itself (`effect`) and a second one over it (`effect2`). */
const SLOTS = [
  { choice: 'effect', prefix: 'pattern', from: 'zoneFrom', to: 'zoneTo' },
  { choice: 'effect2', prefix: 'pattern2', from: 'zone2From', to: 'zone2To' },
]

/**
 * The settings a pattern starts with, as a change of the vase's settings: for the first place (`slot` 0, the
 * vase's own pattern) or the second. Empty for anything that is not one of these patterns.
 */
export function patternStarter(pattern, slot = 0) {
  const starter = PATTERN_STARTERS[pattern]
  if (!starter) return {}
  const prefix = SLOTS[slot === 1 ? 1 : 0].prefix
  return { [`${prefix}Count`]: starter.count, [`${prefix}Depth`]: starter.depth, [`${prefix}Width`]: starter.width, [`${prefix}Aspect`]: starter.aspect, [`${prefix}Flank`]: starter.flank, [`${prefix}Way`]: starter.way }
}

/** The patterns a vase has, from its settings: none, one or two, each with its own height band. */
export function patternSlots(p) {
  const out = []
  for (const slot of SLOTS) {
    const pattern = p[slot.choice]
    if (!PATTERNS[pattern]) continue
    const depth = p[`${slot.prefix}Depth`]
    const from = p[slot.from], to = p[slot.to]
    if (!(depth > 0) || to - from < 1e-6) continue
    out.push({
      pattern,
      count: p[`${slot.prefix}Count`],
      // Above 0 the wall moves outwards, below 0 inwards.
      depth: p[`${slot.prefix}Way`] === 'aussen' ? depth : -depth,
      width: p[`${slot.prefix}Width`],
      aspect: p[`${slot.prefix}Aspect`],
      flank: p[`${slot.prefix}Flank`],
      turn: p[`${slot.prefix}Turn`],
      flip: p[`${slot.prefix}Flip`] === 'ja',
      seed: p[`${slot.prefix}Seed`],
      wave: p[`${slot.prefix}Wave`],
      waves: p[`${slot.prefix}Waves`],
      from,
      to,
      fade: p.zoneFade,
    })
  }
  return out
}

const SQRT3 = Math.sqrt(3)

/** Height over the distance from the middle of a feature (0) to its edge (1). */
function fall(x, flank) {
  if (x >= 1) return 0
  if (flank === 1) return 1 - x
  if (flank === 2) return x <= 0.75 ? 1 : (1 - x) * 4
  if (flank === 3) return Math.sqrt(1 - x * x)
  return 0.5 + 0.5 * Math.cos(Math.PI * x)
}

/** Height over the distance to a cell's border, in cells: 0 on the border, 1 from `gap` inwards. */
function rise(edge, gap, flank) {
  return edge >= gap ? 1 : edge <= 0 ? 0 : fall(1 - edge / gap, flank)
}

function hash(i, j, seed) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function ringe(a, b, L) {
  const y = L.wave > 0 ? b + L.wave * Math.sin((2 * Math.PI * L.waves * a) / L.count) : b
  const f = y - Math.floor(y)
  return fall(Math.abs(f - 0.5) / L.half, L.flank)
}

// The nearer of the two hexagon grids' centres, as an offset; `hexX`, `hexY` carry it out without an object.
let hexX = 0, hexY = 0
function hexOffset(a, b) {
  const y = b / SQRT3
  const ax = a - Math.floor(a) - 0.5, ay = (y - Math.floor(y) - 0.5) * SQRT3
  const bx = a + 0.5 - Math.floor(a + 0.5) - 0.5, by = (y + 0.5 - Math.floor(y + 0.5) - 0.5) * SQRT3
  if (ax * ax + ay * ay < bx * bx + by * by) { hexX = ax; hexY = ay } else { hexX = bx; hexY = by }
}

function waben(a, b, L) {
  hexOffset(a, b)
  const x = Math.abs(hexX), y = Math.abs(hexY)
  return rise(0.5 - Math.max(x, 0.5 * x + (SQRT3 / 2) * y), L.half, L.flank)
}

function noppen(a, b, L) {
  hexOffset(a, b)
  return fall(Math.hypot(hexX, hexY) / L.half, L.flank)
}

// Hammered: one point per cell of a grid, a whole number of cells round; a dent round each. The points of the
// three rows round the row a point lies in are kept, so a row of the wall hashes each of them once.
function gehaemmert(a, b, L) {
  const n = L.count
  const ci = Math.floor(a), cj = Math.floor(b)
  if (L.seedRow !== cj) {
    L.seedRow = cj
    if (!L.seedX || L.seedX.length !== 3 * n) { L.seedX = new Float64Array(3 * n); L.seedY = new Float64Array(3 * n) }
    for (let dj = 0; dj < 3; dj++) {
      for (let i = 0; i < n; i++) {
        L.seedX[dj * n + i] = i + 0.2 + 0.6 * hash(i, cj + dj - 1, L.seed)
        L.seedY[dj * n + i] = cj + dj - 1 + 0.2 + 0.6 * hash(i, cj + dj - 1, L.seed + 7919)
      }
    }
  }
  const first = ((ci - 1) % n + n) % n
  let best = Infinity
  for (let dj = 0; dj < 3; dj++) {
    for (let di = 0, w = first; di < 3; di++) {
      // The cell's own number round the vase, and how many turns away it is counted here.
      const px = L.seedX[dj * n + w] + (ci - 1 + di - w), py = L.seedY[dj * n + w]
      const d = (px - a) * (px - a) + (py - b) * (py - b)
      if (d < best) best = d
      if (++w === n) w = 0
    }
  }
  const d = Math.sqrt(best) / 0.72
  return d >= 1 ? 0 : 1 - d * d
}

// Scales: discs half a cell in radius, in rows half a cell apart, every other row shifted by half a cell.
// A higher row lies over the one below it, so of the discs a point lies in, the highest shows.
function scaleHeight(dy) {
  const t = (0.25 - dy) / 0.75
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t)
}

function schuppen(a, b, L) {
  const y = L.flip ? -b : b
  let top = -1, edge = 0, under = 0
  for (let k = Math.floor(2 * (y + 0.5)); k >= Math.ceil(2 * (y - 0.5)); k--) {
    const shift = k & 1 ? 0.5 : 0
    const dx = a - shift - Math.round(a - shift), dy = y - k * 0.5
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d > 0.5) continue
    if (top < 0) { top = scaleHeight(dy); edge = 0.5 - d } else { under = scaleHeight(dy); break }
  }
  if (top < 0) return 0
  // Thickest at its free tip; the rim rolls off onto the scale under it.
  const soft = L.edge * 0.3
  if (edge >= soft) return top
  const w = edge / soft
  return under + (top - under) * w * w * (3 - 2 * w)
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay
  let t = ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - ax - t * vx, py - ay - t * vy)
}

function strick(a, b, L) {
  const x = a - Math.floor(a), y = b - Math.floor(b)
  // A stitch is a V: two legs from the bottom middle up to the sides; the stitches above and below reach in.
  let d = Infinity
  for (let k = -1; k <= 1; k++) {
    const left = segmentDistance(x, y, 0.5, k, 0.1, k + 1.15)
    const right = segmentDistance(x, y, 0.5, k, 0.9, k + 1.15)
    if (left < d) d = left
    if (right < d) d = right
  }
  return fall(d / (0.42 * L.width + 0.02), L.flank)
}

function geflecht(a, b, L) {
  const ia = Math.floor(a), ib = Math.floor(b)
  const x = a - ia, y = b - ib
  const over = (ia + ib) & 1 ? 1 : -1
  // One strand runs round, one runs up; where they cross, one arches over the other.
  const round = fall(Math.abs(y - 0.5) / L.half, L.flank) * (0.55 + over * 0.45 * Math.sin(Math.PI * x))
  const up = fall(Math.abs(x - 0.5) / L.half, L.flank) * (0.55 - over * 0.45 * Math.sin(Math.PI * y))
  return round > up ? round : up
}

function ziegel(a, b, L) {
  const row = Math.floor(b)
  const x = a + (row & 1 ? 0.5 : 0)
  const fx = x - Math.floor(x), fy = b - row
  return rise(Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy) * L.aspect), L.half, L.flank)
}

const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10)

function rauschen(a, b, L) {
  let sum = 0, weight = 0, amp = 1, freq = 1
  for (let o = 0; o < 4; o++) {
    const period = L.count * freq
    const x = a * freq, y = b * freq
    const ix = Math.floor(x), iy = Math.floor(y)
    const fx = ease(x - ix), fy = ease(y - iy)
    const i0 = ((ix % period) + period) % period, i1 = (i0 + 1) % period
    const seed = L.seed + o * 101
    const v00 = hash(i0, iy, seed), v01 = hash(i0, iy + 1, seed)
    const lower = v00 + (hash(i1, iy, seed) - v00) * fx
    const upper = v01 + (hash(i1, iy + 1, seed) - v01) * fx
    sum += amp * (lower + (upper - lower) * fy)
    weight += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / weight
}

const FUNCTIONS = { ringe, waben, noppen, gehaemmert, schuppen, strick, geflecht, ziegel, rauschen }
const FLANK_INDEX = { rund: 0, spitz: 1, flach: 2, gewoelbt: 3 }

/**
 * How many points of the wall a cell needs round the vase and up it, so the pattern comes out as it is meant:
 * a joint or a groove gets about five across.
 */
function patternSamples(layer) {
  const w = Math.max(0.08, layer.width)
  switch (layer.pattern) {
    case 'ringe': return [layer.wave > 0 ? 6 : 0, Math.max(8, 5 / w)]
    case 'waben': case 'ziegel': { const n = Math.min(32, Math.max(10, 6 / w)); return [n, n] }
    case 'noppen': case 'gehaemmert': return [12, 12]
    case 'schuppen': return [18, 18]
    case 'strick': return [14, 12]
    case 'geflecht': return [16, 16]
    case 'rauschen': return [24, 24]
    default: return [10, 10]
  }
}

/** A pattern made ready for the wall: its function and what the function reads. */
export function preparePattern(layer) {
  // Over and under alternate from cell to cell: only an even number of a weave closes round the vase.
  const count = layer.pattern === 'geflecht' && layer.count % 2 ? layer.count + 1 : layer.count
  return {
    fn: FUNCTIONS[layer.pattern],
    pattern: layer.pattern,
    rings: layer.pattern === 'ringe',
    count,
    depth: layer.depth,
    aspect: layer.aspect,
    width: layer.width,
    half: Math.max(0.02, layer.width / 2),
    edge: Math.min(0.9, Math.max(0.05, layer.width)),
    flank: FLANK_INDEX[layer.flank] ?? 0,
    turn: layer.turn / 360,
    flip: layer.flip,
    seed: layer.seed,
    wave: layer.pattern === 'ringe' ? layer.wave : 0,
    waves: layer.waves,
    from: layer.from,
    to: layer.to,
    fade: layer.fade,
    samples: patternSamples(layer),
    seedRow: NaN, seedX: null, seedY: null,
  }
}

function smooth(t) {
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t)
}

/** 1 inside the height band (percent of `H`), 0 outside it, a soft step of `fade` mm at an end that is not the vase's own. */
export function bandWeight(z, H, from, to, fade) {
  const a = (from / 100) * H, b = (to / 100) * H
  if (b - a < 1e-6) return 0
  const f = Math.min(fade, (b - a) / 2)
  const lower = from <= 0 ? 1 : f <= 0 ? (z >= a ? 1 : 0) : smooth((z - a) / f)
  const upper = to >= 100 ? 1 : f <= 0 ? (z <= b ? 1 : 0) : smooth((b - z) / f)
  return lower * upper
}

/**
 * How far a pattern has run up the wall at a height z, from tables of 1024 steps (linear in between): `arc` along
 * the body's contour in mm (`contour` is the whole of it), and `conformal` counted by the mean radius there - a
 * step of the wall counts for as much as it is of the vase's girth at that height, which is what keeps a cell as
 * high as it is wide. `meanRadius(z)` is the wall's mean radius without patterns.
 */
export function patternCoordinates(meanRadius, H) {
  const N = 1024
  const arc = new Float64Array(N + 1), conformal = new Float64Array(N + 1)
  let previous = meanRadius(0)
  for (let k = 1; k <= N; k++) {
    const r = meanRadius((H * k) / N)
    const ds = Math.hypot(H / N, r - previous)
    arc[k] = arc[k - 1] + ds
    conformal[k] = conformal[k - 1] + ds / Math.max(1e-6, 0.5 * (r + previous))
    previous = r
  }
  const at = (table) => (z) => {
    const x = Math.min(1, Math.max(0, z / H)) * N
    const k = Math.min(N - 1, Math.floor(x))
    return table[k] + (table[k + 1] - table[k]) * (x - k)
  }
  return { arc: at(arc), conformal: at(conformal), contour: arc[N] || 1 }
}

/**
 * The patterns of a wall as one function of its points: `at(theta, z)` is how far the wall moves there, in mm,
 * outwards above 0. What depends on the height alone (how strong a pattern is in its band, how far it has run
 * up and turned) is worked out once per row: the wall asks row by row. `rotationAt(z)` is the turn of the
 * cross-section in radians (patterns turn along with it), `meanRadius(z)` the wall's mean radius.
 */
export function patternField(layers, { H, rotationAt, meanRadius }) {
  const coordinates = patternCoordinates(meanRadius, H)
  const rows = layers.map(() => ({ depth: 0, b: 0, shift: 0 }))
  let rowZ = NaN, active = false
  const prepareRow = (z) => {
    rowZ = z
    active = false
    const t = z / H
    const turned = rotationAt(z) / (2 * Math.PI)
    for (let k = 0; k < layers.length; k++) {
      const L = layers[k], row = rows[k]
      row.depth = L.depth * bandWeight(z, H, L.from, L.to, L.fade)
      if (row.depth === 0) continue
      active = true
      row.b = L.rings ? (coordinates.arc(z) / coordinates.contour) * L.count : (coordinates.conformal(z) * L.count) / (2 * Math.PI * L.aspect)
      row.shift = L.count * (L.turn * t - turned)
    }
  }
  const at = (theta, z) => {
    if (z !== rowZ) prepareRow(z)
    if (!active) return 0
    let out = 0
    for (let k = 0; k < layers.length; k++) {
      const row = rows[k]
      if (row.depth === 0) continue
      const L = layers[k]
      out += row.depth * L.fn((L.count * theta) / (2 * Math.PI) + row.shift, row.b, L)
    }
    return out
  }
  /** How deep the patterns go into the wall at the most at this height, in mm: the inner wall stays behind it. */
  const inwardAt = (z) => {
    let sum = 0
    for (const L of layers) if (L.depth < 0) sum -= L.depth * bandWeight(z, H, L.from, L.to, L.fade)
    return sum
  }
  /** How far apart rows may be at this height, in mm, for the patterns that are there (Infinity where none is). */
  const stepAt = (z, scale) => {
    let step = Infinity
    for (const L of layers) {
      if (bandWeight(z, H, L.from, L.to, L.fade) <= 0 && bandWeight(z + 1, H, L.from, L.to, L.fade) <= 0) continue
      const cell = L.rings ? coordinates.contour / L.count : ((2 * Math.PI * meanRadius(z)) / L.count) * L.aspect
      if (L.samples[1] > 0) step = Math.min(step, cell / (L.samples[1] * scale))
      // A pattern that turns moves sideways from row to row: not by more than a point and a half of its cell.
      const drift = (L.count * Math.abs(L.turn)) / H
      if (L.samples[0] > 0 && drift > 0) step = Math.min(step, 1.5 / (L.samples[0] * scale * drift))
      if (L.fade > 0 && (L.from > 0 || L.to < 100)) step = Math.min(step, Math.max(0.5, L.fade / 4))
    }
    return step
  }
  /** How many columns the patterns need round the vase. */
  const columns = (scale) => Math.max(0, ...layers.map((L) => Math.ceil(L.count * L.samples[0] * scale)))
  return { at, inwardAt, stepAt, columns }
}

/**
 * Row heights from a to b, as far apart as `stepAt(z)` allows at each height; zones in `zones` ({ z0, z1 }) get
 * only their borders (the module meshes in between), as in the wall's other row lists.
 */
export function steppedRows(a, b, stepAt, zones, minStep) {
  const cuts = [a, b]
  for (const zn of zones) for (const z of [zn.z0, zn.z1]) if (z > a + 1e-9 && z < b - 1e-9) cuts.push(z)
  const sorted = [...new Set(cuts)].sort((x, y) => x - y)
  const out = []
  for (let k = 0; k < sorted.length - 1; k++) {
    const p = sorted[k], q = sorted[k + 1]
    out.push(p)
    if (zones.some((zn) => zn.z0 === p && zn.z1 === q)) continue
    let z = p
    for (;;) {
      const step = Math.max(minStep, stepAt(z))
      // The last step up to the border may be a little longer rather than leave a sliver of a row.
      if (q - z <= step * 1.4) break
      z += step
      out.push(z)
    }
  }
  out.push(b)
  return out
}
