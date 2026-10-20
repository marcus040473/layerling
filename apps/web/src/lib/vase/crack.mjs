/**
 * Risse wie beim Kintsugi: Linien, die ueber die Oberflaeche wachsen - mit Knicken, Aesten, auslaufender
 * Breite und Kerben am Rand -, die Kerbe darunter und der Koerper, der die Kerbe fuellt (Gold, als eigenes
 * Bauteil fuer ein zweites Filament).
 *
 * Die Risse liegen auf der Oberflaeche (3D), nicht in einer Projektion: So gehen sie auf Vase, Teller,
 * Tasse und jedem Teil gleich. Ein Riss ist ein Zufallsweg: Schritt fuer Schritt (etwa 1 mm) ein Stueck in
 * der Flaeche weiter, zurueck auf die Oberflaeche, Normale mitgefuehrt - nie durch eine duenne Wand auf die
 * Gegenseite. Reines ES-Modul ohne Abhaengigkeiten.
 */

export const CRACK_STYLES = { riss: 'Riss', blitz: 'Blitz' }
/** Wo die Risse beginnen: am oberen Rand (Vase, Becher), am Boden, am Rand nach innen (Teller), irgendwo. */
export const CRACK_STARTS = { oben: 'Vom oberen Rand', unten: 'Vom Boden', aussen: 'Vom Rand zur Mitte', frei: 'Irgendwo' }
/** Fuellung der Kerbe: keine (nur die Kerbe, etwa zum Vergolden von Hand) oder ein eigenes Bauteil. */
export const CRACK_FILLS = { keine: 'Keine (nur Kerbe)', teil: 'Eigenes Teil (Gold)' }
export const MAX_CRACK_PATHS = 24
export const MAX_CRACK_POINTS = 4000
/** Schrittweite des Wegs (mm). */
const STEP = 1

/** Gezeichnete Risse: bis 24 Linien aus Punkten [x, y, z] (mm), zusammen hoechstens 4000 Punkte. */
export function normalizeCrackPaths(list) {
  if (!Array.isArray(list)) return []
  const out = []
  let budget = MAX_CRACK_POINTS
  for (const path of list.slice(0, MAX_CRACK_PATHS)) {
    if (!Array.isArray(path) || budget <= 0) continue
    const pts = []
    for (const q of path) {
      if (pts.length >= budget) break
      // Nur Zahlen (oder Text mit Zahl), nicht leer - kein [[1], 2, 3], das JavaScript still zu 1 macht.
      if (!Array.isArray(q) || q.length !== 3 || !q.every((c) => typeof c === 'number' || (typeof c === 'string' && c.trim() !== ''))) continue
      const p = q.map(Number)
      if (p.every((c) => Number.isFinite(c) && Math.abs(c) < 1e6)) pts.push(p)
    }
    if (pts.length < 2) continue
    budget -= pts.length
    out.push(pts)
  }
  return out
}

/** Zufall mit Startwert (mulberry32): gleicher Startwert, gleiche Risse. */
function random(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2])
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : null
}
/** Richtung in die Flaeche mit Normale n legen (Laenge 1), oder null, wenn sie fast senkrecht steht. */
function tangent(d, n) {
  const k = dot(d, n)
  const t = [d[0] - k * n[0], d[1] - k * n[1], d[2] - k * n[2]]
  return Math.hypot(t[0], t[1], t[2]) > 0.15 * Math.hypot(d[0], d[1], d[2]) ? norm(t) : null
}
/** Richtung d (in der Flaeche) um die Normale n drehen, Winkel in Grad. */
function turn(d, n, deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  const x = cross(n, d)
  return norm([d[0] * c + x[0] * s, d[1] * c + x[1] * s, d[2] * c + x[2] * s]) ?? d
}

/** Gitter-Schluessel ohne Kollision fuer Zellen -65536..65535 je Achse. */
const cellKey = (i, j, k) => ((i + 65536) * 131072 + (j + 65536)) * 131072 + (k + 65536)

/**
 * Suche auf der Oberflaeche: Gitter ueber die Dreiecke. `project(q, hint, reach)` liefert den naechsten
 * Punkt der Oberflaeche im Umkreis `reach`, aber nur auf Dreiecken, deren Normale nicht gegen `hint` steht
 * (so springt ein Weg nie auf die Innenwand einer duennen Vase).
 */
