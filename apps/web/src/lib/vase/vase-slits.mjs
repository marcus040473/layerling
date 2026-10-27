/**
 * Vase mode, made sturdier: a solid body with fine slits. In spiral vase mode the slicer prints
 * only the outline of each layer, as one single line - where the outline runs into a slit and out
 * again, two lines lie close side by side there and fuse into a rib.
 *
 * - Rippen innen (ribs inside): slits from the outside inwards; the ribs stand on the inside of the wall.
 * - Doppelwand (double wall): a second wall inside. One slit goes right through (so the inner wall
 *   belongs to the same outline), plus slits alternately from the outside and from the inside: webs
 *   that reach to just short of the other wall - there the lines lie side by side and join both walls.
 *
 * Below `floor` (mm) the body is solid: that is where the slicer prints the bottom.
 */
import { triangulate } from './mesh-tools.mjs'

export const REINFORCE = { keine: 'Keine', rippen: 'Rippen innen', doppelwand: 'Doppelwand' }

/**
 * Builds the solid body with slits (instead of outer wall + top cap). `rows`: heights of the rows
 * with slits (`rows[0]` = top of the solid bottom) up to the top, `bottom`: rows below them (from 0);
 * `outer(theta, z)` / `inner(theta, z)`: radius of the outer wall and of the second wall (double wall);
 * `coords(v)`: [x, y, z] of a point. Locked (no pattern): slit walls, webs, the floor of the slits
 * and the inner wall. Returns the points of the lowest ring (for the bottom).
 */
