/**
 * Eine Oberflaeche vom Anker aus abrollen, wie ein Etikett, das man andrueckt (unfoldSurface), und der naechste
 * Punkt der Oberflaeche (nearestSurfacePoint). Aus dem Kern des Oberflaechen-Werkzeugs
 * (texture-core.mjs des Vasen-Werkzeugs) herausgezogen, samt der Hilfen, die sie brauchen. Reines ES-Modul.
 */

const AXIS_INDEX = { x: 0, y: 1, z: 2 }

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function pointTriangleDistance2(p, v, ia, ib, ic) {
  const q = closestOnTriangle(p, v, ia, ib, ic)
  return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2
}

/** Naechster Punkt auf dem Dreieck (Ericson, Real-Time Collision Detection, 5.1.5). */
function closestOnTriangle(p, v, ia, ib, ic) {
  const a = [v[ia * 3], v[ia * 3 + 1], v[ia * 3 + 2]]
  const b = [v[ib * 3], v[ib * 3 + 1], v[ib * 3 + 2]]
  const c = [v[ic * 3], v[ic * 3 + 1], v[ic * 3 + 2]]
  const sub = (x, y) => [x[0] - y[0], x[1] - y[1], x[2] - y[2]]
  const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2]
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a)
  const d1 = dot(ab, ap), d2 = dot(ac, ap)
  let q
  if (d1 <= 0 && d2 <= 0) q = a
  else {
    const bp = sub(p, b)
    const d3 = dot(ab, bp), d4 = dot(ac, bp)
    if (d3 >= 0 && d4 <= d3) q = b
    else {
      const vc = d1 * d4 - d3 * d2
      if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const t = d1 / (d1 - d3)
        q = [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]]
      } else {
        const cp = sub(p, c)
        const d5 = dot(ab, cp), d6 = dot(ac, cp)
        if (d6 >= 0 && d5 <= d6) q = c
        else {
          const vb = d5 * d2 - d1 * d6
          if (vb <= 0 && d2 >= 0 && d6 <= 0) {
            const t = d2 / (d2 - d6)
            q = [a[0] + t * ac[0], a[1] + t * ac[1], a[2] + t * ac[2]]
          } else {
            const va = d3 * d6 - d5 * d4
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              const t = (d4 - d3) / (d4 - d3 + (d5 - d6))
              q = [b[0] + t * (c[0] - b[0]), b[1] + t * (c[1] - b[1]), b[2] + t * (c[2] - b[2])]
            } else {
              const denom = 1 / (va + vb + vc)
              const s = vb * denom, w = vc * denom
              q = [a[0] + ab[0] * s + ac[0] * w, a[1] + ab[1] * s + ac[1] * w, a[2] + ab[2] * s + ac[2] * w]
            }
          }
        }
      }
    }
  }
  return q
}

/**
 * Naechster Punkt der Oberflaeche zu `point`: { face, point, distance }. Grobe Vorauswahl je Dreieck ueber
 * eine umschliessende Kugel (Schwerpunkt, groesster Eckabstand), genau nur fuer die, die naeher sein koennen.
 */
export function nearestSurfacePoint(mesh, point) {
  const v = mesh.vertices, I = mesh.indices
  let best = -1, bestD = Infinity
  for (let t = 0; t < I.length / 3; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3
    const cx = (v[a] + v[b] + v[c]) / 3, cy = (v[a + 1] + v[b + 1] + v[c + 1]) / 3, cz = (v[a + 2] + v[b + 2] + v[c + 2]) / 3
    const r = Math.sqrt(Math.max((v[a] - cx) ** 2 + (v[a + 1] - cy) ** 2 + (v[a + 2] - cz) ** 2, (v[b] - cx) ** 2 + (v[b + 1] - cy) ** 2 + (v[b + 2] - cz) ** 2, (v[c] - cx) ** 2 + (v[c + 1] - cy) ** 2 + (v[c + 2] - cz) ** 2))
    const lower = Math.hypot(point[0] - cx, point[1] - cy, point[2] - cz) - r
    if (lower > 0 && lower * lower >= bestD) continue
    const d = pointTriangleDistance2(point, v, I[t * 3], I[t * 3 + 1], I[t * 3 + 2])
    if (d < bestD) {
      bestD = d
      best = t
    }
  }
  if (best < 0) return null
  return { face: best, point: closestOnTriangle(point, v, I[best * 3], I[best * 3 + 1], I[best * 3 + 2]), distance: Math.sqrt(bestD) }
}

/** Je Punkt die anliegenden Dreiecke (CSR), einmal je Netz. */
const faceIndexCache = new WeakMap()

