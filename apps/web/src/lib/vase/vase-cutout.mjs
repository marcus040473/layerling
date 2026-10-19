/**
 * Durchbrochene Wand: Lochmuster als Abstandsfeld und ein Netz-Baustein fuer ein Stueck Wand
 * zwischen zwei Hoehen, mit Loechern durch Aussen- und Innenwand.
 *
 * Feld f(Winkel, Hoehe) in mm: > 0 Material, < 0 Loch; |f| ist ungefaehr der Abstand zum Lochrand.
 * Gerechnet wird in (u = Winkel x Bezugsradius, z) mit einem oertlichen Massstab: waagerecht zaehlt
 * der echte Umfang in dieser Hoehe. So bleiben Stege auch dort so breit wie eingestellt, wo die
 * Vase schmal ist (die Loecher werden dort kleiner). Rundum passt immer eine ganze Zahl von Zellen.
 *
 * Am Rand des Bereichs werden Loecher angeschnitten (Vorgabe) oder - wie beim Perforieren in SolidCraft
 * (Loch nur bei Randabstand) - nur ganze Loecher gesetzt: Zellen, deren Loch ueber den Bereich hinausragt,
 * bleiben voll, und die Reihen stehen mittig im Bereich (oben und unten gleich viel Rand).
 *
 * Netz: Marching Squares auf dem Raster (Spalten = Winkel, Zeilen = Hoehen). Jede Rasterzelle traegt
 * ihr Stueck Material als konvexes Vieleck; Schnittpunkte auf Rasterkanten teilen sich die
 * Nachbarzellen. Dieselbe Triangulierung liegt auf der Aussen- und (umgekehrt) auf der Innenwand;
 * jede offene Kante bekommt eine Wand zwischen beiden. Das Netz bleibt geschlossen.
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
 * Lochmuster als Feld. `Rref`: Bezugsradius (mm) fuer die Zellen rundum; `scale(z)`: echter
 * Umfang / Bezugsumfang in Hoehe z; `whole`: { z0, z1 } - nur ganze Loecher zwischen diesen Hoehen,
 * Reihen mittig. Liefert { field(theta, z), cellsAround, cellWidth, cellHeight, rows? } (`rows`: so viele
 * Lochreihen passen bei `whole`, Voronoi ausgenommen).
 */
export function cutoutPattern(p, { Rref, scale, whole = null }) {
  const kind = p.cutout
  const around = Math.max(3, Math.round((2 * Math.PI * Rref) / p.cutoutSize))
  const cw = (2 * Math.PI * Rref) / around
  const ch = cw * p.cutoutAspect
  const web = p.cutoutWeb
  const U = 2 * Math.PI * Rref
  const uOf = (theta) => ((((theta / (2 * Math.PI)) % 1) + 1) % 1) * U
  // Gitterpunkte (Zellmitten) in Zelle (i, j) des Rasters cw x ch; i wird rundum umgebrochen.
  const wrap = (i) => ((i % around) + around) % around
  const site = kind === 'voronoi'
    ? (i, j) => [(i + 0.1 + 0.8 * hash2(wrap(i), j, p.cutoutSeed)) * cw, (j + 0.1 + 0.8 * hash2(wrap(i), j, p.cutoutSeed + 7919)) * ch]
    // Waben und Kreise: Dreiecksgitter, jede zweite Reihe um eine halbe Zelle versetzt (Sechsecke als Voronoi-Zellen).
    : (i, j) => [(i + (j & 1 ? 0.5 : 0)) * cw, j * ch * (Math.sqrt(3) / 2)]
  const rowH = kind === 'voronoi' ? ch : ch * (Math.sqrt(3) / 2)
  // Gitterpunkte um einen Ort sammeln (rundum umgebrochen); oertliches Mass: waagerecht x k.
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
  // Muster in (u, z) mit oertlichem Mass k; `shift` verschiebt die Reihen in der Hoehe (nur ganze Loecher).
  let shift = 0
  // value(u, z, k): Feld; cellAt(u, z, k): Zelle als Schluessel; spanOf(Zelle): Hoehen [unten, oben] ihres Lochs oder null.
  let value, cellAt, spanOf
  if (kind === 'rauten') {
    // Rauten: Kanten sind die Geraden u/cw +- z/ch = n + 1/2; Abstand zur naechsten im oertlichen Mass.
    const normAt = (k) => Math.sqrt(1 / (cw * k) ** 2 + 1 / ch ** 2)
    value = (u, z, k) => {
      const x = u / cw, y = z / ch, norm = normAt(k)
      const dist = (s) => Math.abs(s - 0.5 - Math.round(s - 0.5)) / norm
      return web / 2 - Math.min(dist(x + y), dist(x - y))
    }
    // Raute m, n: Mitte bei x + y = m, x - y = n; ihr Loch reicht senkrecht ch (1/2 - Steg/2 im Mass der Kanten).
    cellAt = (u, z) => [Math.round(u / cw + z / ch), Math.round(u / cw - z / ch)]
    spanOf = ([m, n]) => {
      const zc = (ch * (m - n)) / 2
      const e = ch * (0.5 - (web / 2) * normAt(scale(zc + shift)))
      return e > 0 ? [zc - e, zc + e] : null
    }
  } else {
    // Naechster Gitterpunkt; liefert seine Nummer in `collect`.
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
      // Kleinster Abstand zweier Nachbarn in dieser Hoehe: waagerecht cw x k, schraeg (cw/2 x k, Reihenhoehe).
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
      // Voronoi und Waben: Abstand zum Rand der eigenen Zelle = kleinster Abstand zu den
      // Mittelsenkrechten zu allen Nachbarn (nicht nur zum zweitnaechsten - sonst laufen Loecher an
      // den Ecken, wo drei Zellen zusammenstossen, zu weit aufeinander zu).
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
      // Loch = Zelle, um die halbe Stegbreite nach innen versetzt: ein grosses Viereck an allen
      // Mittelsenkrechten abschneiden (je Nachbar d: x . d <= |d|^2/2 - Steg/2 |d|), dann hoechster und tiefster Punkt.
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
    // Reihen mittig: eine Reihe in der Mitte des Bereichs oder zwei je eine halbe Reihe daneben -
    // was mehr ganze Reihen ergibt (bei Gleichstand die Mitte).
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
    // Nur ganze Loecher: ragt das Loch dieser Zelle ueber den Bereich, bleibt die Zelle voll (am Zellrand
    // ist das Feld schon Steg/2 - der Uebergang bleibt stetig).
    const span = spanFor(cellAt(u, zp, k))
    return span && (span[0] + shift < whole.z0 - 1e-6 || span[1] + shift > whole.z1 + 1e-6) ? Math.max(f, web / 2) : f
  }
  return { field, cellsAround: around, cellWidth: cw, cellHeight: ch, rows }
}

