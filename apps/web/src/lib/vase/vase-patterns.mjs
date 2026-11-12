/**
 * Relief patterns of the vase (Vase designer 2.0): seven pattern families and leaf reliefs, each a height field over
 * the unrolled surface of the vase. A plain ES module without dependencies, like vase-geometry.mjs: the core
 * subtracts the depth from the radius, the gallery draws its tiles from the very same functions.
 *
 * Surface coordinates. Around the vase a pattern has a whole number of cells `N`, so it closes at 360 degrees
 * without a seam; `cu` counts cells around (0..N), turning along with the vase's twist. Up the vase, `cv` counts
 * cells too, measured along the contour and scaled by the local circumference ("conformal"): a cell is as tall as
 * it is wide wherever it lies, times the stretch. On a belly the cells grow, at a neck they shrink, and the number
 * of repeats stays the same when the profile changes - the pattern follows the measured circumference.
 *
 * Height. Every family gives h in 0..1 per point: 1 is the raised relief, which lies on the vase's own surface
 * (the profile), 0 the background, sunk in by the relief depth. Inside the height range the depth is
 * reliefDepth x (1 - h); outside it the surface stays smooth, with a soft transition at the borders. So a relief
 * never stands out of the vase's outline and never lies on it as a loose island: it is part of the wall.
 *
 * Leaves. A leaf is an outline (half width over its length, or a polar outline for fan, ivy and maple) with a
 * domed top and optional veins. Leaves stand in rows from the bottom of the height range; a lower row lies over the
 * row above it, and within a row each leaf's left edge lies over its left neighbour's right edge - a rule that holds
 * all round, so the overlap closes at the seam too. Where one leaf lies over another, its edge stands a step above
 * the leaf beneath, so the overlap can be seen and felt.
 *
 * Print-friendly mode: going up, the surface may move outwards by at most as much as it rises (45 degrees). Every
 * lower edge of a relief - a leaf's base on the background, a petal's lower rim - then slopes instead of
 * overhanging; the upper edges stay sharp.
 */

/** The pattern families with their German names (the editor shows its own, translated). */
export const PATTERNS = {
  blueten: 'Flow Petals',
  rautenwelle: 'Wave Diamond',
  tulpenblaetter: 'Tulip Leaves',
  wisp: 'Wisp Ribs',
  zellen: 'Organic Voronoi',
  waben: 'Hexagon Relief',
  geflecht: 'Diamond Weave',
  blaetter: 'Blätter',
}

/** Leaf shapes; `eigen` takes the outline drawn in `leafPoints`. */
export const LEAF_SHAPES = { tulpe: 'Tulpe', ginkgo: 'Ginkgo', lotus: 'Lotus', efeu: 'Efeu', ahorn: 'Ahorn', monstera: 'Monstera', farn: 'Farn', eigen: 'Eigenes Blatt' }

/** How the leaf rows stand: offset by half a leaf, turning up in a spiral, or straight above one another. */
export const LEAF_LAYOUTS = { versetzt: 'Versetzt', spirale: 'Spiralförmig', regelmaessig: 'Regelmäßig' }

/** Default outline of a drawn leaf: [along 0..1 from the base to the tip, half width 0..1]. */
export const DEFAULT_LEAF_POINTS = Object.freeze([[0, 0.12], [0.18, 0.7], [0.45, 1], [0.75, 0.72], [1, 0]])

/** Leaf width at 100 % (mm at the widest circumference: about 6 leaves round a vase 90 mm wide), and per shape its length per width and its width per cell. */
const LEAF_WIDTH_MM = 46
const LEAF_FORM = {
  tulpe: { aspect: 1.9, width: 1.0 },
  ginkgo: { aspect: 0.9, width: 1.3 },
  lotus: { aspect: 1.55, width: 1.0 },
  efeu: { aspect: 1.05, width: 1.25 },
  ahorn: { aspect: 1.0, width: 1.3 },
  monstera: { aspect: 1.2, width: 1.1 },
  farn: { aspect: 3.2, width: 1.05 },
  eigen: { aspect: 1.7, width: 1.0 },
}
/** How far a leaf over another stands above it (share of the relief depth). */
const OVERLAP_STEP = 0.2
/** The lowest a leaf's edge stands above the background. */
const LEAF_EDGE = 0.2