export function slitBody({ p, segments, rows, bottom, outer, inner, tris, addVertex, coords, locked }) {
  const J = segments
  const mode = p.reinforce
  const w = p.slitWidth
  const bond = 2 * p.lineWidth
  // Slits centred between two columns; with the double wall alternately outside/inside, the first right through.
  const N = mode === 'doppelwand' ? Math.max(4, 2 * Math.round(p.reinforceCount / 2)) : p.reinforceCount
  const slits = []
  const taken = new Set()
  for (let k = 0; k < N; k++) {
    let c = Math.floor((k * J) / N)
    while (taken.has(c)) c = (c + 1) % J
    taken.add(c)
    const kind = mode === 'rippen' ? 'aussen' : k === 0 ? 'durch' : k % 2 ? 'innen' : 'aussen'
    slits.push({ col: c, phi: ((c + 0.5) * 2 * Math.PI) / J, kind })
  }
  const byCol = new Map(slits.map((s) => [s.col, s]))
  const at = (r, th, z) => addVertex(r * Math.cos(th), r * Math.sin(th), z)
  // Point on the line at distance `side` (mm, sideways) beside the ray phi, at distance rho from the axis.
  const onLine = (rho, phi, side, z) => addVertex(rho * Math.cos(phi) - side * Math.sin(phi), rho * Math.sin(phi) + side * Math.cos(phi), z)
  // Point of a contour where it crosses the line at distance `side` beside the ray phi.
  const onContour = (radius, phi, side, z) => {
    const r0 = radius(phi, z)
    const th = phi + Math.asin(Math.max(-0.9, Math.min(0.9, side / r0)))
    return at(radius(th, z), th, z)
  }
  /** A ring at height z: points counter-clockwise (material on the left) and their kinds. */
  const ring = (z, full) => {
    const pts = [], kinds = []
    const push = (v, k) => { pts.push(v); kinds.push(k) }
    const through = slits.find((s) => s.kind === 'durch')
    const start = through ? through.col + 1 : 0
    const tipDepth = (s) => {
      const ro = outer(s.phi, z)
      if (mode === 'rippen') return Math.max(ro * 0.3, ro - Math.min(p.reinforceDepth, ro * 0.7))
      return inner(s.phi, z) + bond
    }
    // Outside, all the way round, starting at the through slit.
    if (through) push(onContour(outer, through.phi, w / 2, z), 'M')
    for (let n = 0; n < J; n++) {
      const j = (start + n) % J
      push(at(outer((2 * Math.PI * j) / J, z), (2 * Math.PI * j) / J, z), 'O')
      const s = byCol.get(j)
      if (!s || s.kind === 'innen') continue
      if (s.kind === 'durch') {
        push(onContour(outer, s.phi, -w / 2, z), 'M')
        if (!full) break
        // In through the slit, along the inner wall clockwise, and back.
        push(onContour(inner, s.phi, -w / 2, z), 'W')
        for (let m = 0; m < J; m++) {
          const jj = (s.col - m + J) % J
          push(at(inner((2 * Math.PI * jj) / J, z), (2 * Math.PI * jj) / J, z), 'I')
          const t = byCol.get((jj - 1 + J) % J)
          if (t && t.kind === 'innen') {
            // Slit from the inside: inner edge, outwards to just short of the outer wall, and back.
            const rho = outer(t.phi, z) - bond
            push(onContour(inner, t.phi, w / 2, z), 'I')
            push(onLine(rho, t.phi, w / 2, z), 'T')
            push(onLine(rho, t.phi, -w / 2, z), 'T')
            push(onContour(inner, t.phi, -w / 2, z), 'I')
          }
        }
        push(onContour(inner, s.phi, w / 2, z), 'W')
        break
      }
      push(onContour(outer, s.phi, -w / 2, z), 'M')
      if (full) {
        const rho = tipDepth(s)
        push(onLine(rho, s.phi, -w / 2, z), 'T')
        push(onLine(rho, s.phi, w / 2, z), 'T')
      }
      push(onContour(outer, s.phi, w / 2, z), 'M')
    }
    return { pts, kinds }
  }
  const wall = (a, b, lockedEdge) => {
    const n = a.pts.length
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n
      if (lockedEdge(k)) locked.push(tris.length / 3, tris.length / 3 + 1)
      tris.push(a.pts[k], a.pts[k1], b.pts[k1])
      tris.push(a.pts[k], b.pts[k1], b.pts[k])
    }
  }
  // Bottom (solid) up to rows[0]: rings with only the outer points and the slit mouths.
  const zS = rows[0]
  const lowRings = bottom.map((z) => ring(z, false))
  const upper = rows.map((z) => ring(z, true))
  // The rings at height zS share their outer points: the lower one has exactly the points of the upper one (O and M).
  const keep = upper[0].kinds.map((k) => k === 'O' || k === 'M')
  const lowTop = { pts: upper[0].pts.filter((_, k) => keep[k]), kinds: upper[0].kinds.filter((_, k) => keep[k]) }
  const lows = [...lowRings, lowTop]
  for (let i = 0; i < lows.length - 1; i++) wall(lows[i], lows[i + 1], () => false)
  const isOuter = (kinds, k) => {
    const a = kinds[k], b = kinds[(k + 1) % kinds.length]
    return (a === 'O' || a === 'M') && (b === 'O' || b === 'M')
  }
  for (let i = 0; i < upper.length - 1; i++) wall(upper[i], upper[i + 1], (k) => !isOuter(upper[i].kinds, k))
  // Height zS, facing up: the floor of the slits and (double wall) of the space inside.
  const xy = (v) => coords(v).slice(0, 2)
  const ringTop = upper[0]
  const n = ringTop.pts.length
  for (let k = 0; k < n; k++) {
    // Outer slit: M T T M -> a quad facing up (counter-clockwise seen from above).
    if (ringTop.kinds[k] === 'M' && ringTop.kinds[(k + 1) % n] === 'T') {
      const [a, b, c, d] = [0, 1, 2, 3].map((o) => ringTop.pts[(k + o) % n])
      locked.push(tris.length / 3, tris.length / 3 + 1)
      tris.push(d, c, b)
      tris.push(d, b, a)
    }
  }
  if (mode === 'doppelwand') {
    // Space inside, with the through slit and the inner slits: a fan round the centre (star-shaped).
    const first = ringTop.kinds.indexOf('W'), last = ringTop.kinds.lastIndexOf('W')
    const poly = [ringTop.pts[first - 1], ringTop.pts[0], ...ringTop.pts.slice(first, last + 1).reverse()]
    const c = addVertex(0, 0, zS)
    for (let k = 0; k < poly.length; k++) {
      locked.push(tris.length / 3)
      tris.push(c, poly[k], poly[(k + 1) % poly.length])
    }
  }
  // Top cap: the outline with all slits, by ear clipping.
  const topRing = upper[upper.length - 1]
  const t = triangulate(topRing.pts.map(xy))
  if (!t.complete) throw new Error('Der Deckel mit den Schlitzen ließ sich nicht schließen – weniger oder flachere Rippen wählen.')
  for (const [a, b, c] of t.triangles) tris.push(topRing.pts[a], topRing.pts[b], topRing.pts[c])
  return lows[0].pts
}