export function surfaceIndex(mesh) {
  const v = mesh.vertices, I = mesh.indices
  const T = I.length / 3
  const normals = new Float64Array(T * 3)
  let edgeSum = 0
  for (let t = 0; t < T; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2]
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2]
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    const l = Math.hypot(nx, ny, nz) || 1
    normals[t * 3] = nx / l
    normals[t * 3 + 1] = ny / l
    normals[t * 3 + 2] = nz / l
    edgeSum += Math.hypot(ux, uy, uz)
  }
  const cell = Math.min(8, Math.max(1.5, T ? edgeSum / T : 2))
  const grid = new Map()
  for (let t = 0; t < T; t++) {
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
    for (let k = 0; k < 3; k++) {
      const q = I[t * 3 + k] * 3
      for (let c = 0; c < 3; c++) {
        lo[c] = Math.min(lo[c], v[q + c])
        hi[c] = Math.max(hi[c], v[q + c])
      }
    }
    lo = lo.map((x) => Math.floor(x / cell))
    hi = hi.map((x) => Math.floor(x / cell))
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) {
      const key = cellKey(i, j, k)
      const list = grid.get(key)
      if (list) list.push(t)
      else grid.set(key, [t])
    }
  }
  const stamp = new Uint32Array(T)
  let round = 0
  const q = [0, 0, 0]
  /** Naechster Punkt auf Dreieck t zu p (Ericson 5.1.5), nach `q`. */
  const closest = (p, t) => {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3
    const abx = v[b] - v[a], aby = v[b + 1] - v[a + 1], abz = v[b + 2] - v[a + 2]
    const acx = v[c] - v[a], acy = v[c + 1] - v[a + 1], acz = v[c + 2] - v[a + 2]
    const apx = p[0] - v[a], apy = p[1] - v[a + 1], apz = p[2] - v[a + 2]
    const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz
    const set = (x, y, z) => { q[0] = x; q[1] = y; q[2] = z }
    if (d1 <= 0 && d2 <= 0) return set(v[a], v[a + 1], v[a + 2])
    const bpx = p[0] - v[b], bpy = p[1] - v[b + 1], bpz = p[2] - v[b + 2]
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz
    if (d3 >= 0 && d4 <= d3) return set(v[b], v[b + 1], v[b + 2])
    const vc = d1 * d4 - d3 * d2
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const s = d1 / (d1 - d3)
      return set(v[a] + s * abx, v[a + 1] + s * aby, v[a + 2] + s * abz)
    }
    const cpx = p[0] - v[c], cpy = p[1] - v[c + 1], cpz = p[2] - v[c + 2]
    const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz
    if (d6 >= 0 && d5 <= d6) return set(v[c], v[c + 1], v[c + 2])
    const vb = d5 * d2 - d1 * d6
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const s = d2 / (d2 - d6)
      return set(v[a] + s * acx, v[a + 1] + s * acy, v[a + 2] + s * acz)
    }
    const va = d3 * d6 - d5 * d4
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const s = (d4 - d3) / (d4 - d3 + (d5 - d6))
      return set(v[b] + s * (v[c] - v[b]), v[b + 1] + s * (v[c + 1] - v[b + 1]), v[b + 2] + s * (v[c + 2] - v[b + 2]))
    }
    const den = 1 / (va + vb + vc), s = vb * den, w = vc * den
    return set(v[a] + abx * s + acx * w, v[a + 1] + aby * s + acy * w, v[a + 2] + abz * s + acz * w)
  }
  const project = (p, hint = null, reach = cell) => {
    round = (round + 1) >>> 0
    if (round === 0) { stamp.fill(0); round = 1 }
    const r = Math.max(reach, 1e-6)
    const lo = p.map((x) => Math.floor((x - r) / cell)), hi = p.map((x) => Math.floor((x + r) / cell))
    let best = -1, bestD = r * r
    const bq = [0, 0, 0]
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) {
      const list = grid.get(cellKey(i, j, k))
      if (!list) continue
      for (const t of list) {
        if (stamp[t] === round) continue
        stamp[t] = round
        if (hint && normals[t * 3] * hint[0] + normals[t * 3 + 1] * hint[1] + normals[t * 3 + 2] * hint[2] < -0.2) continue
        closest(p, t)
        const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2
        if (d <= bestD) {
          bestD = d
          best = t
          bq[0] = q[0]; bq[1] = q[1]; bq[2] = q[2]
        }
      }
    }
    if (best < 0) return null
    return { face: best, point: bq, normal: [normals[best * 3], normals[best * 3 + 1], normals[best * 3 + 2]], distance: Math.sqrt(bestD) }
  }
  return { mesh, normals, cell, project }
}

