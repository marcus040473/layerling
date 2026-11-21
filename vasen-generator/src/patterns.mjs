// Vasen-Generator 2: the patterns. Each is a height 0..1 over the unrolled wall: `a` runs round the vase in
// cells (a whole number of them, so it closes without a seam), `b` runs up it in cells. No objects are made
// per point; a pattern that needs more than its arguments reads it from the prepared layer `L`.

const SQRT3 = Math.sqrt(3)

/** Height over the distance from the middle of a feature (0) to its edge (1). */
function fall(x, profile) {
  if (x >= 1) return 0
  if (profile === 1) return 1 - x // sharp
  if (profile === 2) return x <= 0.75 ? 1 : (1 - x) * 4 // flat
  if (profile === 3) return Math.sqrt(1 - x * x) // dome
  return 0.5 + 0.5 * Math.cos(Math.PI * x) // round
}

/** Height over the distance to a cell's border, in cells: 0 on the border, 1 from `gap` inwards. */
function rise(edge, gap, profile) {
  return edge >= gap ? 1 : edge <= 0 ? 0 : fall(1 - edge / gap, profile)
}

function hash(i, j, seed) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function ribs(a, b, L, a2) {
  const f = a - Math.floor(a)
  let h = fall(Math.abs(f - 0.5) / L.half, L.profile)
  if (L.cross) {
    const g = a2 - Math.floor(a2)
    const other = fall(Math.abs(g - 0.5) / L.half, L.profile)
    if (other > h) h = other
  }
  return h
}

function rings(a, b, L) {
  const y = L.wave > 0 ? b + L.wave * Math.sin((2 * Math.PI * L.waveCount * a) / L.count) : b
  const f = y - Math.floor(y)
  return fall(Math.abs(f - 0.5) / L.half, L.profile)
}

// The nearer of the two hexagon grids' centres, as an offset; `hexX`, `hexY` carry it out without an object.
let hexX = 0, hexY = 0
function hexOffset(a, b) {
  const y = b / SQRT3
  const ax = a - Math.floor(a) - 0.5, ay = (y - Math.floor(y) - 0.5) * SQRT3
  const bx = a + 0.5 - Math.floor(a + 0.5) - 0.5, by = (y + 0.5 - Math.floor(y + 0.5) - 0.5) * SQRT3
  if (ax * ax + ay * ay < bx * bx + by * by) { hexX = ax; hexY = ay } else { hexX = bx; hexY = by }
}

function honeycomb(a, b, L) {
  hexOffset(a, b)
  const x = Math.abs(hexX), y = Math.abs(hexY)
  const d = Math.max(x, 0.5 * x + (SQRT3 / 2) * y)
  return rise(0.5 - d, L.half, L.profile)
}

function bumps(a, b, L) {
  hexOffset(a, b)
  return fall(Math.hypot(hexX, hexY) / L.half, L.profile)
}

// Voronoi: one point per cell of a grid, a whole number of cells round. The points of the five rows round the
// row a point lies in are kept, so a row of the mesh hashes each of them once.
function voronoiRows(L, cj) {
  if (L.seedRow === cj) return
  L.seedRow = cj
  const n = L.count
  if (!L.seedX || L.seedX.length !== 5 * n) { L.seedX = new Float64Array(5 * n); L.seedY = new Float64Array(5 * n) }
  for (let dj = 0; dj < 5; dj++) {
    const j = cj + dj - 2
    for (let i = 0; i < n; i++) {
      L.seedX[dj * n + i] = i + 0.12 + 0.76 * hash(i, j, L.seed)
      L.seedY[dj * n + i] = j + 0.12 + 0.76 * hash(i, j, L.seed + 7919)
    }
  }
}

const nearX = new Float64Array(25), nearY = new Float64Array(25)
let nearest = 0

/**
 * Distance to the border of the Voronoi cell (exact: the nearest bisector), in cells; `nearest` gets the distance
 * to its point. A border is never nearer than half the difference to the second nearest point: where that is
 * already more than `enough`, the point lies on the cell's face and the search for the border is left out.
 */