const TAU = 2 * Math.PI

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function smooth(edge0, edge1, x) {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function frac(x) {
  return x - Math.floor(x)
}

function hash2(i, j, seed) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(seed | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

export function isReliefPattern(effect) {
  return Object.prototype.hasOwnProperty.call(PATTERNS, effect)
}

/** Points of a drawn leaf outline: at least two, along 0..1 ascending, half width 0..1; null when unusable. */
export function normalizeLeafPoints(list) {
  if (!Array.isArray(list)) return null
  const out = []
  for (const point of list) {
    if (!Array.isArray(point) || point.length < 2) continue
    const t = Number(point[0]), w = Number(point[1])
    if (!Number.isFinite(t) || !Number.isFinite(w)) continue
    out.push([clamp(t, 0, 1), clamp(w, 0, 1)])
    if (out.length >= 24) break
  }
  out.sort((a, b) => a[0] - b[0])
  if (out.length < 2) return null
  out[0][0] = 0
  out[out.length - 1][0] = 1
  return out
}

/** Half width of a drawn leaf at t (0..1), a smooth curve through its points. */
function drawnHalfWidth(points, t) {
  if (t <= 0 || t >= 1) return t <= 0 ? points[0][1] : points[points.length - 1][1]
  let i = 0
  while (i < points.length - 2 && t > points[i + 1][0]) i++
  const [t0, w0] = points[i], [t1, w1] = points[i + 1]
  const s = (t - t0) / Math.max(1e-6, t1 - t0)
  return w0 + (w1 - w0) * s * s * (3 - 2 * s)
}

/**
 * How far the point last given to leafHeight lies inside the leaf's outline, in lengths of the leaf: leavesAt turns it
 * into a narrow slope at the edge, so the outline is not a step the grid draws as a staircase.
 */
let leafEdge = 0

/** The midrib and side veins of a leaf (0..1, 1 = a vein's groove), in its own coordinates. */
function veins(t, xn, side) {
  const rib = Math.exp(-((xn / 0.06) ** 2)) * smooth(0.02, 0.12, t) * (1 - smooth(0.85, 0.97, t))
  const a = frac(t * 4.5 - Math.abs(xn) * 1.1 + 0.2)
  const sideVein = Math.abs(xn) > 0.1 ? Math.exp(-(((a - 0.5) / 0.06) ** 2)) * (1 - Math.abs(xn)) * side : 0
  return Math.max(rib, 0.45 * sideVein)
}

/**
 * One leaf: its height 0..1 at (t, xn), or -1 outside it. t runs from the base (0) to the tip (1), xn across from -1 to
 * 1 at the widest place. `curve` domes the top, `withVeins` presses the veins in.
 */
export function leafHeight(shape, t, xn, curve, withVeins, points, halfWidthInLengths = 0.3) {
  if (t < -0.02 || t > 1.02) return -1
  const ax = Math.abs(xn)
  let inside = -1
  let across = 0
  let vein = 0
  if (shape === 'ginkgo' || shape === 'efeu' || shape === 'ahorn') {
    // Polar outlines round a point on the axis: a fan from the stem, or lobes round the leaf's middle.
    const cx = 0, cy = shape === 'ginkgo' ? 0.02 : shape === 'efeu' ? 0.42 : 0.48
    const width = LEAF_FORM[shape].width / LEAF_FORM[shape].aspect
    const x = xn * width * 0.5, y = t - cy
    const rho = Math.hypot(x, y)
    const phi = Math.atan2(x, y)
    let limit
    if (shape === 'ginkgo') {
      if (Math.abs(phi) > 1.08 || y < 0) limit = -1
      else {
        const notch = 0.2 * Math.exp(-((phi / 0.12) ** 2))
        limit = 0.98 - notch + 0.025 * Math.cos(phi * 14)
      }
      // The stem from the base up into the fan.
      if (Math.abs(x) < 0.035 && t >= -0.02 && t < 0.3) { leafEdge = 0.035 - Math.abs(x); return 0.55 }
    } else if (shape === 'efeu') {
      limit = 0.5 * (0.6 + 0.4 * Math.abs(Math.cos(1.5 * phi)) ** 1.6) * (phi > 2.3 || phi < -2.3 ? 0.75 : 1)
      if (Math.abs(x) < 0.03 && y < 0 && t > -0.02) { leafEdge = 0.03 - Math.abs(x); return 0.55 }
    } else {
      limit = 0.5 * (0.55 + 0.45 * Math.abs(Math.cos(2.5 * phi)) ** 2.5) * (1 + 0.04 * Math.abs(Math.sin(22 * phi)))
      if (Math.abs(phi) > 2.6) limit *= 0.55
      if (Math.abs(x) < 0.03 && y < 0 && t > -0.02) { leafEdge = 0.03 - Math.abs(x); return 0.55 }
    }
    if (limit <= 0 || rho >= limit) return -1
    leafEdge = limit - rho
    const s = rho / limit
    across = s
    inside = 1
    if (withVeins) {
      // Veins run out from the centre: five main ones on ivy and maple, many fine ones on the fan.
      const count = shape === 'ginkgo' ? 16 : 5
      const a = frac((phi / TAU) * count + 0.5)
      vein = Math.exp(-(((a - 0.5) / (shape === 'ginkgo' ? 0.08 : 0.04)) ** 2)) * (1 - s * 0.8) * (shape === 'ginkgo' ? 0.7 : 1)
    }
  } else {
    let hw
    if (shape === 'tulpe') hw = Math.pow(Math.max(0, Math.sin(Math.PI * clamp(t, 0, 1))), 0.55) * (1 - 0.22 * Math.max(0, t - 0.45))
    else if (shape === 'lotus') hw = Math.pow(Math.max(0, Math.sin(Math.PI * clamp(t, 0, 1))), 0.42) * (1 - Math.pow(clamp(t, 0, 1), 7))
    else if (shape === 'monstera') hw = Math.pow(Math.max(0, Math.sin(Math.PI * clamp(t * 0.92 + 0.04, 0, 1))), 0.5)
    else if (shape === 'farn') hw = Math.pow(Math.max(0, Math.sin(Math.PI * clamp(t, 0, 1))), 0.7) * (1 - 0.45 * clamp(t, 0, 1))
    else hw = drawnHalfWidth(points ?? DEFAULT_LEAF_POINTS, clamp(t, 0, 1))
    if (hw <= 1e-3 || ax >= hw) return -1
    // Inside the outline: across to the side, and to the base and the tip, in lengths of the leaf.
    leafEdge = Math.min((hw - ax) * halfWidthInLengths, Math.max(0, t), Math.max(0, 1 - t))
    across = ax / hw
    inside = 1
    if (shape === 'monstera') {
      // Slits from the edge in towards the midrib, and small holes beside the rib between them.
      // Three wide slits on each side, from the edge in to half way, sloping up towards the tip.
      const slit = frac((t + 0.45 * across) * 3.4 + 0.3)
      if (across > 0.45 && slit < 0.2 && t > 0.12 && t < 0.9) return -1
      if (across > 0.45 && t > 0.12 && t < 0.9) leafEdge = Math.min(leafEdge, Math.min(slit - 0.2, 1 - slit) / 3.4)
    }
    if (shape === 'farn') {
      // Leaflets on both sides of the stalk, offset, pointing up and out; the stalk itself.
      const side = xn < 0 ? 0.5 : 0
      const k = frac(t * 10 - across * 0.9 + side)
      if (ax > 0.06 && k > 0.72) return -1
      if (ax > 0.06) leafEdge = Math.min(leafEdge, Math.min(k, 0.72 - k) / 10)
      const leaflet = ax <= 0.06 ? 1 : Math.sin((Math.PI * k) / 0.72)
      across = 1 - leaflet * (1 - across * 0.5)
    }
    if (withVeins && shape !== 'farn') vein = veins(t, xn, shape === 'monstera' ? 0.6 : 1)
  }
  if (inside < 0) return -1
  // Dome: flat at curve 0, rising to a rounded top at 1; the tip fades a little.
  const dome = Math.sqrt(Math.max(0, 1 - across * across))
  const top = (1 - curve) + curve * dome
  const tipFade = 1 - 0.25 * smooth(0.82, 1, t)
  return clamp(LEAF_EDGE + (1 - LEAF_EDGE) * top * tipFade - 0.16 * vein, 0, 1)
}

/** Diamond weave: two families of bands along the diagonals, over and under in turn. */
function weave(cu, cv, width) {
  const a = cu + cv, b = cu - cv
  const band = (x) => {
    const d = Math.abs(frac(x + 0.5) - 0.5) / Math.max(0.05, width / 2)
    return d >= 1 ? 0 : Math.sqrt(1 - d * d)
  }
  const ba = band(a), bb = band(b)
  const topA = (Math.round(a) + Math.round(b)) % 2 === 0
  const ha = topA ? ba : ba * (1 - 0.55 * bb)
  const hb = topA ? bb * (1 - 0.55 * ba) : bb
  return Math.max(ha, hb)
}

/** Wave diamond: plump diamonds, their rows swaying sideways, so the facets run on like waves. */
function waveDiamond(cu, cv, round) {
  const x = cu + 0.22 * Math.sin(Math.PI * cv)
  const a = frac(x + cv) - 0.5, b = frac(x - cv) - 0.5
  const d = Math.max(Math.abs(a), Math.abs(b)) * 2
  const pillow = Math.cos((Math.PI / 2) * clamp(d, 0, 1))
  return clamp(Math.pow(pillow, 0.4 + 1.6 * (1 - round)) * 1.08, 0, 1)
}

/** Flow petals: long, soft drops in offset rows, each swinging a little sideways. */
function petals(cu, cv, round, overlap) {
  const length = 1 + overlap
  let best = 0
  const r0 = Math.floor(cv)
  for (let r = r0 - 2; r <= r0; r++) {
    const off = r % 2 === 0 ? 0 : 0.5
    const t = (cv - r) / length
    if (t < 0 || t > 1) continue
    const c = Math.round(cu - off)
    for (let k = c - 1; k <= c + 1; k++) {
      const swing = 0.12 * Math.sin(Math.PI * t)
      const dx = cu - (k + off) - swing
      const hw = 0.52 * Math.pow(Math.sin(Math.PI * t), 0.75)
      if (hw <= 1e-3 || Math.abs(dx) >= hw) continue
      const s = Math.abs(dx) / hw
      const v = Math.pow(1 - s * s, 0.3 + 0.9 * round) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15)))
      // Petals of neighbouring rows meet where their domes are equal: the higher one shows.
      best = Math.max(best, v)
    }
  }
  return clamp(best, 0, 1)
}