/** Glattes Rauschen entlang des Risses (Werte -1..1 alle `period` mm), fuer ungleichmaessige Kanten. */
function noise1(rng, period) {
  const lattice = []
  return (s) => {
    const x = s / period, i = Math.floor(x), f = x - i
    while (lattice.length <= i + 1) lattice.push(rng() * 2 - 1)
    const u = f * f * (3 - 2 * f)
    return lattice[Math.max(0, i)] * (1 - u) + lattice[Math.max(0, i + 1)] * u
  }
}

/**
 * Netz der Risse auf der Oberflaeche `mesh` (bereinigtes Ausgangsnetz). `lp`: Felder der Ebene (crack*,
 * seed); `ctx`: { axis (0..2), center [c1, c2] quer zur Achse, lo, hi (Ausdehnung laengs der Achse),
 * maxRadius, allowed(face, point) } - wo ein Riss wachsen darf (Seiten, Masken, gesperrte Flaechen).
 * Ergebnis: Strecken mit halber Breite an beiden Enden und Normale, ein Gitter fuer die Abfrage und die
 * Linien (fuer Ansicht und Tests).
 */
export function crackNetwork(mesh, lp, ctx) {
  const S = ctx.index ?? surfaceIndex(mesh)
  const v = mesh.vertices, I = mesh.indices
  const ax = ctx.axis
  const [i1, i2] = [0, 1, 2].filter((k) => k !== ax)
  const up = [0, 0, 0]
  up[ax] = 1
  const height = Math.max(ctx.hi - ctx.lo, 1)
  const blitz = lp.crackStyle === 'blitz'
  const jag = lp.crackJag, rough = lp.crackRough, branch = lp.crackBranch
  const hw0 = lp.crackWidth / 2
  const rng = random(0x9e3779b1 ^ Math.imul(lp.seed | 0, 2654435761))
  const allowed = ctx.allowed ?? (() => true)
  const lines = []
  const gauss = () => {
    const u = Math.max(rng(), 1e-12), w = rng()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w)
  }
  const radial = (p) => {
    const r = [0, 0, 0]
    r[i1] = p[i1] - ctx.center[0]
    r[i2] = p[i2] - ctx.center[1]
    return r
  }

  /**
   * Ein Riss samt Aesten. `start` { point, normal }, `dir` Richtung in der Flaeche, `length` mm, `hw` halbe
   * Breite am Anfang, `main(p, n)` Hauptrichtung (oder null) und `pull`, wie stark sie zieht; `guide` folgt
   * einer gezeichneten Linie. Aeste wachsen frei (beim Blitz im Zickzack um ihre eigene Richtung).
   */
  const grow = (root) => {
    const stack = [{ level: 0, ...root }]
    while (stack.length) {
      const b = stack.pop()
      const { main, pull, guide } = b
      let P = b.start.point.slice(), N = b.start.normal.slice()
      let D = tangent(b.dir, N)
      if (!D) continue
      const wiggle = noise1(rng, 1.2)
      const chips = []
      const pts = [P.slice()], nrm = [N.slice()], hws = [b.hw * Math.max(0.35, 1 + 0.45 * rough * wiggle(0))]
      let traveled = 0
      let sign = rng() < 0.5 ? -1 : 1
      const segLen = () => (blitz ? 4 + 6 * rng() : 1.5 + 3 * rng())
      let segLeft = segLen()
      // Blitz: Zickzack um die Hauptrichtung; der erste Knick gleich zu Beginn.
      if (blitz && main) {
        const m = main(P, N)
        const mt = m && tangent(m, N)
        if (mt) D = turn(mt, N, sign * (15 + 30 * jag) * (0.6 + 0.4 * rng()))
      }
      while (traveled < b.length - 1e-9) {
        const step = Math.min(STEP, b.length - traveled)
        if (!blitz) D = turn(D, N, gauss() * (1.5 + 5 * jag))
        if (main && pull > 0) {
          const m = main(P, N)
          const mt = m && tangent(m, N)
          if (mt) D = norm([D[0] + pull * mt[0], D[1] + pull * mt[1], D[2] + pull * mt[2]]) ?? D
        }
        const reach = step * 1.5 + 0.25
        let hit = S.project([P[0] + D[0] * step, P[1] + D[1] * step, P[2] + D[2] * step], N, reach)
        let len = hit ? Math.hypot(hit.point[0] - P[0], hit.point[1] - P[1], hit.point[2] - P[2]) : 0
        if (hit && len < step * 0.6) {
          // Ueber eine Kante (Quader, Rand): vorwaerts und ein Stueck in den Koerper hinein - das trifft die
          // Flaeche hinter der Kante, nicht wieder die Kante selbst.
          const fold = S.project([P[0] + (D[0] - N[0]) * step, P[1] + (D[1] - N[1]) * step, P[2] + (D[2] - N[2]) * step], N, reach)
          if (fold && fold.face !== hit.face) {
            const l2 = Math.hypot(fold.point[0] - P[0], fold.point[1] - P[1], fold.point[2] - P[2])
            if (l2 > len) { hit = fold; len = l2 }
          }
        }
        if (!hit || !allowed(hit.face, hit.point) || len < step * 0.25) break
        const move = [hit.point[0] - P[0], hit.point[1] - P[1], hit.point[2] - P[2]]
        N = hit.normal
        D = tangent(move, N) ?? D
        P = hit.point.slice()
        traveled += len
        segLeft -= len
        if (segLeft <= 0) {
          // Knick: beim Riss zufaellig (selten ein grosser), beim Blitz im Wechsel um die Hauptrichtung.
          if (blitz) {
            sign = -sign
            const m = main ? main(P, N) : null
            const mt = (m && tangent(m, N)) ?? D
            D = turn(mt, N, sign * (20 + 40 * jag) * (0.6 + 0.4 * rng()))
          } else {
            const kink = rng() < 0.15 * jag ? (rng() < 0.5 ? -1 : 1) * (35 + 30 * rng()) : 0
            D = turn(D, N, gauss() * jag * 30 + kink)
          }
          segLeft = segLen()
          // Ast: seltener mit jeder Stufe, schmaler, kuerzer; beim Blitz nach vorn.
          const chance = branch * (blitz ? 0.7 * 0.6 ** b.level : 0.55 * 0.7 ** b.level)
          const rest = b.length - traveled
          if (b.level < 3 && rest > 4 && rng() < chance) {
            const side = rng() < 0.5 ? -1 : 1
            const dir = turn(D, N, side * (blitz ? 15 + 25 * rng() : 25 + 35 * rng()))
            stack.push({
              start: { point: P.slice(), normal: N.slice() },
              dir,
              length: Math.max(3, rest * (blitz ? 0.25 + 0.25 * rng() : 0.3 + 0.35 * rng())),
              hw: b.hw * (1 - traveled / b.length) ** 0.55 * 0.7,
              level: b.level + 1,
              main: blitz ? () => dir : null,
              pull: 0,
              guide: null,
            })
          }
        }
        // Kerben: kleine Ausbrueche am Rand (je mm etwa 0,1 x Kerben), sonst ungleichmaessige Breite.
        if (rng() < 0.1 * rough * len) chips.push({ at: traveled, len: 0.6 + 0.9 * rng(), amp: (0.4 + 0.6 * rng()) * rough })
        let chip = 0
        for (const c of chips) if (traveled >= c.at && traveled <= c.at + c.len) chip += c.amp * Math.sin((Math.PI * (traveled - c.at)) / c.len)
        const t = Math.min(1, traveled / b.length)
        const taper = (1 - t) ** (blitz ? 0.8 : 0.55)
        hws.push(b.hw * taper * Math.max(0.35, 1 + 0.45 * rough * wiggle(traveled) + chip))
        pts.push(P.slice())
        nrm.push(N.slice())
        if (guide && guide.done(P)) break
      }
      // `planned`/`traveled`: Ein Riss, der vorher an eine Kante oder in eine Aussparung laeuft, endet dort breit.
      if (pts.length >= 2) lines.push({ points: pts, normals: nrm, hw: hws, level: b.level, planned: b.length, traveled })
    }
  }

  // Erlaubte Flaechen mit Flaeche (fuer „irgendwo“) und Punkte entlang ihrer Kanten alle 2 mm (fuer den
  // Rand) - nicht nur die Ecken des Netzes: Ein Quader hat oben nur vier.
  const count = lp.crackCount
  const start = lp.crackStart
  if (count > 0) {
    const faces = [], areas = []
    const cand = { p: [], n: [], theta: [], h: [], r: [] }
    let areaSum = 0
    for (let t = 0; t < I.length / 3; t++) {
      const fn = [S.normals[t * 3], S.normals[t * 3 + 1], S.normals[t * 3 + 2]]
      const A = [0, 1, 2].map((k) => [v[I[t * 3 + k] * 3], v[I[t * 3 + k] * 3 + 1], v[I[t * 3 + k] * 3 + 2]])
      const centroid = [0, 1, 2].map((c) => (A[0][c] + A[1][c] + A[2][c]) / 3)
      if (!allowed(t, centroid)) continue
      const rc = radial(centroid)
      const rl = Math.hypot(rc[0], rc[1], rc[2])
      const outward = rl > 1e-9 ? dot(fn, rc) / rl : 0
      if (start === 'frei') {
        const area = Math.hypot(...cross([A[1][0] - A[0][0], A[1][1] - A[0][1], A[1][2] - A[0][2]], [A[2][0] - A[0][0], A[2][1] - A[0][1], A[2][2] - A[0][2]])) / 2
        areaSum += area
        faces.push({ A, n: fn })
        areas.push(areaSum)
        continue
      }
      // Rand oben/unten: Wand nach aussen; Rand zur Mitte: Flaeche nach oben (Teller, Schale).
      if ((start === 'oben' || start === 'unten') && (Math.abs(fn[ax]) > 0.9 || outward < -0.2)) continue
      if (start === 'aussen' && fn[ax] < 0.25) continue
      for (let k = 0; k < 3; k++) {
        const a = A[k], b = A[(k + 1) % 3]
        const m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2))
        for (let j = 0; j < m; j++) {
          const p = [a[0] + ((b[0] - a[0]) * j) / m, a[1] + ((b[1] - a[1]) * j) / m, a[2] + ((b[2] - a[2]) * j) / m]
          const r = radial(p)
          cand.p.push(p)
          cand.n.push(fn)
          cand.theta.push(Math.atan2(r[i2], r[i1]))
          cand.h.push(p[ax])
          cand.r.push(Math.hypot(r[i1], r[i2]))
        }
      }
    }
    const theta0 = rng() * 2 * Math.PI
    const span = (2 * Math.PI) / count
    const L = (lp.crackLength / 100) * (start === 'aussen' ? ctx.maxRadius : height)
    for (let k = 0; k < count; k++) {
      const length = L * (0.75 + 0.5 * rng())
      if (start === 'frei') {
        if (!faces.length) break
        // Irgendwo: zufaelliger Punkt einer erlaubten Flaeche (nach Flaeche gewichtet), in beide Richtungen.
        const x = rng() * areaSum
        let lo = 0, hi = areas.length - 1
        while (lo < hi) { const mid = (lo + hi) >> 1; if (areas[mid] < x) lo = mid + 1; else hi = mid }
        const { A, n } = faces[lo]
        let u = rng(), w = rng()
        if (u + w > 1) { u = 1 - u; w = 1 - w }
        const p = [0, 1, 2].map((c) => A[0][c] + (A[1][c] - A[0][c]) * u + (A[2][c] - A[0][c]) * w)
        const d0 = tangent([rng() - 0.5, rng() - 0.5, rng() - 0.5], n) ?? tangent(up, n) ?? tangent([1, 0, 0], n)
        if (!d0) continue
        const back = [-d0[0], -d0[1], -d0[2]]
        grow({ start: { point: p, normal: n }, dir: d0, length: length / 2, hw: hw0, main: () => d0, pull: 0.05 })
        grow({ start: { point: p, normal: n }, dir: back, length: length / 2, hw: hw0, main: () => back, pull: 0.05 })
        continue
      }
      const target = theta0 + span * (k + (rng() - 0.5) * 0.5)
      const win = Math.max(span * 0.3, (6 * Math.PI) / 180)
      let best = -1, bestScore = -Infinity, bestD = Infinity
      for (let c = 0; c < cand.p.length; c++) {
        const d = Math.abs(Math.atan2(Math.sin(cand.theta[c] - target), Math.cos(cand.theta[c] - target)))
        if (d > win) continue
        const score = start === 'oben' ? cand.h[c] : start === 'unten' ? -cand.h[c] : cand.r[c]
        if (score > bestScore + 1e-6 || (Math.abs(score - bestScore) <= 1e-6 && d < bestD)) { best = c; bestScore = score; bestD = d }
      }
      if (best < 0) continue
      const p = cand.p[best], n = cand.n[best]
      const main = start === 'aussen'
        ? (q) => { const r = radial(q); return Math.hypot(r[0], r[1], r[2]) > 1 ? [-r[0], -r[1], -r[2]] : null }
        : start === 'oben' ? () => [-up[0], -up[1], -up[2]] : () => up
      const d0 = tangent(main(p) ?? up, n)
      if (!d0) continue
      // Etwas schraeg loslaufen (mehr bei mehr Zackigkeit).
      grow({ start: { point: p, normal: n }, dir: turn(d0, n, gauss() * (8 + 20 * jag)), length, hw: hw0, main, pull: blitz ? 0 : 0.06 + 0.1 * (1 - jag) })
    }
  }

  // Gezeichnete Risse: der Weg folgt der Linie (mit eigener Zackigkeit), Aeste wachsen frei.
  for (const path of lp.crackPaths ?? []) {
    // Die Linie in Schritten von hoechstens 1 mm auf die Flaeche legen: um eine Kante herum ist der Weg auf
    // der Flaeche laenger als die Sehne zwischen zwei gezeichneten Punkten.
    const g = []
    let prevN = null
    const put = (q) => {
      const hit = S.project(q, prevN, 25)
      if (!hit) return
      if (g.length && Math.hypot(hit.point[0] - g.at(-1).p[0], hit.point[1] - g.at(-1).p[1], hit.point[2] - g.at(-1).p[2]) < 0.2) return
      g.push({ p: hit.point.slice(), n: hit.normal })
      prevN = hit.normal
    }
    put(path[0])
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1], b = path[k]
      const m = Math.min(500, Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]))))
      for (let j = 1; j <= m; j++) put([a[0] + ((b[0] - a[0]) * j) / m, a[1] + ((b[1] - a[1]) * j) / m, a[2] + ((b[2] - a[2]) * j) / m])
    }
    if (g.length < 2) continue
    let total = 0
    const acc = [0]
    for (let k = 1; k < g.length; k++) {
      total += Math.hypot(g[k].p[0] - g[k - 1].p[0], g[k].p[1] - g[k - 1].p[1], g[k].p[2] - g[k - 1].p[2])
      acc.push(total)
    }
    if (total < 1) continue
    let at = 0
    const ahead = (p) => {
      // Naechster Linienpunkt ab dem bisherigen (nur vorwaerts), dann 3 mm voraus.
      let best = at, bestD = Infinity
      for (let k = at; k < Math.min(g.length, at + 40); k++) {
        const d = Math.hypot(g[k].p[0] - p[0], g[k].p[1] - p[1], g[k].p[2] - p[2])
        if (d < bestD) { bestD = d; best = k }
      }
      at = best
      let k = best
      while (k < g.length - 1 && acc[k] - acc[best] < 3) k++
      return [g[k].p[0] - p[0], g[k].p[1] - p[1], g[k].p[2] - p[2]]
    }
    const end = g.at(-1).p
    const guide = { done: (p) => at >= g.length - 2 && Math.hypot(end[0] - p[0], end[1] - p[1], end[2] - p[2]) < 1.2 }
    grow({ start: { point: g[0].p, normal: g[0].n }, dir: ahead(g[0].p), length: total * (1.05 + 0.25 * jag), hw: hw0, main: ahead, pull: 0.45 - 0.25 * jag, guide })
  }

  // Strecken fuer die Abfrage: [ax ay az bx by bz hwA hwB nx ny nz] und ein Gitter, in dem jede Strecke in
  // allen Zellen steht, die ihr Band (halbe Breite) beruehrt.
  let nSeg = 0
  let maxHw = 0
  let total = 0
  for (const l of lines) nSeg += l.points.length - 1
  const segs = new Float64Array(nSeg * 11)
  let o = 0
  for (const l of lines) {
    for (let k = 0; k + 1 < l.points.length; k++) {
      const a = l.points[k], b = l.points[k + 1]
      const n = norm([l.normals[k][0] + l.normals[k + 1][0], l.normals[k][1] + l.normals[k + 1][1], l.normals[k][2] + l.normals[k + 1][2]]) ?? l.normals[k]
      segs.set([a[0], a[1], a[2], b[0], b[1], b[2], l.hw[k], l.hw[k + 1], n[0], n[1], n[2]], o)
      o += 11
      maxHw = Math.max(maxHw, l.hw[k], l.hw[k + 1])
      total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    }
  }
  const cell = Math.max(0.75, 2 * maxHw + 0.5)
  const grid = new Map()
  for (let s = 0; s < nSeg; s++) {
    const q = s * 11
    const r = Math.max(segs[q + 6], segs[q + 7]) + 0.05
    const lo = [0, 1, 2].map((c) => Math.floor((Math.min(segs[q + c], segs[q + 3 + c]) - r) / cell))
    const hi = [0, 1, 2].map((c) => Math.floor((Math.max(segs[q + c], segs[q + 3 + c]) + r) / cell))
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) {
      const key = cellKey(i, j, k)
      const list = grid.get(key)
      if (list) list.push(s)
      else grid.set(key, [s])
    }
  }
  return { segs, count: nSeg, grid, cell, maxHw, length: total, lines }
}