function vertexFaces(n, I) {
  let idx = faceIndexCache.get(I)
  if (idx && idx.n === n) return idx
  const start = new Uint32Array(n + 1)
  for (let t = 0; t < I.length; t++) start[I[t] + 1]++
  for (let i = 0; i < n; i++) start[i + 1] += start[i]
  const fill = start.slice(0, n)
  const list = new Uint32Array(I.length)
  for (let t = 0; t < I.length; t++) list[fill[I[t]]++] = (t / 3) | 0
  idx = { n, start, list }
  faceIndexCache.set(I, idx)
  return idx
}

/**
 * Richtung „oben“ der Schrift auf einer Flaeche mit Normale `n`: der Wunsch (`up`, sonst die Achse) in die
 * Flaeche gelegt. Steht er fast senkrecht auf ihr (Deckel, Boden), gilt die naechste Weltachse (Y, Z, X).
 */
function tangentUp(n, up, axisIndex) {
  const axis = [0, 0, 0]
  axis[axisIndex] = 1
  for (const cand of [up, axis, [0, 1, 0], [0, 0, 1], [1, 0, 0]]) {
    if (!cand) continue
    const d = cand[0] * n[0] + cand[1] * n[1] + cand[2] * n[2]
    const t = [cand[0] - d * n[0], cand[1] - d * n[1], cand[2] - d * n[2]]
    const l = Math.hypot(...t)
    if (l >= 0.25 * Math.hypot(...cand)) return t.map((c) => c / l)
  }
  return [0, 0, 1]
}

/** Kleinster Abstand des Ursprungs zum Dreieck (2D). */
function originTriangleDistance(ax, ay, bx, by, cx, cy) {
  const s1 = ax * by - ay * bx, s2 = bx * cy - by * cx, s3 = cx * ay - cy * ax
  if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) return 0
  const seg = (px, py, qx, qy) => {
    const dx = qx - px, dy = qy - py, l2 = dx * dx + dy * dy
    const t = l2 > 0 ? clamp(-(px * dx + py * dy) / l2, 0, 1) : 0
    return Math.hypot(px + t * dx, py + t * dy)
  }
  return Math.min(seg(ax, ay, bx, by), seg(bx, by, cx, cy), seg(cx, cy, ax, ay))
}

/**
 * Oberflaeche vom Anker aus abrollen - wie ein Etikett, das man andrueckt. Liefert je Punkt die Lage in der
 * Abwicklung (U nach rechts, V nach oben, in mm, von aussen gesehen; NaN = nicht erreicht) und den Rahmen am
 * Anker. Jedes Dreieck bekommt eine starre Karte (Raum -> Ebene): das Dreieck unter dem Anker die Ebene durch
 * ihn, jedes weitere die seines Nachbarn, um die gemeinsame Kante in dessen Ebene gedreht - in derselben Ebene
 * unveraendert uebernommen, so wachsen auf ebenen Flaechen keine Rundungsfehler an (ueber Ketten schmaler
 * Dreiecke wuerden sie sich sonst bis in mm aufschaukeln). Reihenfolge nach Abstand der Karte vom Anker (wie
 * Dijkstra), nur bis `reach`. Ein Punkt nimmt die Karte seines naechsten Dreiecks; passen andere bis auf 0,05 mm,
 * wird gemittelt (glaettet die Naehte auf doppelt gekruemmten Flaechen). Abwickelbare Flaechen (eben, Zylinder,
 * Kegel, Kasten ueber die Kante) sind so laengentreu; eine Kugel leicht verzerrt, wie jeder Aufkleber dort.
 *   mesh: { vertices, indices }; anchor: [x, y, z]; up: Richtung oben (oder null);
 *   axis: 'x' | 'y' | 'z' (Rueckfall fuer oben); face: Dreieck unter dem Anker, falls bekannt.
 */
