/**
 * Pierced wall: a hole pattern as a distance field, and a mesh building block for a piece of wall
 * between two heights, with holes through the outer and the inner wall.
 *
 * Field f(angle, height) in mm: > 0 material, < 0 hole; |f| is roughly the distance to the hole's edge.
 * It is worked out in (u = angle x reference radius, z) with a local scale: across, the real
 * circumference at that height counts. So the webs stay as wide as set even where the vase is
 * narrow (the holes get smaller there). A whole number of cells always fits around.
 *
 * At the border of the region, holes are cut off (the default) or - as when perforating in SolidCraft
 * (a hole only with a margin to the edge) - only whole holes are placed: cells whose hole reaches past
 * the region stay solid, and the rows sit centred in the region (the same margin above and below).
 *
 * Mesh: marching squares on the grid (columns = angles, rows = heights). Every grid cell carries
 * its piece of material as a convex polygon; crossing points on grid edges are shared by the
 * neighbouring cells. The same triangulation lies on the outer and (reversed) on the inner wall;
 * every open edge gets a wall between the two. The mesh stays closed.
 */

export const CUTOUTS = { keine: 'Keine', voronoi: 'Voronoi', waben: 'Waben', rauten: 'Rauten', kreise: 'Kreise' }
export const CUTOUT_EDGES = { anschneiden: 'Löcher anschneiden', ganz: 'Nur ganze Löcher' }

function hash2(i, j, seed) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

/**
 * Hole pattern as a field. `Rref`: reference radius (mm) for the cells around; `scale(z)`: real
 * circumference / reference circumference at height z; `whole`: { z0, z1 } - whole holes only between
 * these heights, rows centred. Returns { field(theta, z), cellsAround, cellWidth, cellHeight, rows? } (`rows`:
 * how many rows of holes fit with `whole`, except for Voronoi).
 */