/** Wisp ribs: bundles of narrow ribs in a sunk channel, between smooth fields. */
function wisp(cu, cv, group, width) {
  const f = frac(cu)
  if (f >= width) return 1
  const k = (f / width) * group
  const rib = Math.abs(frac(k) - 0.5) * 2
  // Round ribs: a cosine across each, so the grid draws them smooth at any lean.
  const ridge = 0.5 + 0.5 * Math.cos(Math.PI * rib)
  // The channel's two ends rise softly to the fields.
  const edge = Math.min(f, width - f) / width
  return clamp(Math.max(ridge * 0.95, 1 - smooth(0, 0.08, edge)), 0, 1)
}

/** Organic Voronoi: plump cells with a net of rounded joints between them (F2 - F1 of a jittered grid). */
function cells(cu, cv, around, gap, round, seed) {
  const ci = Math.floor(cu), cj = Math.floor(cv)
  let d1 = Infinity, d2 = Infinity
  for (let di = -1; di <= 1; di++) {
    const i = ci + di
    const wrapped = ((i % around) + around) % around
    for (let dj = -1; dj <= 1; dj++) {
      const j = cj + dj
      const px = i + 0.15 + 0.7 * hash2(wrapped, j, seed)
      const py = j + 0.15 + 0.7 * hash2(wrapped, j, seed + 7919)
      const d = Math.hypot(px - cu, py - cv)
      if (d < d1) { d2 = d1; d1 = d } else if (d < d2) d2 = d
    }
  }
  const edge = (d2 - d1) / 2
  const half = gap / 2
  if (edge <= half) return 0
  return Math.pow(smooth(half, half + 0.08 + 0.35 * round, edge), 0.7)
}