/** Musterwert der Kerbe (0..1) an einem Punkt mit Normale: Profil ueber den Abstand zur naechsten Risslinie. */
export function crackValue(net, x, y, z, nx, ny, nz, profile) {
  const list = net.grid.get(cellKey(Math.floor(x / net.cell), Math.floor(y / net.cell), Math.floor(z / net.cell)))
  if (!list) return 0
  const S = net.segs
  let best = 0
  for (const s of list) {
    const q = s * 11
    // Rueckseite einer Wand (Normale gegen die des Risses): unberuehrt.
    if (S[q + 8] * nx + S[q + 9] * ny + S[q + 10] * nz < 0.3) continue
    const dx = S[q + 3] - S[q], dy = S[q + 4] - S[q + 1], dz = S[q + 5] - S[q + 2]
    const l2 = dx * dx + dy * dy + dz * dz
    let t = l2 > 0 ? ((x - S[q]) * dx + (y - S[q + 1]) * dy + (z - S[q + 2]) * dz) / l2 : 0
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const hw = S[q + 6] + (S[q + 7] - S[q + 6]) * t
    if (hw <= 1e-4) continue
    const d = Math.hypot(S[q] + t * dx - x, S[q + 1] + t * dy - y, S[q + 2] + t * dz - z)
    if (d >= hw) continue
    const u = d / hw
    const val = profile === 'v' ? 1 - u : profile === 'flach' ? Math.min(1, (1 - u) / 0.25) : 0.5 * (1 + Math.cos(Math.PI * u))
    if (val > best) best = val
  }
  return best
}