export function cutoutPattern(p, { Rref, scale, whole = null }) {
  const kind = p.cutout
  const around = Math.max(3, Math.round((2 * Math.PI * Rref) / p.cutoutSize))
  const cw = (2 * Math.PI * Rref) / around
  const ch = cw * p.cutoutAspect
  const web = p.cutoutWeb
  const U = 2 * Math.PI * Rref
  const uOf = (theta) => ((((theta / (2 * Math.PI)) % 1) + 1) % 1) * U
  // Lattice points (cell centres) in cell (i, j) of the cw x ch grid; i wraps around.
  const wrap = (i) => ((i % around) + around) % around
  const site = kind === 'voronoi'
    ? (i, j) => [(i + 0.1 + 0.8 * hash2(wrap(i), j, p.cutoutSeed)) * cw, (j + 0.1 + 0.8 * hash2(wrap(i), j, p.cutoutSeed + 7919)) * ch]
    // Honeycomb and circles: a triangular lattice, every other row shifted by half a cell (hexagons as Voronoi cells).
    : (i, j) => [(i + (j & 1 ? 0.5 : 0)) * cw, j * ch * (Math.sqrt(3) / 2)]
  const rowH = kind === 'voronoi' ? ch : ch * (Math.sqrt(3) / 2)
  // Collect the lattice points around a place (wrapped around); local scale: across x k.
  const cu = new Float64Array(13 * 5), cz = new Float64Array(13 * 5), ci = new Int32Array(13 * 5), cj = new Int32Array(13 * 5)
  const collect = (u, z, k) => {
    const i0 = Math.floor(u / cw), j0 = Math.floor(z / rowH)
    const reach = Math.min(6, Math.ceil(2 / Math.max(k, 0.2)))
    let n = 0
    for (let di = -reach; di <= reach; di++) {
      for (let dj = -2; dj <= 2; dj++) {
        const [su, sz] = site(i0 + di, j0 + dj)
        cu[n] = su
        cz[n] = sz
        ci[n] = i0 + di
        cj[n] = j0 + dj
        n++
      }
    }
    return n
  }
  // Pattern in (u, z) with local scale k; `shift` moves the rows up or down (whole holes only).
  let shift = 0
  // value(u, z, k): the field; cellAt(u, z, k): the cell as a key; spanOf(cell): heights [bottom, top] of its hole, or null.
  let value, cellAt, spanOf
  if (kind === 'rauten') {
    // Diamonds: the edges are the lines u/cw +- z/ch = n + 1/2; distance to the nearest one in the local scale.
    const normAt = (k) => Math.sqrt(1 / (cw * k) ** 2 + 1 / ch ** 2)
    value = (u, z, k) => {
      const x = u / cw, y = z / ch, norm = normAt(k)
      const dist = (s) => Math.abs(s - 0.5 - Math.round(s - 0.5)) / norm
      return web / 2 - Math.min(dist(x + y), dist(x - y))
    }
    // Diamond m, n: centre at x + y = m, x - y = n; its hole reaches ch (1/2 - web/2 in the edges' measure) up and down.
    cellAt = (u, z) => [Math.round(u / cw + z / ch), Math.round(u / cw - z / ch)]
    spanOf = ([m, n]) => {
      const zc = (ch * (m - n)) / 2
      const e = ch * (0.5 - (web / 2) * normAt(scale(zc + shift)))
      return e > 0 ? [zc - e, zc + e] : null
    }
  } else {
    // Nearest lattice point; returns its index in `collect`.
    const nearest = (u, z, k, n) => {
      let a = 0, da = Infinity
      for (let c = 0; c < n; c++) {
        const d = ((cu[c] - u) * k) ** 2 + (cz[c] - z) ** 2
        if (d < da) { da = d; a = c }
      }
      return a
    }
    cellAt = (u, z, k) => {
      const a = nearest(u, z, k, collect(u, z, k))
      return [wrap(ci[a]), cj[a]]
    }
    if (kind === 'kreise') {
      // Smallest distance between two neighbours at this height: across cw x k, diagonally (cw/2 x k, row height).
      const radiusAt = (k) => Math.max(0, Math.min(cw * k, Math.hypot((cw / 2) * k, rowH)) / 2 - web / 2)
      value = (u, z, k) => {
        const n = collect(u, z, k)
        let d1 = Infinity
        for (let c = 0; c < n; c++) d1 = Math.min(d1, ((cu[c] - u) * k) ** 2 + (cz[c] - z) ** 2)
        return Math.sqrt(d1) - radiusAt(k)
      }
      spanOf = ([i, j]) => {
        const [, sz] = site(i, j)
        const r = radiusAt(scale(sz + shift))
        return r > 0 ? [sz - r, sz + r] : null
      }
    } else {
      // Voronoi and honeycomb: distance to the border of the point's own cell = smallest distance to the
      // perpendicular bisectors towards all neighbours (not only the second nearest - otherwise holes run
      // too far towards each other at the corners where three cells meet).
      value = (u, z, k) => {
        const n = collect(u, z, k)
        const a = nearest(u, z, k, n)
        const da = ((cu[a] - u) * k) ** 2 + (cz[a] - z) ** 2
        let edge = Infinity
        for (let c = 0; c < n; c++) {
          if (c === a) continue
          const len = Math.hypot((cu[c] - cu[a]) * k, cz[c] - cz[a])
          if (len < 1e-9) continue
          const db = ((cu[c] - u) * k) ** 2 + (cz[c] - z) ** 2
          edge = Math.min(edge, (db - da) / (2 * len))
        }
        return web / 2 - edge
      }
      // Hole = the cell, moved inwards by half the web width: clip a big square at all perpendicular
      // bisectors (per neighbour d: x . d <= |d|^2/2 - web/2 |d|), then take the highest and lowest point.
      spanOf = ([i, j]) => {
        const [su, sz] = site(i, j)
        const k = scale(sz + shift)
        const n = collect(su, sz, k)
        const big = 4 * (cw + ch)
        let poly = [[-big, -big], [big, -big], [big, big], [-big, big]]
        for (let c = 0; c < n && poly.length; c++) {
          const dx = (cu[c] - su) * k, dy = cz[c] - sz, len = Math.hypot(dx, dy)
          if (len < 1e-9) continue
          poly = clipHalfPlane(poly, dx, dy, (len * len) / 2 - (web / 2) * len)
        }
        if (poly.length < 3) return null
        const ys = poly.map((q) => q[1])
        return [sz + Math.min(...ys), sz + Math.max(...ys)]
      }
    }
  }
  const spans = new Map()
  const spanFor = (cell) => {
    const key = cell.join(',')
    if (!spans.has(key)) spans.set(key, spanOf(cell))
    return spans.get(key)
  }
  let rows
  if (whole && kind !== 'voronoi') {
    // Rows centred: one row in the middle of the region, or two, each half a row off the middle -
    // whichever gives more whole rows (on a tie, the middle).
    const step = kind === 'rauten' ? ch / 2 : rowH
    const mid = (whole.z0 + whole.z1) / 2, room = (whole.z1 - whole.z0) / 2
    shift = mid
    const s0 = spanOf([0, 0])
    const e = s0 ? (s0[1] - s0[0]) / 2 : Infinity
    const centred = room >= e ? 2 * Math.floor((room - e) / step + 1e-9) + 1 : 0
    const between = room - e >= step / 2 ? 2 * Math.floor((room - e) / step + 0.5 + 1e-9) : 0
    if (between > centred) shift = mid + step / 2
    rows = Math.max(centred, between)
    spans.clear()
  }
  const field = (theta, z) => {
    const u = uOf(theta), k = scale(z), zp = z - shift
    const f = value(u, zp, k)
    if (!whole || f >= web / 2) return f
    // Whole holes only: if this cell's hole reaches past the region, the cell stays solid (at the cell's
    // border the field is already web/2 - the transition stays continuous).
    const span = spanFor(cellAt(u, zp, k))
    return span && (span[0] + shift < whole.z0 - 1e-6 || span[1] + shift > whole.z1 + 1e-6) ? Math.max(f, web / 2) : f
  }
  return { field, cellsAround: around, cellWidth: cw, cellHeight: ch, rows }
}