/** Hexagon relief: six-sided tiles with flat tops and clear facets round them, in offset rows. */
function hexagons(cu, cv, gap, round) {
  // Hex width 1 around, rows sqrt(3)/2 apart; the nearest of the two lattices' centres.
  const rowH = Math.sqrt(3) / 2
  const r = Math.round(cv / rowH)
  let best = Infinity
  for (let rr = r - 1; rr <= r + 1; rr++) {
    const off = rr % 2 === 0 ? 0 : 0.5
    const c = Math.round(cu - off)
    for (let k = c - 1; k <= c + 1; k++) {
      const dx = cu - (k + off), dy = cv - rr * rowH
      // Distance to the hexagon's edge (pointy top): the largest of three projections.
      const q = Math.max(Math.abs(dx), Math.abs(dx * 0.5 + dy * rowH), Math.abs(dx * 0.5 - dy * rowH))
      best = Math.min(best, q)
    }
  }
  const edge = 0.5 - best
  const half = gap / 2
  if (edge <= half) return 0
  const bevel = 0.06 + 0.3 * round
  return clamp((edge - half) / bevel, 0, 1)
}

/**
 * How many fine features a family has across one cell (ribs of a bundle, a fern's leaflets, a monstera's slits): the
 * core gives the grid that many more columns and rows, so they come out as shapes and not as a zip of steps.
 */
