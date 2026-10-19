/**
 * Kleine Netz-Werkzeuge fuer Boeden und Zubehoer: Vieleck mit Loechern triangulieren
 * (Ohrenschnitt), zwei Ringe um den Ursprung verbinden (Reissverschluss), Kreise.
 * Alles rechnet mit Punkten [x, y] in einer Ebene; die Aufrufer setzen die Hoehe.
 */

/** Doppelte Flaeche eines Vielecks (positiv = gegen den Uhrzeigersinn). */
export function signedArea2(pts) {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1])
  return a
}

/** Kreis mit n Punkten, gegen den Uhrzeigersinn (oder im Uhrzeigersinn mit `cw`). */
export function circle(cx, cy, r, n, cw = false, phase = 0) {
  const out = []
  for (let k = 0; k < n; k++) {
    const a = phase + ((cw ? -1 : 1) * 2 * Math.PI * k) / n
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return out
}

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

function inTriangle(p, a, b, c) {
  // Echt innen oder auf dem Rand (ohne die Ecken selbst).
  const d1 = cross(a, b, p), d2 = cross(b, c, p), d3 = cross(c, a, p)
  return d1 >= 0 && d2 >= 0 && d3 >= 0
}

/**
 * Vieleck mit Loechern triangulieren. `outer` gegen den Uhrzeigersinn, `holes` je im
 * Uhrzeigersinn (die Funktion dreht falsch herum gegebene um). Liefert Dreiecke als
 * Indizes in die Punktliste [...outer, ...holes[0], ...holes[1], ...] - gegen den
 * Uhrzeigersinn. Fuer kleine Vielecke gedacht (einige hundert Punkte).
 */
export function triangulate(outer, holes = []) {
  const pts = []
  const ring = (list, wantCcw) => {
    const start = pts.length
    const ccw = signedArea2(list) > 0
    for (const p of list) pts.push(p)
    const idx = list.map((_, i) => start + i)
    return ccw === wantCcw ? idx : idx.reverse()
  }
  let poly = ring(outer, true)
  const holeRings = holes.map((h) => ring(h, false))
  // Loecher nacheinander einbinden, das am weitesten rechts liegende zuerst.
  holeRings.sort((a, b) => Math.max(...b.map((i) => pts[i][0])) - Math.max(...a.map((i) => pts[i][0])))
  for (const hole of holeRings) poly = bridge(poly, hole, pts)
  const triangles = earClip(poly, pts)
  // Vollstaendig: ein Vieleck mit n Punkten und h Loechern ergibt n + 2h - 2 Dreiecke.
  const complete = triangles.length === pts.length + 2 * holeRings.length - 2
  return { points: pts, triangles, complete }
}

/** Loch ueber eine Bruecke vom rechtesten Lochpunkt zu einem sichtbaren Randpunkt einfuegen. */
function bridge(poly, hole, pts) {
  let hi = 0
  for (let k = 1; k < hole.length; k++) if (pts[hole[k]][0] > pts[hole[hi]][0]) hi = k
  const M = pts[hole[hi]]
  // Strahl nach rechts: naechste geschnittene Kante.
  let best = Infinity, bestEdge = -1, bestX = 0
  for (let k = 0; k < poly.length; k++) {
    const a = pts[poly[k]], b = pts[poly[(k + 1) % poly.length]]
    if ((a[1] > M[1]) === (b[1] > M[1])) continue
    const x = a[0] + ((M[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1])
    if (x >= M[0] && x - M[0] < best) { best = x - M[0]; bestEdge = k; bestX = x }
  }
  if (bestEdge < 0) throw new Error('Loch liegt nicht im Vieleck')
  const ea = poly[bestEdge], eb = poly[(bestEdge + 1) % poly.length]
  let P = pts[ea][0] > pts[eb][0] ? bestEdge : (bestEdge + 1) % poly.length
  const I = [bestX, M[1]]
  // Liegen Randpunkte im Dreieck M-I-P, den mit dem kleinsten Winkel zum Strahl nehmen.
  const tri = [M, I, pts[poly[P]]]
  const ccwTri = cross(tri[0], tri[1], tri[2]) >= 0 ? tri : [tri[0], tri[2], tri[1]]
  let bestAngle = Infinity
  for (let k = 0; k < poly.length; k++) {
    const q = pts[poly[k]]
    if (k === P || q[0] < M[0]) continue
    if (!inTriangle(q, ccwTri[0], ccwTri[1], ccwTri[2])) continue
    const ang = Math.abs(Math.atan2(q[1] - M[1], q[0] - M[0]))
    if (ang < bestAngle) { bestAngle = ang; P = k }
  }
  // Kommt der Punkt mehrfach vor (Ende einer frueheren Bruecke), die Stelle nehmen, in deren
  // Winkel die neue Bruecke liegt - sonst kreuzte sie die alte.
  const target = poly[P]
  const sightOk = (k) => {
    const a = pts[poly[k]], prv = pts[poly[(k - 1 + poly.length) % poly.length]], nxt = pts[poly[(k + 1) % poly.length]]
    if (cross(prv, a, nxt) >= 0) return cross(a, nxt, M) >= 0 && cross(a, M, prv) >= 0
    return cross(a, nxt, M) >= 0 || cross(a, M, prv) >= 0
  }
  if (!sightOk(P)) {
    for (let k = 0; k < poly.length; k++) if (poly[k] === target && k !== P && sightOk(k)) { P = k; break }
  }
  const holeSeq = [...hole.slice(hi), ...hole.slice(0, hi), hole[hi]]
  return [...poly.slice(0, P + 1), ...holeSeq, poly[P], ...poly.slice(P + 1)]
}

function earClip(poly, pts) {
  // Doppelt verkettete Liste; nur einspringende Ecken koennen in einem Ohr liegen - nur sie pruefen.
  const n = poly.length
  const prev = new Int32Array(n), next = new Int32Array(n), alive = new Uint8Array(n).fill(1)
  for (let k = 0; k < n; k++) { prev[k] = (k - 1 + n) % n; next[k] = (k + 1) % n }
  const P = (k) => pts[poly[k]]
  const isReflex = (k) => cross(P(prev[k]), P(k), P(next[k])) <= 1e-12
  let reflex = new Set()
  for (let k = 0; k < n; k++) if (isReflex(k)) reflex.add(k)
  const same = (a, b) => a[0] === b[0] && a[1] === b[1]
  const isEar = (k) => {
    const ka = prev[k], kc = next[k]
    const a = P(ka), b = P(k), c = P(kc)
    if (cross(a, b, c) <= 1e-12) return false
    for (const r of reflex) {
      if (r === ka || r === k || r === kc) continue
      const q = P(r)
      if (same(q, a) || same(q, b) || same(q, c)) continue
      if (inTriangle(q, a, b, c)) return false
    }
    return true
  }
  const remove = (k) => {
    alive[k] = 0
    reflex.delete(k)
    next[prev[k]] = next[k]
    prev[next[k]] = prev[k]
    for (const j of [prev[k], next[k]]) { if (isReflex(j)) reflex.add(j); else reflex.delete(j) }
  }
  const tris = []
  let left = n
  let k = 0
  let sinceClip = 0
  while (left > 3 && sinceClip <= left) {
    const ka = prev[k], kc = next[k]
    if (poly[ka] === poly[kc]) {
      // Spitze einer Bruecke (a-b-a): b hat alle Dreiecke, ohne Dreieck entfernen. Punkte, die nur
      // auf einer Geraden liegen, bleiben - an ihnen haengen andere Flaechen (Lochwand), sonst
      // entstuende ein Spalt.
      remove(k); left--; k = kc; sinceClip = 0
      continue
    }
    if (isEar(k)) {
      tris.push([poly[ka], poly[k], poly[kc]])
      remove(k); left--; k = kc; sinceClip = 0
      continue
    }
    k = next[k]
    sinceClip++
  }
  if (left === 3) {
    const kc = next[k], ka = prev[k]
    if (cross(P(ka), P(k), P(kc)) > 1e-12) tris.push([poly[ka], poly[k], poly[kc]])
  }
  return tris
}

/**
 * Zwei Ringe um den Ursprung verbinden (beide sternfoermig, `inner` liegt ganz innerhalb von
 * `outer`, beide gegen den Uhrzeigersinn, Winkel steigend ab beliebigem Start). Liefert Dreiecke
 * aus Indizes: `inner[i]`, `outer[j]` sind Indizes in `coords` (Punkte [x, y]). Die Dreiecke
 * sind gegen den Uhrzeigersinn (Normale nach +z, wenn man von oben schaut).
 */
export function zipRings(inner, outer, coords) {
  const ang = (i) => Math.atan2(coords[i][1], coords[i][0])
  // Beide Ringe ab dem Punkt mit dem kleinsten Winkel >= -pi auslegen, Winkel aufsteigend entrollt.
  const unroll = (ring) => {
    let s = 0
    for (let k = 1; k < ring.length; k++) if (ang(ring[k]) < ang(ring[s])) s = k
    const seq = [...ring.slice(s), ...ring.slice(0, s)]
    const a = []
    let prev = -Infinity
    for (const i of seq) {
      let t = ang(i)
      while (t < prev) t += 2 * Math.PI
      a.push(t)
      prev = t
    }
    return { seq, a }
  }
  const I = unroll(inner), O = unroll(outer)
  const tris = []
  let i = 0, j = 0
  const ni = I.seq.length, no = O.seq.length
  const ai = (k) => I.a[k % ni] + 2 * Math.PI * Math.floor(k / ni)
  const ao = (k) => O.a[k % no] + 2 * Math.PI * Math.floor(k / no)
  while (i < ni || j < no) {
    const nextI = i < ni ? ai(i + 1) : Infinity
    const nextO = j < no ? ao(j + 1) : Infinity
    if (nextI <= nextO) {
      tris.push([I.seq[i % ni], O.seq[j % no], I.seq[(i + 1) % ni]])
      i++
    } else {
      tris.push([O.seq[j % no], O.seq[(j + 1) % no], I.seq[i % ni]])
      j++
    }
  }
  return tris
}

const LOOP_POINTS = 20

/**
 * Flaeche mit Loechern in einer Ebene: Rand `ring` (Indizes, sternfoermig um die Achse),
 * Loecher { cx, cy, r, z } (z: Hoehe des Lochrands, fuer Gefaelle). Innen ein kleiner Ring
 * (96 Punkte) mit den Loechern per Ohrenschnitt, aussen ein Reissverschluss zum Rand.
 * `down`: Normale nach unten. Liefert je Loch die Indizes seines Rands (gegen den Uhrzeigersinn).
 */
export function capWithHoles(ring, z, holes, down, verts, tris, addVertex) {
  const xy = (i) => [verts[i * 3], verts[i * 3 + 1]]
  if (!holes.length) {
    const c = addVertex(0, 0, z)
    for (let j = 0; j < ring.length; j++) {
      const k = (j + 1) % ring.length
      if (down) tris.push(c, ring[k], ring[j])
      else tris.push(c, ring[j], ring[k])
    }
    return []
  }
  // Innerer Ring = Rand, zur Mitte hin verkleinert: Ein um die Mitte sternfoermiger Rand bleibt
  // dabei ganz innen, und die beiden Ringe verbindet ein einfacher Streifen. Der Faktor ist so
  // gross, dass alle Loecher in den inneren Ring passen.
  const radiusAt = (a) => {
    // Schnitt des Strahls unter Winkel a mit dem Rand.
    const dx = Math.cos(a), dy = Math.sin(a)
    let best = Infinity
    for (let j = 0; j < ring.length; j++) {
      const [x0, y0] = xy(ring[j]), [x1, y1] = xy(ring[(j + 1) % ring.length])
      const ex = x1 - x0, ey = y1 - y0
      const den = dx * ey - dy * ex
      if (Math.abs(den) < 1e-12) continue
      const t = (x0 * ey - y0 * ex) / den
      const u = (x0 * dy - y0 * dx) / den
      if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t)
    }
    return Number.isFinite(best) ? best : 1
  }
  let f = 0.5
  for (const h of holes) {
    // Der Rand des Lochs, ringsum dicht gemessen: Der Rand kann sich zwischen zwei Messstellen
    // naeher an das Loch heranwinden (Ecken, Rippen).
    for (let k = 0; k < 48; k++) {
      const a = (2 * Math.PI * k) / 48
      const px = h.cx + (h.r + 0.3) * Math.cos(a), py = h.cy + (h.r + 0.3) * Math.sin(a)
      f = Math.max(f, (Math.hypot(px, py) + 0.6) / Math.max(1e-6, radiusAt(Math.atan2(py, px))))
    }
  }
  f = Math.min(f, 0.985)
  const kRing = ring.map((i) => { const [x, y] = xy(i); return addVertex(x * f, y * f, z) })
  for (let j = 0; j < ring.length; j++) {
    const k = (j + 1) % ring.length
    if (down) { tris.push(kRing[j], ring[k], ring[j]); tris.push(kRing[j], kRing[k], ring[k]) }
    else { tris.push(kRing[j], ring[j], ring[k]); tris.push(kRing[j], ring[k], kRing[k]) }
  }
  // Lochraender leicht gedreht: Kein Lochpunkt liegt dann genau auf der Hoehe eines anderen Punkts,
  // das haelt den Ohrenschnitt von Sonderfaellen fern.
  const loops = holes.map((h, k) => circle(h.cx, h.cy, h.r, LOOP_POINTS, false, 0.1234 + 0.377 * k).map(([x, y]) => addVertex(x, y, h.z ?? z)))
  let t = triangulate(kRing.map(xy), loops.map((l) => l.map(xy)))
  let rim = kRing
  if (!t.complete) {
    // Ein Loch ragt ueber den inneren Ring: ohne ihn direkt im Rand triangulieren (langsamer, aber
    // genau). Der Streifen zum inneren Ring faellt dann weg.
    tris.length -= ring.length * 6
    t = triangulate(ring.map(xy), loops.map((l) => l.map(xy)))
    rim = ring
    if (!t.complete) throw new Error('Ein Loch im Boden liegt zu nah am Rand – weniger oder kleinere Löcher wählen.')
  }
  const map = [...rim, ...loops.flat()]
  for (const [a, b, c] of t.triangles) {
    if (down) tris.push(map[a], map[c], map[b])
    else tris.push(map[a], map[b], map[c])
  }
  return loops
}

/** Wand eines Lochs zwischen zwei gleichen Lochraendern (unten `a`, oben `b`); Normale zur Lochmitte. */
export function holeWall(a, b, tris) {
  for (let k = 0; k < a.length; k++) {
    const k1 = (k + 1) % a.length
    tris.push(a[k], b[k1], a[k1])
    tris.push(a[k], b[k], b[k1])
  }
}

/** Decke eines blinden Lochs (Normale nach unten, in das Loch hinein). */
export function holeCeiling(loop, h, z, tris, addVertex) {
  const c = addVertex(h.cx, h.cy, z)
  for (let k = 0; k < loop.length; k++) tris.push(c, loop[(k + 1) % loop.length], loop[k])
}

/**
 * Baukasten fuer geschlossene Netze: Punkte und Dreiecke sammeln, Ringe um die z-Achse,
 * Waende zwischen Ringen, Raender, Flaechen mit Loechern, Drehkoerper, Quader.
 * Konvention: Dreiecke gegen den Uhrzeigersinn von aussen gesehen (Normale nach aussen).
 */
export class MeshBuilder {
  constructor() {
    this.verts = []
    this.tris = []
    this.addVertex = (x, y, z) => {
      this.verts.push(x, y, z)
      return this.verts.length / 3 - 1
    }
  }

  /** Ring mit n Punkten: Radius r(theta), Hoehe z(theta) (Zahl oder Funktion), Winkel ab `phase`. */
  ring(n, r, z, phase = 0) {
    const row = new Array(n)
    for (let j = 0; j < n; j++) {
      const a = phase + (2 * Math.PI * j) / n
      const rr = typeof r === 'function' ? r(a) : r
      const zz = typeof z === 'function' ? z(a) : z
      row[j] = this.addVertex(rr * Math.cos(a), rr * Math.sin(a), zz)
    }
    return row
  }

  /** Wand durch Ringe (von unten nach oben). `inward`: Normale zur Achse hin (Innenwand). */
  wall(rows, inward = false) {
    const n = rows[0].length
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1]
      for (let j = 0; j < n; j++) {
        const k = (j + 1) % n
        if (inward) { this.tris.push(a[j], b[k], a[k]); this.tris.push(a[j], b[j], b[k]) }
        else { this.tris.push(a[j], a[k], b[k]); this.tris.push(a[j], b[k], b[j]) }
      }
    }
  }

  /** Streifen zwischen zwei gleich langen Ringen: Rand oben (`up`) oder unten. Aussen = `outer`. */
  band(outer, inner, up) {
    const n = outer.length
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n
      if (up) { this.tris.push(outer[j], outer[k], inner[k]); this.tris.push(outer[j], inner[k], inner[j]) }
      else { this.tris.push(outer[j], inner[k], outer[k]); this.tris.push(outer[j], inner[j], inner[k]) }
    }
  }

  /** Ebene Flaeche ueber einem Ring (sternfoermig um die Achse), mit Loechern; gibt Lochraender zurueck. */
  cap(ring, z, holes = [], down = false) {
    return capWithHoles(ring, z, holes, down, this.verts, this.tris, this.addVertex)
  }

  /** Durchgehende Loecher: Wand zwischen den Lochraendern unten und oben. */
  holeWalls(lower, upper) {
    lower.forEach((loop, k) => holeWall(loop, upper[k], this.tris))
  }

  /**
   * Drehkoerper: geschlossenes Profil [[r, z], ...] gegen den Uhrzeigersinn (r nach rechts, z nach
   * oben) um die z-Achse, n Teile. Punkte mit r = 0 werden ein einzelner Punkt auf der Achse.
   * `transform(x, y, z)` verschiebt/schert jeden Punkt (z. B. Spreizung eines Beins).
   */
  lathe(profile, n, { phase = 0, transform = null } = {}) {
    const rings = profile.map(([r, z]) => {
      if (r <= 1e-9) {
        const [x, y, zz] = transform ? transform(0, 0, z) : [0, 0, z]
        return { axis: this.addVertex(x, y, zz) }
      }
      const row = new Array(n)
      for (let j = 0; j < n; j++) {
        const a = phase + (2 * Math.PI * j) / n
        const [x, y, zz] = transform ? transform(r * Math.cos(a), r * Math.sin(a), z) : [r * Math.cos(a), r * Math.sin(a), z]
        row[j] = this.addVertex(x, y, zz)
      }
      return { row }
    })
    // Profil gegen den Uhrzeigersinn: Abschnitt i -> i+1 ist eine Flaeche mit Normale nach aussen.
    for (let i = 0; i < rings.length; i++) {
      const A = rings[i], B = rings[(i + 1) % rings.length]
      for (let j = 0; j < n; j++) {
        const k = (j + 1) % n
        if (A.row && B.row) { this.tris.push(A.row[j], B.row[k], B.row[j]); this.tris.push(A.row[j], A.row[k], B.row[k]) }
        else if (A.row && B.axis !== undefined) this.tris.push(A.row[j], A.row[k], B.axis)
        else if (A.axis !== undefined && B.row) this.tris.push(A.axis, B.row[k], B.row[j])
      }
    }
  }

  /** Quader (Mitte cx, cy, z von z0 bis z1, Breite w quer, Laenge l laengs), um `angle` gedreht. */
  box(cx, cy, z0, z1, l, w, angle = 0) {
    const c = Math.cos(angle), s = Math.sin(angle)
    const pt = (u, v, z) => this.addVertex(cx + u * c - v * s, cy + u * s + v * c, z)
    const lo = [pt(-l / 2, -w / 2, z0), pt(l / 2, -w / 2, z0), pt(l / 2, w / 2, z0), pt(-l / 2, w / 2, z0)]
    const hi = [pt(-l / 2, -w / 2, z1), pt(l / 2, -w / 2, z1), pt(l / 2, w / 2, z1), pt(-l / 2, w / 2, z1)]
    this.tris.push(lo[0], lo[2], lo[1], lo[0], lo[3], lo[2])
    this.tris.push(hi[0], hi[1], hi[2], hi[0], hi[2], hi[3])
    this.wall([lo, hi])
  }

  /** Netz { vertices, indices } (Float64Array, Uint32Array). */
  mesh() {
    return { vertices: Float64Array.from(this.verts), indices: Uint32Array.from(this.tris) }
  }
}