/** Kleinster Abstand der Strecken p (Punkte p0..p1 in P[0..5]) und q (Q[0..5]) - Ericson 5.1.9, ohne Speicher. */
function segmentDistance(P, Q) {
  const d1x = P[3] - P[0], d1y = P[4] - P[1], d1z = P[5] - P[2]
  const d2x = Q[3] - Q[0], d2y = Q[4] - Q[1], d2z = Q[5] - Q[2]
  const rx = P[0] - Q[0], ry = P[1] - Q[1], rz = P[2] - Q[2]
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz
  let s, t
  if (a <= 1e-12 && e <= 1e-12) return Math.hypot(rx, ry, rz)
  if (a <= 1e-12) { s = 0; t = Math.min(1, Math.max(0, f / e)) }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz
    if (e <= 1e-12) { t = 0; s = Math.min(1, Math.max(0, -c / a)) }
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b
      s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0
      t = (b * s + f) / e
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)) }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)) }
    }
  }
  return Math.hypot(rx + d1x * s - d2x * t, ry + d1y * s - d2y * t, rz + d1z * s - d2z * t)
}

const edgeP = new Float64Array(6), edgeQ = new Float64Array(6)
/** Liegt die Kante (Punkte a, b in `verts`) im Band um einen Riss (halbe Breite + `margin`)? Fuer das Unterteilen. */
export function crackEdgeNear(net, verts, a, b, margin) {
  for (let c = 0; c < 3; c++) {
    edgeP[c] = verts[a * 3 + c]
    edgeP[3 + c] = verts[b * 3 + c]
  }
  const lx = Math.floor((Math.min(edgeP[0], edgeP[3]) - margin) / net.cell), hx = Math.floor((Math.max(edgeP[0], edgeP[3]) + margin) / net.cell)
  const ly = Math.floor((Math.min(edgeP[1], edgeP[4]) - margin) / net.cell), hy = Math.floor((Math.max(edgeP[1], edgeP[4]) + margin) / net.cell)
  const lz = Math.floor((Math.min(edgeP[2], edgeP[5]) - margin) / net.cell), hz = Math.floor((Math.max(edgeP[2], edgeP[5]) + margin) / net.cell)
  if ((hx - lx + 1) * (hy - ly + 1) * (hz - lz + 1) > 4096) return true
  const S = net.segs
  for (let i = lx; i <= hx; i++) for (let j = ly; j <= hy; j++) for (let k = lz; k <= hz; k++) {
    const list = net.grid.get(cellKey(i, j, k))
    if (!list) continue
    for (const s of list) {
      const q = s * 11
      for (let c = 0; c < 6; c++) edgeQ[c] = S[q + c]
      if (segmentDistance(edgeP, edgeQ) <= Math.max(S[q + 6], S[q + 7]) + margin) return true
    }
  }
  return false
}