export function patternDetail(p) {
  if (p.effect === 'wisp') return Math.max(1, Math.round(p.patternGroup) / Math.max(0.15, p.patternWidth))
  if (p.effect === 'blaetter') return { farn: 7, monstera: 4, ginkgo: 2.5, ahorn: 3, efeu: 2 }[p.leafShape] ?? 1.5
  if (p.effect === 'geflecht') return 1.5
  return 1
}

/** The count of cells around for a family. Leaves: from their size and the widest circumference. */
export function patternCellsAround(p, maxCircumference) {
  if (p.effect === 'blaetter') {
    const form = LEAF_FORM[p.leafShape] ?? LEAF_FORM.tulpe
    const width = (LEAF_WIDTH_MM * p.leafSize) / 100
    return clamp(Math.round(maxCircumference / (width / form.width * 1.0)), 3, 64)
  }
  return clamp(Math.round(p.patternCount), 3, 96)
}

/** Leaf rows: the lower lies over the upper, within a row the left edge over the neighbour's right. */
function leavesAt(cu, cv, around, o) {
  const { shape, aspect, width, overlap, layout, tilt, curve, withVeins, points, step } = o
  const length = width * aspect
  // The slope at a leaf's edge: about a twentieth of a cell, in lengths of the leaf.
  const ramp = 0.055 / length
  const halfWidthInLengths = width / 2 / length
  const pitch = Math.max(0.12, length * (1 - overlap))
  const sin = Math.sin(tilt), cos = Math.cos(tilt)
  if (cv < -0.05) return 0
  const rTop = Math.floor(cv / pitch)
  const rows = Math.ceil(length / pitch) + 1
  let hit = -1, hitTop = 0, hitEdge = 1
  let beneath = 0
  for (let r = Math.max(0, rTop - rows); r <= rTop; r++) {
    // Rows from the lowest that may reach this point: the first hit is the leaf that lies on top.
    const off = layout === 'regelmaessig' ? 0 : layout === 'spirale' ? frac(r * 0.381966) : (r % 2) * 0.5
    const dy0 = cv - r * pitch
    const lean = dy0 * (sin / Math.max(0.2, cos))
    const c = Math.round(cu - off - lean)
    let rowBest = -1, rowX = Infinity, rowOther = 0, rowEdge = 1
    for (let k = c - 2; k <= c + 2; k++) {
      let dx = cu - (k + off)
      dx -= around * Math.round(dx / around)
      const along = dx * sin + dy0 * cos
      const across = dx * cos - dy0 * sin
      const t = along / length
      const xn = across / (width / 2)
      if (t < -0.02 || t > 1.02 || Math.abs(xn) > 1.05) continue
      const v = leafHeight(shape, t, xn, curve, withVeins, points, halfWidthInLengths)
      if (v < 0) continue
      const edge = smooth(0, ramp, leafEdge)
      if (xn < rowX) {
        if (rowBest >= 0) rowOther = Math.max(rowOther, rowBest * rowEdge)
        rowBest = v
        rowX = xn
        rowEdge = edge
      } else rowOther = Math.max(rowOther, v * edge)
    }
    if (rowBest < 0) continue
    // The leaf on top, stepped above what it covers, sloping down to it at its own edge.
    const top = rowOther > 0 ? Math.max(rowBest, rowOther + step) : rowBest
    const own = rowOther + (top - rowOther) * rowEdge
    if (hit < 0) { hit = own; hitTop = top; hitEdge = rowEdge }
    else beneath = Math.max(beneath, own)
  }
  if (hit < 0) return 0
  if (beneath <= 0) return clamp(hit, 0, 1)
  const top = Math.max(hitTop, beneath + step)
  return clamp(beneath + (top - beneath) * hitEdge, 0, 1)
}