function voronoiEdge(a, b, L, enough) {
  const n = L.count
  const ci = Math.floor(a), cj = Math.floor(b)
  voronoiRows(L, cj)
  const sx = L.seedX, sy = L.seedY
  const first = ((ci - 2) % n + n) % n
  let best = Infinity, second = Infinity, at = 0, m = 0
  for (let dj = 0; dj < 5; dj++) {
    const row = dj * n
    for (let di = 0, w = first; di < 5; di++) {
      // The cell's own number round the vase, and how many turns away it is counted here.
      const px = sx[row + w] + (ci - 2 + di - w), py = sy[row + w]
      const d = (px - a) * (px - a) + (py - b) * (py - b)
      if (d < best) { second = best; best = d; at = m } else if (d < second) second = d
      nearX[m] = px
      nearY[m] = py
      m++
      if (++w === n) w = 0
    }
  }
  nearest = Math.sqrt(best)
  const least = (Math.sqrt(second) - nearest) / 2
  if (least >= enough) return least
  const nx = nearX[at], ny = nearY[at]
  let edge = Infinity
  for (let k = 0; k < 25; k++) {
    if (k === at) continue
    const dx = nearX[k] - nx, dy = nearY[k] - ny
    const len = Math.sqrt(dx * dx + dy * dy)
    const d = (nearX[k] - a) * (nearX[k] - a) + (nearY[k] - b) * (nearY[k] - b) - best
    if (d >= 2 * edge * len) continue
    edge = d / (2 * (len || 1))
  }
  return edge
}

function voronoi(a, b, L) {
  return rise(voronoiEdge(a, b, L, L.half), L.half, L.profile)
}

function hammered(a, b, L) {
  voronoiEdge(a, b, L, 0)
  const d = nearest / 0.72
  return d >= 1 ? 0 : 1 - d * d
}

// Scales: discs half a cell in radius, in rows half a cell apart, every other row shifted by half a cell.
// A higher row lies over the one below it, so of the discs a point lies in, the highest shows.
function scaleHeight(dy) {
  const t = (0.25 - dy) / 0.75
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t)
}

function scales(a, b, L) {
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

function knit(a, b, L) {
  const x = a - Math.floor(a), y = b - Math.floor(b)
  // A stitch is a V: two legs from the bottom middle up to the sides; the stitches above and below reach in.
  let d = Infinity
  for (let k = -1; k <= 1; k++) {
    const left = segmentDistance(x, y, 0.5, k, 0.1, k + 1.15)
    const right = segmentDistance(x, y, 0.5, k, 0.9, k + 1.15)
    if (left < d) d = left
    if (right < d) d = right
  }
  return fall(d / (0.42 * L.width + 0.02), L.profile)
}

function weave(a, b, L) {
  const ia = Math.floor(a), ib = Math.floor(b)
  const x = a - ia, y = b - ib
  const over = (ia + ib) & 1 ? 1 : -1
  // One strand runs round, one runs up; where they cross, one arches over the other.
  const round = fall(Math.abs(y - 0.5) / L.half, L.profile) * (0.55 + over * 0.45 * Math.sin(Math.PI * x))
  const up = fall(Math.abs(x - 0.5) / L.half, L.profile) * (0.55 - over * 0.45 * Math.sin(Math.PI * y))
  return round > up ? round : up
}

function bricks(a, b, L) {
  const row = Math.floor(b)
  const x = a + (row & 1 ? L.stagger : 0)
  const fx = x - Math.floor(x), fy = b - row
  const edge = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy) * L.aspect)
  return rise(edge, L.half, L.profile)
}

const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10)