/**
 * Fuellung der Kerbe als geschlossener Koerper: Unten liegt er genau auf dem Kerbengrund (die fertigen
 * Punkte `out`), oben `recess` mm unter der Oberflaeche ohne Kerbe. `g`: Tiefe der Kerbe je Punkt (mm),
 * `dir`: Richtung, in die der Punkt verschoben wurde. Wo die Kerbe flacher als `recess` ist, gibt es keine
 * Fuellung; die Grenze wird je Kante genau geschnitten, Ober- und Unterseite treffen sich dort.
 */
export function crackFillBody(out, indices, g, dir, recess) {
  const eps = 1e-6
  const vert = []
  const tris = []
  const bottomId = new Map(), topId = new Map(), isoId = new Map()
  const SHIFT = 2 ** 26
  const add = (x, y, z) => {
    vert.push(x, y, z)
    return vert.length / 3 - 1
  }
  const bottom = (i) => {
    let id = bottomId.get(i)
    if (id === undefined) {
      id = add(out[i * 3], out[i * 3 + 1], out[i * 3 + 2])
      bottomId.set(i, id)
      // Auf der Grenze: oben = unten.
      if (Math.abs(g[i] - recess) <= eps) topId.set(i, id)
    }
    return id
  }
  const top = (i) => {
    let id = topId.get(i)
    if (id === undefined) {
      bottom(i)
      id = topId.get(i)
      if (id === undefined) {
        const k = g[i] - recess
        id = add(out[i * 3] + dir[i * 3] * k, out[i * 3 + 1] + dir[i * 3 + 1] * k, out[i * 3 + 2] + dir[i * 3 + 2] * k)
        topId.set(i, id)
      }
    }
    return id
  }
  // Punkt auf der Kante a-b, wo die Kerbe genau `recess` tief ist (oben = unten).
  const iso = (a, b) => {
    const key = a < b ? a * SHIFT + b : b * SHIFT + a
    let id = isoId.get(key)
    if (id === undefined) {
      const t = (recess - g[a]) / (g[b] - g[a])
      id = add(out[a * 3] + (out[b * 3] - out[a * 3]) * t, out[a * 3 + 1] + (out[b * 3 + 1] - out[a * 3 + 1]) * t, out[a * 3 + 2] + (out[b * 3 + 2] - out[a * 3 + 2]) * t)
      isoId.set(key, id)
    }
    return id
  }
  for (let f = 0; f < indices.length; f += 3) {
    const c = [indices[f], indices[f + 1], indices[f + 2]]
    const s = c.map((i) => g[i] - recess)
    if (!s.some((x) => x > eps)) continue
    // Vieleck der Flaeche, auf der die Kerbe tiefer als `recess` ist: je Ecke [unten, oben].
    const poly = []
    for (let k = 0; k < 3; k++) {
      const a = c[k], b = c[(k + 1) % 3], sa = s[k], sb = s[(k + 1) % 3]
      if (sa >= -eps) poly.push([bottom(a), top(a)])
      if ((sa > eps && sb < -eps) || (sa < -eps && sb > eps)) {
        const id = iso(a, b)
        poly.push([id, id])
      }
    }
    for (let k = 1; k + 1 < poly.length; k++) {
      const A = poly[0], B = poly[k], C = poly[k + 1]
      // Oben wie die Oberflaeche, unten umgekehrt (zeigt in die Kerbe hinein).
      if (A[1] !== B[1] && B[1] !== C[1] && A[1] !== C[1]) tris.push(A[1], B[1], C[1])
      if (A[0] !== B[0] && B[0] !== C[0] && A[0] !== C[0]) tris.push(A[0], C[0], B[0])
    }
  }
  // Nur Punkte, die ein Dreieck benutzt (eine Ecke auf der Grenze ohne tiefere Nachbarn bliebe sonst lose).
  const used = new Int32Array(vert.length / 3).fill(-1)
  const vOut = []
  const iOut = new Uint32Array(tris.length)
  for (let k = 0; k < tris.length; k++) {
    const i = tris[k]
    if (used[i] < 0) {
      used[i] = vOut.length / 3
      vOut.push(vert[i * 3], vert[i * 3 + 1], vert[i * 3 + 2])
    }
    iOut[k] = used[i]
  }
  return { vertices: Float32Array.from(vOut), indices: iOut }
}