/** The height 0..1 of a family at (cu, cv), in cells; `around` is the count of cells round the vase. */
export function patternHeight(p, cu, cv, around) {
  const lean = (clamp(p.patternTwist, -75, 75) * Math.PI) / 180
  const sheared = cu + Math.tan(lean) * cv
  switch (p.effect) {
    case 'blueten': return petals(sheared, cv, p.patternRound, 0.35)
    case 'rautenwelle': return waveDiamond(sheared, cv, p.patternRound)
    case 'geflecht': return weave(sheared, cv, p.patternWidth)
    case 'wisp': return wisp(sheared, cv, Math.round(p.patternGroup), p.patternWidth)
    case 'zellen': return cells(cu, cv, around, p.patternGap, p.patternRound, p.patternSeed)
    case 'waben': return hexagons(sheared, cv, p.patternGap, p.patternRound)
    case 'tulpenblaetter':
      return leavesAt(cu, cv, around, { shape: 'tulpe', aspect: 1.7, width: 1.2, overlap: p.leafOverlap / 100, layout: 'spirale', tilt: lean * 0.6, curve: 1, withVeins: false, points: null, step: OVERLAP_STEP })
    case 'blaetter': {
      const form = LEAF_FORM[p.leafShape] ?? LEAF_FORM.tulpe
      return leavesAt(cu, cv, around, {
        shape: p.leafShape,
        aspect: form.aspect * p.leafAspect,
        width: form.width,
        overlap: p.leafOverlap / 100,
        layout: p.leafLayout,
        tilt: (clamp(p.leafTilt, -45, 45) * Math.PI) / 180,
        curve: p.leafCurve,
        withVeins: p.leafVeins === 'ja',
        points: p.leafShape === 'eigen' ? (p.leafPoints ?? DEFAULT_LEAF_POINTS) : null,
        step: OVERLAP_STEP,
      })
    }
    default: return 1
  }
}

/** Stretch of the cells up the vase (1 = as tall as wide). Leaves keep their own proportions. */
function cellStretch(p) {
  return p.effect === 'blaetter' || p.effect === 'tulpenblaetter' ? 1 : p.patternAspect
}

/**
 * The depth (mm, inwards) of a relief pattern on a vase: `shape` from vaseShape, `zone(z)` the height range's mask.
 * Returns { depthAt(theta, z, base), around, cellAt(z) } - cellAt gives a cell's size in mm at height z.
 */