function noise(a, b, L) {
  let sum = 0, weight = 0, amp = 1, freq = 1
  for (let o = 0; o < L.octaves; o++) {
    const period = L.count * freq
    const x = a * freq, y = b * freq
    const ix = Math.floor(x), iy = Math.floor(y)
    const fx = ease(x - ix), fy = ease(y - iy)
    const i0 = ((ix % period) + period) % period, i1 = (i0 + 1) % period
    const seed = L.seed + o * 101
    const v00 = hash(i0, iy, seed), v10 = hash(i1, iy, seed), v01 = hash(i0, iy + 1, seed), v11 = hash(i1, iy + 1, seed)
    sum += amp * (v00 + (v10 - v00) * fx + (v01 + (v11 - v01) * fx - (v00 + (v10 - v00) * fx)) * fy)
    weight += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / weight
}

function image(a, b, L) {
  const img = L.image
  if (!img) return 0
  const fx = a - Math.floor(a)
  const fy = L.once ? L.rowBand : b - Math.floor(b)
  if (fy < 0 || fy > 1) return 0
  // The picture's top is the vase's top; between pixels the value is mixed, so a slope stays a slope.
  const x = fx * img.w - 0.5, y = (1 - fy) * img.h - 0.5
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const tx = x - x0, ty = y - y0
  const xa = ((x0 % img.w) + img.w) % img.w, xb = (xa + 1) % img.w
  const ya = L.once ? Math.max(0, Math.min(img.h - 1, y0)) : ((y0 % img.h) + img.h) % img.h
  const yb = L.once ? Math.max(0, Math.min(img.h - 1, y0 + 1)) : (ya + 1) % img.h
  const d = img.data
  const top = d[ya * img.w + xa] + (d[ya * img.w + xb] - d[ya * img.w + xa]) * tx
  const bottom = d[yb * img.w + xa] + (d[yb * img.w + xb] - d[yb * img.w + xa]) * tx
  return top + (bottom - top) * ty
}

export const PATTERN_FUNCTIONS = { ribs, rings, honeycomb, bumps, voronoi, hammered, scales, knit, weave, bricks, noise, image }

const PROFILE_INDEX = { round: 0, sharp: 1, flat: 2, dome: 3 }

/**
 * How many points of the mesh a cell needs round the vase and up it, so the pattern comes out as it is meant:
 * a joint or a groove gets about four across.
 */
export function patternSamples(layer) {
  const w = Math.max(0.08, layer.width)
  switch (layer.pattern) {
    case 'ribs': return [Math.max(8, 5 / w), 0]
    case 'rings': return [layer.wave > 0 ? 6 : 0, Math.max(8, 5 / w)]
    case 'honeycomb': case 'voronoi': case 'bricks': { const n = Math.min(40, Math.max(10, 7 / w)); return [n, n] }
    case 'bumps': case 'hammered': return [12, 12]
    case 'scales': return [18, 18]
    case 'knit': return [14, 12]
    case 'weave': return [16, 16]
    case 'noise': { const n = 3 * 2 ** (layer.octaves - 1); return [n, n] }
    case 'image': return layer.image ? [Math.min(layer.image.w, 400), Math.min(layer.image.h, 400)] : [0, 0]
    default: return [10, 10]
  }
}

/** A layer made ready for the wall: its function and what the function reads. */
export function prepareLayer(layer) {
  return {
    fn: PATTERN_FUNCTIONS[layer.pattern],
    pattern: layer.pattern,
    count: layer.count,
    aspect: layer.aspect,
    width: layer.width,
    half: Math.max(0.02, layer.width / 2),
    edge: Math.min(0.9, Math.max(0.05, layer.width)),
    profile: PROFILE_INDEX[layer.profile] ?? 0,
    cross: layer.cross && layer.pattern === 'ribs',
    wave: layer.wave,
    waveCount: layer.waveCount,
    stagger: layer.stagger,
    flip: layer.flip,
    seed: layer.seed,
    octaves: layer.octaves,
    image: layer.image,
    once: layer.fit === 'once',
    invert: layer.invert,
    depth: layer.depth,
    rowBand: 0,
    seedRow: NaN, seedX: null, seedY: null,
  }
}
