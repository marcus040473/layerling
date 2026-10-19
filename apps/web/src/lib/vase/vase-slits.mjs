/**
 * Vasenmodus stabiler: ein voller Koerper mit feinen Schlitzen. Der Slicer druckt im
 * Spiral-Vasenmodus nur den Umriss jeder Schicht als eine einzige Linie - laeuft der Umriss durch
 * einen Schlitz hinein und wieder heraus, liegen dort zwei Linien dicht nebeneinander und
 * verschmelzen zu einer Rippe.
 *
 * - Rippen innen: Schlitze von aussen nach innen; die Rippen stehen innen an der Wand.
 * - Doppelwand: zweite Wand innen. Ein Schlitz geht ganz durch (so gehoert die Innenwand zum selben
 *   Umriss), dazu abwechselnd Schlitze von aussen und von innen: Stege, die bis kurz vor die andere
 *   Wand reichen - dort liegen die Linien nebeneinander und verbinden beide Waende.
 *
 * Unter `floor` (mm) ist der Koerper voll: Dort druckt der Slicer den Boden.
 */
import { triangulate } from './mesh-tools.mjs'

export const REINFORCE = { keine: 'Keine', rippen: 'Rippen innen', doppelwand: 'Doppelwand' }

/**
 * Den vollen Koerper mit Schlitzen bauen (statt Aussenwand + Deckel). `rows`: Zeilenhoehen mit
 * Schlitzen (`rows[0]` = Oberkante des vollen Bodens) bis oben, `bottom`: Zeilen darunter (ab 0);
 * `outer(theta, z)` / `inner(theta, z)`: Radius der Aussenwand bzw. der zweiten Wand (Doppelwand);
 * `coords(v)`: [x, y, z] eines Punkts. Gesperrt (kein Muster) werden Schlitzwaende, Stege, Boden der
 * Schlitze und die Innenwand. Liefert die Punkte des untersten Rings (fuer den Boden).
 */
export function slitBody({ p, segments, rows, bottom, outer, inner, tris, addVertex, coords, locked }) {
  const J = segments
  const mode = p.reinforce
  const w = p.slitWidth
  const bond = 2 * p.lineWidth
  // Schlitze mittig zwischen zwei Spalten; bei der Doppelwand abwechselnd aussen/innen, der erste ganz durch.
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
  // Punkt auf der Linie im Abstand `side` (mm, quer) neben dem Strahl phi, im Abstand rho von der Achse.
  const onLine = (rho, phi, side, z) => addVertex(rho * Math.cos(phi) - side * Math.sin(phi), rho * Math.sin(phi) + side * Math.cos(phi), z)
  // Punkt einer Kontur dort, wo sie die Linie im Abstand `side` neben dem Strahl phi schneidet.
  const onContour = (radius, phi, side, z) => {
    const r0 = radius(phi, z)
    const th = phi + Math.asin(Math.max(-0.9, Math.min(0.9, side / r0)))
    return at(radius(th, z), th, z)
  }
  /** Ein Ring in Hoehe z: Punkte gegen den Uhrzeigersinn (Material links) und ihre Art. */
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
    // Aussen, rundum ab dem durchgehenden Schlitz.
    if (through) push(onContour(outer, through.phi, w / 2, z), 'M')
    for (let n = 0; n < J; n++) {
      const j = (start + n) % J
      push(at(outer((2 * Math.PI * j) / J, z), (2 * Math.PI * j) / J, z), 'O')
      const s = byCol.get(j)
      if (!s || s.kind === 'innen') continue
      if (s.kind === 'durch') {
        push(onContour(outer, s.phi, -w / 2, z), 'M')
        if (!full) break
        // Durch den Schlitz nach innen, Innenwand im Uhrzeigersinn, zurueck.
        push(onContour(inner, s.phi, -w / 2, z), 'W')
        for (let m = 0; m < J; m++) {
          const jj = (s.col - m + J) % J
          push(at(inner((2 * Math.PI * jj) / J, z), (2 * Math.PI * jj) / J, z), 'I')
          const t = byCol.get((jj - 1 + J) % J)
          if (t && t.kind === 'innen') {
            // Schlitz von innen: Rand innen, nach aussen bis kurz vor die Aussenwand, zurueck.
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
  // Boden (voll) bis rows[0]: Ringe nur mit Aussenpunkten und Schlitzmuendungen.
  const zS = rows[0]
  const lowRings = bottom.map((z) => ring(z, false))
  const upper = rows.map((z) => ring(z, true))
  // Die Ringe in Hoehe zS teilen ihre Aussenpunkte: unten genau die Punkte von oben (O und M).
  const keep = upper[0].kinds.map((k) => k === 'O' || k === 'M')
  const lowTop = { pts: upper[0].pts.filter((_, k) => keep[k]), kinds: upper[0].kinds.filter((_, k) => keep[k]) }
  const lows = [...lowRings, lowTop]
  for (let i = 0; i < lows.length - 1; i++) wall(lows[i], lows[i + 1], () => false)
  const isOuter = (kinds, k) => {
    const a = kinds[k], b = kinds[(k + 1) % kinds.length]
    return (a === 'O' || a === 'M') && (b === 'O' || b === 'M')
  }
  for (let i = 0; i < upper.length - 1; i++) wall(upper[i], upper[i + 1], (k) => !isOuter(upper[i].kinds, k))
  // Hoehe zS, nach oben: Boden der Schlitze und (Doppelwand) des Raums innen.
  const xy = (v) => coords(v).slice(0, 2)
  const ringTop = upper[0]
  const n = ringTop.pts.length
  for (let k = 0; k < n; k++) {
    // Aussenschlitz: M T T M -> Viereck nach oben (gegen den Uhrzeigersinn von oben).
    if (ringTop.kinds[k] === 'M' && ringTop.kinds[(k + 1) % n] === 'T') {
      const [a, b, c, d] = [0, 1, 2, 3].map((o) => ringTop.pts[(k + o) % n])
      locked.push(tris.length / 3, tris.length / 3 + 1)
      tris.push(d, c, b)
      tris.push(d, b, a)
    }
  }
  if (mode === 'doppelwand') {
    // Raum innen samt durchgehendem und inneren Schlitzen: Faecher um die Mitte (sternfoermig).
    const first = ringTop.kinds.indexOf('W'), last = ringTop.kinds.lastIndexOf('W')
    const poly = [ringTop.pts[first - 1], ringTop.pts[0], ...ringTop.pts.slice(first, last + 1).reverse()]
    const c = addVertex(0, 0, zS)
    for (let k = 0; k < poly.length; k++) {
      locked.push(tris.length / 3)
      tris.push(c, poly[k], poly[(k + 1) % poly.length])
    }
  }
  // Deckel oben: der Umriss mit allen Schlitzen, per Ohrenschnitt.
  const topRing = upper[upper.length - 1]
  const t = triangulate(topRing.pts.map(xy))
  if (!t.complete) throw new Error('Der Deckel mit den Schlitzen ließ sich nicht schließen – weniger oder flachere Rippen wählen.')
  for (const [a, b, c] of t.triangles) tris.push(topRing.pts[a], topRing.pts[b], topRing.pts[c])
  return lows[0].pts
}