export function reliefField(p, shape, zone) {
  const { H, R, rotation, twistT } = shape
  const mean = shape.section?.mean ?? 1
  // Conformal height: cells up the contour per mm, from a table of 1024 steps.
  const steps = 1024
  let maxC = 0
  const circumference = new Float64Array(steps + 1)
  for (let k = 0; k <= steps; k++) {
    circumference[k] = TAU * R((k / steps) * H) * mean
    maxC = Math.max(maxC, circumference[k])
  }
  const around = patternCellsAround(p, maxC)
  const stretch = cellStretch(p)
  const V = new Float64Array(steps + 1)
  for (let k = 1; k <= steps; k++) {
    const z0 = ((k - 1) / steps) * H, z1 = (k / steps) * H
    const ds = Math.hypot(z1 - z0, R(z1) - R(z0))
    const c = Math.max(1e-3, (circumference[k] + circumference[k - 1]) / 2)
    V[k] = V[k - 1] + (ds * around) / (c * stretch)
  }
  const vAt = (z) => {
    const x = clamp(z / H, 0, 1) * steps
    const k = Math.min(steps - 1, Math.floor(x))
    return V[k] + (V[k + 1] - V[k]) * (x - k)
  }
  // Leaves start their first row at the bottom of the range, so the lowest leaves sit on its border.
  const leafy = p.effect === 'blaetter' || p.effect === 'tulpenblaetter'
  const start = leafy ? vAt((p.zoneFrom / 100) * H) : 0
  const amount = Math.max(0, p.reliefDepth)
  const raw = (theta, z, base) => {
    const m = zone(z)
    if (m <= 0) return 0
    const depth = Math.min(amount, base / 3) * m
    if (depth <= 0) return 0
    const turn = theta - rotation(twistT(z))
    const cu = frac(turn / TAU) * around
    const h = patternHeight(p, cu, vAt(z) - start, around)
    return depth * (1 - h)
  }
  const friendly = p.printFriendly === 'ja'
  const stepMm = 0.25
  // Far enough down for a relief on a vase flaring out at up to 70 degrees; the loop usually stops much sooner.
  const lookDown = Math.ceil((4 * amount) / stepMm)
  const outer = shape.outerAt
  const depthAt = !friendly ? raw : (theta, z, base) => {
    // Going up, the surface - the vase's own outline less the relief - may come out by at most what it rises:
    // base(z) - d(z) <= base(z - k s) - d(z - k s) + k s. Never deeper than the relief itself.
    const own = raw(theta, z, base)
    if (zone(z) <= 0) return own
    let d = own
    for (let k = 1; k <= lookDown; k++) {
      let below = z - k * stepMm
      if (below < -1e-6) break
      below = Math.max(0, below)
      const lowBase = outer(theta, below)
      const rise = base - lowBase - k * stepMm
      // No lower point can ask for more than the whole relief there: once that is no more than d, stop looking.
      if (amount + rise <= d) break
      const need = raw(theta, below, lowBase) + rise
      if (need > d) d = need
    }
    return Math.min(d, Math.max(own, Math.min(amount, base / 3) * zone(z)))
  }
  const cellAt = (z) => {
    const x = clamp(z / H, 0, 1) * steps
    const k = Math.min(steps, Math.round(x))
    return circumference[k] / around
  }
  return { depthAt, around, cellAt, maxCircumference: maxC, detail: patternDetail(p) }
}

/** The look of the vase's older surfaces (grooves, stripes, Voronoi joints, facets) for the gallery's tiles. */
function classicPreview(effect, cu, cv, around) {
  if (effect === 'rillen') return 1 - Math.pow(0.5 + 0.5 * Math.cos(TAU * cu * 2.5), 2)
  if (effect === 'streifen') return 1 - Math.pow(Math.max(0, Math.cos(TAU * (cu * 2 + cv * 1.2))), 6)
  if (effect === 'voronoi') return 1 - (cells(cu * 1.4, cv * 1.4, Math.round(around * 1.4), 0.1, 0.05, 3) > 0 ? 0 : 1)
  if (effect === 'lowpoly') {
    // Facets: a jittered triangle grid, each triangle flat at a height of its own.
    const i = Math.floor(cu * 1.6), j = Math.floor(cv * 1.6)
    const upper = frac(cu * 1.6) + frac(cv * 1.6) > 1 ? 1 : 0
    return 0.35 + 0.6 * hash2(i, j * 2 + upper, 11)
  }
  return 1
}

/**
 * A preview of a family as heights on an unrolled cylinder, `columns` x `rows` values from 0 (sunk) to 1 (raised),
 * row 0 at the bottom: the gallery shades its tiles from it.
 */
export function patternPreview(p, columns = 48, rows = 48, cellsAcross = null) {
  const around = cellsAcross ?? (p.effect === 'blaetter' ? 3 : p.effect === 'tulpenblaetter' ? 3 : p.effect === 'zellen' ? 4 : 3)
  const stretch = cellStretch(p)
  const out = new Float32Array(columns * rows)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const cu = ((i + 0.5) / columns) * around
      const cv = ((j + 0.5) / rows) * around / stretch * (rows / columns)
      out[j * columns + i] = isReliefPattern(p.effect) ? patternHeight(p, cu, cv, around) : classicPreview(p.effect, cu, cv, around)
    }
  }
  return out
}