/** Clip a polygon (a list of [x, y]) at the half-plane a x + b y <= c (Sutherland-Hodgman). */
function clipHalfPlane(poly, a, b, c) {
  const out = []
  for (let k = 0; k < poly.length; k++) {
    const P = poly[k], Q = poly[(k + 1) % poly.length]
    const fp = a * P[0] + b * P[1] - c, fq = a * Q[0] + b * Q[1] - c
    if (fp <= 0) out.push(P)
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq)
      out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])])
    }
  }
  return out
}

/**
 * Piece of wall between the rows `zs[0]` and `zs.at(-1)` at the columns `thetas` (all round, rising).
 * `F[i][j]`: field at row i, column j (> 0 material). `outer(theta, z)`/`inner(theta, z)`: point on the
 * outer/inner wall. `bottom`/`top`: { outer, inner } - existing points of the neighbouring wall (then the
 * row must be all material); `bottom.open`: the lowest row is the part's edge (a cable slit from
 * below) - its points are used, but open edges get a strip between the outer and the inner
 * wall. New triangles go into `tris`; the indices of the hole walls and strips go into
 * `locked` (the surface core is to put no pattern there).
 */
export function wallZone({ thetas, zs, F, outer, inner, bottom, top, tris, addVertex, locked }) {
  const J = thetas.length
  const m = zs.length - 1
  const theta = (j) => (j < J ? thetas[j] : thetas[j - J] + 2 * Math.PI)
  const solid = (i, j) => F[i][j % J] >= 0
  // Points of the flat grid, numbered in turn: corners, crossings on horizontal edges, on vertical edges.
  const NC = (m + 1) * J, NH = (m + 1) * J, NV = m * J, N = NC + NH + NV
  const vOut = new Int32Array(N).fill(-1), vIn = new Int32Array(N).fill(-1)
  const make = (id, th, z) => {
    if (vOut[id] < 0) {
      vOut[id] = addVertex(...outer(th, z))
      vIn[id] = addVertex(...inner(th, z))
    }
    return id
  }
  const corner = (i, j) => {
    const jj = j % J, id = i * J + jj
    if (vOut[id] < 0) {
      const fixed = i === 0 && bottom ? bottom : i === m && top ? top : null
      if (fixed) { vOut[id] = fixed.outer[jj]; vIn[id] = fixed.inner[jj] } else make(id, thetas[jj], zs[i])
    }
    return id
  }
  // Crossing point on a grid edge; t never right at a corner (that would make slivers).
  const cut = (fa, fb) => Math.min(0.95, Math.max(0.05, fa / (fa - fb)))
  const hCross = (i, j) => {
    const jj = j % J, id = NC + i * J + jj
    if (vOut[id] >= 0) return id
    const t = cut(F[i][jj], F[i][(jj + 1) % J])
    return make(id, theta(jj) + t * (theta(jj + 1) - theta(jj)), zs[i])
  }
  const vCross = (i, j) => {
    const jj = j % J, id = NC + NH + i * J + jj
    if (vOut[id] >= 0) return id
    const t = cut(F[i][jj], F[i + 1][jj])
    return make(id, thetas[jj], zs[i] + t * (zs[i + 1] - zs[i]))
  }
  const polys = []
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < J; j++) {
      const s0 = solid(i, j), s1 = solid(i, j + 1), s2 = solid(i + 1, j + 1), s3 = solid(i + 1, j)
      if (!s0 && !s1 && !s2 && !s3) continue
      if (s0 && s1 && s2 && s3) { polys.push([corner(i, j), corner(i, j + 1), corner(i + 1, j + 1), corner(i + 1, j)]); continue }
      // Saddle: two opposite corners are material - the centre decides whether they are joined.
      const center = F[i][j % J] + F[i][(j + 1) % J] + F[i + 1][(j + 1) % J] + F[i + 1][j % J]
      if (s0 && s2 && !s1 && !s3 && center < 0) {
        polys.push([corner(i, j), hCross(i, j), vCross(i, j)], [vCross(i, j + 1), corner(i + 1, j + 1), hCross(i + 1, j)])
        continue
      }
      if (s1 && s3 && !s0 && !s2 && center < 0) {
        polys.push([hCross(i, j), corner(i, j + 1), vCross(i, j + 1)], [hCross(i + 1, j), corner(i + 1, j), vCross(i, j)])
        continue
      }
      // Walk round counter-clockwise: the corners of material, with the crossing points between them.
      const poly = []
      if (s0) poly.push(corner(i, j))
      if (s0 !== s1) poly.push(hCross(i, j))
      if (s1) poly.push(corner(i, j + 1))
      if (s1 !== s2) poly.push(vCross(i, j + 1))
      if (s2) poly.push(corner(i + 1, j + 1))
      if (s2 !== s3) poly.push(hCross(i + 1, j))
      if (s3) poly.push(corner(i + 1, j))
      if (s3 !== s0) poly.push(vCross(i, j))
      polys.push(poly)
    }
  }
  // Faces: outside counter-clockwise (seen from outside), inside the other way round.
  const edges = new Set()
  for (const poly of polys) {
    for (let k = 1; k + 1 < poly.length; k++) {
      tris.push(vOut[poly[0]], vOut[poly[k]], vOut[poly[k + 1]])
      tris.push(vIn[poly[0]], vIn[poly[k + 1]], vIn[poly[k]])
    }
    for (let k = 0; k < poly.length; k++) edges.add(poly[k] * N + poly[(k + 1) % poly.length])
  }
  // Open edges: a hole's border, an open bottom/top edge. Edges on a joined border row
  // belong to the neighbouring wall.
  const row = (id) => (id < NC ? Math.floor(id / J) : id < NC + NH ? Math.floor((id - NC) / J) : -1)
  for (const poly of polys) {
    for (let k = 0; k < poly.length; k++) {
      const A = poly[k], B = poly[(k + 1) % poly.length]
      if (edges.has(B * N + A)) continue
      if (bottom && !bottom.open && row(A) === 0 && row(B) === 0) continue
      if (top && row(A) === m && row(B) === m) continue
      locked.push(tris.length / 3, tris.length / 3 + 1)
      tris.push(vOut[B], vOut[A], vIn[A])
      tris.push(vOut[B], vIn[A], vIn[B])
    }
  }
}