/** Vieleck (Liste [x, y]) an der Halbebene a x + b y <= c abschneiden (Sutherland-Hodgman). */
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
 * Wandstueck zwischen den Zeilen `zs[0]` und `zs.at(-1)` an den Spalten `thetas` (rundum, steigend).
 * `F[i][j]`: Feld an Zeile i, Spalte j (> 0 Material). `outer(theta, z)`/`inner(theta, z)`: Punkt der
 * Aussen-/Innenwand. `bottom`/`top`: { outer, inner } - vorhandene Punkte der Nachbarwand (dann muss
 * die Zeile ganz Material sein); `bottom.open`: die unterste Zeile ist der Rand des Teils (Kabelschlitz
 * von unten) - ihre Punkte werden genutzt, aber offene Kanten bekommen einen Streifen zwischen Aussen-
 * und Innenwand. Neue Dreiecke landen in `tris`; die Nummern der Lochwaende und Streifen in
 * `locked` (dort soll der Oberflaechen-Kern kein Muster aufbringen).
 */
export function wallZone({ thetas, zs, F, outer, inner, bottom, top, tris, addVertex, locked }) {
  const J = thetas.length
  const m = zs.length - 1
  const theta = (j) => (j < J ? thetas[j] : thetas[j - J] + 2 * Math.PI)
  const solid = (i, j) => F[i][j % J] >= 0
  // Punkte des ebenen Rasters, durchnummeriert: Ecken, Schnitte auf waagerechten, auf senkrechten Kanten.
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
  // Schnittpunkt auf einer Rasterkante; t nie ganz an einer Ecke (sonst entstuenden Splitter).
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
      // Sattel: zwei gegenueberliegende Ecken Material - die Mitte entscheidet, ob sie verbunden sind.
      const center = F[i][j % J] + F[i][(j + 1) % J] + F[i + 1][(j + 1) % J] + F[i + 1][j % J]
      if (s0 && s2 && !s1 && !s3 && center < 0) {
        polys.push([corner(i, j), hCross(i, j), vCross(i, j)], [vCross(i, j + 1), corner(i + 1, j + 1), hCross(i + 1, j)])
        continue
      }
      if (s1 && s3 && !s0 && !s2 && center < 0) {
        polys.push([hCross(i, j), corner(i, j + 1), vCross(i, j + 1)], [hCross(i + 1, j), corner(i + 1, j), vCross(i, j)])
        continue
      }
      // Rundgang gegen den Uhrzeigersinn: Ecken aus Material, dazwischen die Schnittpunkte.
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
  // Flaechen: aussen gegen den Uhrzeigersinn (von aussen gesehen), innen umgekehrt.
  const edges = new Set()
  for (const poly of polys) {
    for (let k = 1; k + 1 < poly.length; k++) {
      tris.push(vOut[poly[0]], vOut[poly[k]], vOut[poly[k + 1]])
      tris.push(vIn[poly[0]], vIn[poly[k + 1]], vIn[poly[k]])
    }
    for (let k = 0; k < poly.length; k++) edges.add(poly[k] * N + poly[(k + 1) % poly.length])
  }
  // Offene Kanten: Lochrand, offener unterer/oberer Rand. Kanten auf einer angeschlossenen Randzeile
  // gehoeren zur Nachbarwand.
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