export function unfoldSurface(mesh, anchor, { up = null, axis = 'z', reach = Infinity, face = -1, window = null } = {}) {
  const v = mesh.vertices, I = mesh.indices
  const n = v.length / 3, T = I.length / 3
  const U = new Float64Array(n).fill(NaN), V = new Float64Array(n).fill(NaN)
  const hit = face >= 0 && face < T ? { face, point: closestOnTriangle(anchor, v, I[face * 3], I[face * 3 + 1], I[face * 3 + 2]) } : nearestSurfacePoint(mesh, anchor)
  if (!hit) return { U, V, reached: 0, torn: 0, face: -1, point: anchor, normal: [0, 0, 1], up: [0, 1, 0], right: [1, 0, 0] }
  // Nur die erreichten Dreiecke bekommen einen Platz (slot) in den Listen - das Netz kann gross sein.
  const slot = new Int32Array(T).fill(-1)
  const FN = [], fnOk = [], M = [], t2 = [], CN = [], PM = [], PT = [], PN = [], prio = [], done = []
  const slotOf = (f) => {
    let k = slot[f]
    if (k >= 0) return k
    k = prio.length
    slot[f] = k
    prio.push(Infinity)
    done.push(0)
    fnOk.push(0)
    for (let j = 0; j < 3; j++) { FN.push(0); CN.push(0); PN.push(0) }
    for (let j = 0; j < 6; j++) { M.push(0); PM.push(0) }
    t2.push(0, 0)
    PT.push(0, 0)
    return k
  }
  // Flaechennormale (Laenge 1) eines Dreiecks; false, wenn es keine Flaeche hat.
  const unitInto = (f) => {
    const sf = slotOf(f)
    if (fnOk[sf]) return fnOk[sf] === 1
    const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2]
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2]
    const x = uy * wz - uz * wy, y = uz * wx - ux * wz, z = ux * wy - uy * wx
    const l = Math.hypot(x, y, z)
    if (l > 1e-14) {
      FN[sf * 3] = x / l
      FN[sf * 3 + 1] = y / l
      FN[sf * 3 + 2] = z / l
      fnOk[sf] = 1
      return true
    }
    fnOk[sf] = 2
    return false
  }
  const f0 = hit.face, q = hit.point
  const s0 = slotOf(f0)
  const normal = unitInto(f0) ? [FN[s0 * 3], FN[s0 * 3 + 1], FN[s0 * 3 + 2]] : [0, 0, 1]
  const upT = tangentUp(normal, up, AXIS_INDEX[axis] ?? 2)
  // rechts = oben x Normale: von aussen gesehen (Blick gegen die Normale) zeigt es nach rechts.
  const right = [upT[1] * normal[2] - upT[2] * normal[1], upT[2] * normal[0] - upT[0] * normal[2], upT[0] * normal[1] - upT[1] * normal[0]]
  // Karte je Dreieck (Platz k): uv = M x + t (M: 2 x 3, Zeilen = rechts und oben in der abgerollten Ebene);
  // daneben die Normale, mit der die Karte gilt (fuer das Drehen an der naechsten Kante). P*: bester Vorschlag.
  const mapX = (k, i) => M[k * 6] * v[i * 3] + M[k * 6 + 1] * v[i * 3 + 1] + M[k * 6 + 2] * v[i * 3 + 2] + t2[k * 2]
  const mapY = (k, i) => M[k * 6 + 3] * v[i * 3] + M[k * 6 + 4] * v[i * 3 + 1] + M[k * 6 + 5] * v[i * 3 + 2] + t2[k * 2 + 1]
  // Bereich: Fenster der Schrift (gedreht, mit Rand) oder ein Kreis mit Radius `reach`.
  let ca = 1, sa = 0
  if (window) {
    const a = ((window.turn || 0) * Math.PI) / 180
    ca = Math.cos(a)
    sa = Math.sin(a)
  }
  const tmp = new Float64Array(6)
  /** Abstand der Karte (tmp, tt0, tt1) des Dreiecks g vom Anker; Infinity ausserhalb des Bereichs. */
  const distOf = (g, tt0, tt1) => {
    const xs = [0, 0, 0], ys = [0, 0, 0]
    for (let k = 0; k < 3; k++) {
      const i = I[g * 3 + k] * 3
      xs[k] = tmp[0] * v[i] + tmp[1] * v[i + 1] + tmp[2] * v[i + 2] + tt0
      ys[k] = tmp[3] * v[i] + tmp[4] * v[i + 1] + tmp[5] * v[i + 2] + tt1
    }
    if (window) {
      let lo0 = Infinity, hi0 = -Infinity, lo1 = Infinity, hi1 = -Infinity
      for (let k = 0; k < 3; k++) {
        const S = xs[k] * ca + ys[k] * sa, R = -xs[k] * sa + ys[k] * ca
        if (S < lo0) lo0 = S
        if (S > hi0) hi0 = S
        if (R < lo1) lo1 = R
        if (R > hi1) hi1 = R
      }
      if (hi0 < -window.halfW || lo0 > window.halfW || hi1 < -window.halfH || lo1 > window.halfH) return Infinity
    }
    const d = originTriangleDistance(xs[0], ys[0], xs[1], ys[1], xs[2], ys[2])
    return d > reach ? Infinity : d
  }
  {
    const src = [...right, ...upT]
    for (let k = 0; k < 6; k++) M[s0 * 6 + k] = src[k]
    t2[s0 * 2] = -(right[0] * q[0] + right[1] * q[1] + right[2] * q[2])
    t2[s0 * 2 + 1] = -(upT[0] * q[0] + upT[1] * q[1] + upT[2] * q[2])
    for (let k = 0; k < 3; k++) CN[s0 * 3 + k] = normal[k]
    prio[s0] = 0
  }
  const { start, list } = vertexFaces(n, I)
  // Warteschlange (Binaerheap) nach Abstand der Karte vom Anker; veraltete Eintraege werden uebersprungen.
  const hk = [], hv = []
  const push = (key, f) => {
    let i = hk.length
    hk.push(key)
    hv.push(f)
    while (i > 0) {
      const pa = (i - 1) >> 1
      if (hk[pa] <= key) break
      hk[i] = hk[pa]
      hv[i] = hv[pa]
      i = pa
    }
    hk[i] = key
    hv[i] = f
  }
  const pop = () => {
    const top = hv[0]
    const lk = hk.pop(), lv = hv.pop()
    if (hk.length) {
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        if (l >= hk.length) break
        const r = l + 1
        const c = r < hk.length && hk[r] < hk[l] ? r : l
        if (hk[c] >= lk) break
        hk[i] = hk[c]
        hv[i] = hv[c]
        i = c
      }
      hk[i] = lk
      hv[i] = lv
    }
    return top
  }
  const order = []
  /**
   * Nachbar g ueber die Kante a-b von f: g um die Kante in die Ebene von f drehen (Rodrigues), Karte nach tmp,
   * Rueckgabe die Verschiebung [t0, t1] und die Normale, mit der sie gilt. In derselben Ebene: Karte von f.
   */
  const hinge = (sf, g, a, b) => {
    const nf0 = CN[sf * 3], nf1 = CN[sf * 3 + 1], nf2 = CN[sf * 3 + 2]
    for (let k = 0; k < 6; k++) tmp[k] = M[sf * 6 + k]
    const tf0 = t2[sf * 2], tf1 = t2[sf * 2 + 1]
    if (!unitInto(g)) return [tf0, tf1, nf0, nf1, nf2]
    const sg = slot[g]
    const ng0 = FN[sg * 3], ng1 = FN[sg * 3 + 1], ng2 = FN[sg * 3 + 2]
    const c0 = ng1 * nf2 - ng2 * nf1, c1 = ng2 * nf0 - ng0 * nf2, c2 = ng0 * nf1 - ng1 * nf0
    if (Math.hypot(c0, c1, c2) < 1e-10) return [tf0, tf1, ng0, ng1, ng2]
    const ex = v[b * 3] - v[a * 3], ey = v[b * 3 + 1] - v[a * 3 + 1], ez = v[b * 3 + 2] - v[a * 3 + 2]
    const el = Math.hypot(ex, ey, ez)
    if (el < 1e-14) return [tf0, tf1, ng0, ng1, ng2]
    const e0 = ex / el, e1 = ey / el, e2 = ez / el
    const th = Math.atan2(c0 * e0 + c1 * e1 + c2 * e2, ng0 * nf0 + ng1 * nf1 + ng2 * nf2)
    const c = Math.cos(th), sn = Math.sin(th), C = 1 - c
    const R0 = c + e0 * e0 * C, R1 = e0 * e1 * C - e2 * sn, R2 = e0 * e2 * C + e1 * sn
    const R3 = e1 * e0 * C + e2 * sn, R4 = c + e1 * e1 * C, R5 = e1 * e2 * C - e0 * sn
    const R6 = e2 * e0 * C - e1 * sn, R7 = e2 * e1 * C + e0 * sn, R8 = c + e2 * e2 * C
    const m0 = M[sf * 6], m1 = M[sf * 6 + 1], m2 = M[sf * 6 + 2], m3 = M[sf * 6 + 3], m4 = M[sf * 6 + 4], m5 = M[sf * 6 + 5]
    tmp[0] = m0 * R0 + m1 * R3 + m2 * R6
    tmp[1] = m0 * R1 + m1 * R4 + m2 * R7
    tmp[2] = m0 * R2 + m1 * R5 + m2 * R8
    tmp[3] = m3 * R0 + m4 * R3 + m5 * R6
    tmp[4] = m3 * R1 + m4 * R4 + m5 * R7
    tmp[5] = m3 * R2 + m4 * R5 + m5 * R8
    // Der Punkt a bleibt, wo er in f liegt: t_g = t_f + M_f a - M_g a.
    const ax = v[a * 3], ay = v[a * 3 + 1], az = v[a * 3 + 2]
    return [
      tf0 + m0 * ax + m1 * ay + m2 * az - (tmp[0] * ax + tmp[1] * ay + tmp[2] * az),
      tf1 + m3 * ax + m4 * ay + m5 * az - (tmp[3] * ax + tmp[4] * ay + tmp[5] * az),
      ng0, ng1, ng2,
    ]
  }
  push(0, f0)
  let first = true
  while (hk.length) {
    const key = hk[0]
    const f = pop()
    const sf = slot[f]
    if (done[sf] || key > prio[sf]) continue
    if (!first) {
      for (let k = 0; k < 6; k++) M[sf * 6 + k] = PM[sf * 6 + k]
      t2[sf * 2] = PT[sf * 2]
      t2[sf * 2 + 1] = PT[sf * 2 + 1]
      CN[sf * 3] = PN[sf * 3]
      CN[sf * 3 + 1] = PN[sf * 3 + 1]
      CN[sf * 3 + 2] = PN[sf * 3 + 2]
    }
    first = false
    done[sf] = 1
    order.push(f)
    // Nachbarn ueber jede Kante (Dreiecke, die beide Enden teilen).
    for (let k = 0; k < 3; k++) {
      const a = I[f * 3 + k], b = I[f * 3 + ((k + 1) % 3)]
      for (let e = start[a]; e < start[a + 1]; e++) {
        const g = list[e]
        if (g === f || (slot[g] >= 0 && done[slot[g]])) continue
        if (I[g * 3] !== b && I[g * 3 + 1] !== b && I[g * 3 + 2] !== b) continue
        const h = hinge(sf, g, a, b)
        const d = distOf(g, h[0], h[1])
        const sg = slot[g]
        if (!(d < prio[sg])) continue
        prio[sg] = d
        for (let kk = 0; kk < 6; kk++) PM[sg * 6 + kk] = tmp[kk]
        PT[sg * 2] = h[0]
        PT[sg * 2 + 1] = h[1]
        PN[sg * 3] = h[2]
        PN[sg * 3 + 1] = h[3]
        PN[sg * 3 + 2] = h[4]
        push(d, g)
      }
    }
  }
  // Punkte: Karte des naechsten Dreiecks; andere, die bis auf 0,05 mm passen, mitteln. Passt eine Karte gar nicht
  // (mehr als 20 % des Abstands), stossen dort zwei Wege um eine Ecke zusammen: Die Schrift reisst (torn). Auf
  // doppelt gekruemmten Flaechen bleiben die Naehte darunter (Kugel, grosse Schrift: 6 %; Wuerfelecke: 60 %).
  const cnt = new Uint16Array(n)
  const conflict = new Uint8Array(n)
  const touched = []
  for (const f of order) {
    const sf = slot[f]
    for (let k = 0; k < 3; k++) {
      const i = I[f * 3 + k]
      const x = mapX(sf, i), y = mapY(sf, i)
      if (cnt[i] === 0) {
        U[i] = x
        V[i] = y
        cnt[i] = 1
        touched.push(i)
      } else {
        const off = Math.hypot(x - U[i] / cnt[i], y - V[i] / cnt[i])
        if (off <= 0.05 && cnt[i] < 60000) {
          U[i] += x
          V[i] += y
          cnt[i]++
        } else if (off > 0.5 + 0.2 * Math.hypot(U[i] / cnt[i], V[i] / cnt[i])) conflict[i] = 1
      }
    }
  }
  let reached = 0, torn = 0
  for (const i of touched) {
    U[i] /= cnt[i]
    V[i] /= cnt[i]
    // Ueber die Flaeche ist es nie kuerzer als die Luftlinie: naeher am Anker heisst falsch abgerollt.
    const air = Math.hypot(v[i * 3] - q[0], v[i * 3 + 1] - q[1], v[i * 3 + 2] - q[2])
    if (Math.hypot(U[i], V[i]) < 0.98 * air - 0.05) {
      U[i] = NaN
      V[i] = NaN
      continue
    }
    reached++
    if (conflict[i]) {
      // Nur im Fenster zaehlt der Riss (mit Rand liegt er sonst ausserhalb der Schrift).
      const S = U[i] * ca + V[i] * sa, R = -U[i] * sa + V[i] * ca
      if (!window || (Math.abs(S) <= window.halfW - 1 && Math.abs(R) <= window.halfH - 1)) torn++
    }
  }
  return { U, V, reached, torn, face: f0, point: q, normal, up: upT, right }
}
