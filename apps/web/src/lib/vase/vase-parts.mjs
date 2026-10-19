/**
 * Zubehoer zur Vase, jedes Teil ein eigenes, geschlossenes Netz: Beine (zum Einstecken oder
 * angeformt), Staender, Untersetzer (Schale oder versteckt im hohlen Fuss), Einsaetze
 * (Pflanzeinsatz, Selbstbewaesserung, Steckeinsatz fuer Schnittblumen, Wasserroehrchen), Deckel
 * (Stuelp-, Schnapp-, Schraubdeckel).
 *
 * Eigene Entwuerfe mit Blick auf den Alltag: Untersetzer mit Auflagerippen, Zentrierstegen,
 * Ausguss und Griffmulde; Kegelzapfen, die klemmen und sich zentrieren; Staender mit schraeger
 * Auflage (zentriert den Topf, druckt ohne Stuetzen); Einsaetze mit Griffnasen, Gefaelle-freiem
 * Lochboden und Giessschacht. Alle Passungen mit einem Spiel (`fitClearance`).
 *
 *   buildParts(vaseParams, { outward }) -> { parts: [...], lift, notes }
 *
 * Ein Teil: { id, name, mesh: { vertices, indices }, z, merge (gehoert zum Objekt der Vase),
 * flip (zum Drucken umdrehen), info (z. B. Inhalt in ml) }. Die Netze liegen in den Koordinaten
 * der Vase (Mitte auf der Achse); im Zusammenbau wird die Vase um `lift` angehoben, ein Teil um
 * `lift + z` (Untersetzer unten, Beine bzw. Staender darauf, Einsaetze in der Vase: z = 0).
 * `layoutParts` legt alles zum Drucken nebeneinander - Vorschau und Datei nutzen dasselbe.
 */
import { MeshBuilder } from './mesh-tools.mjs'
import { LID_MODES, floorLayout, normalizeParams, threadDepthAt } from './vase-geometry.mjs'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const ml = (mm3) => Math.round(mm3 / 1000)
/** Weiches Fenster um einen Winkel (1 in der Mitte, 0 ab `width`). */
const bump = (a, center, width) => {
  let d = Math.abs(((a - center + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI)
  return d >= width ? 0 : 0.5 * (1 + Math.cos((Math.PI * d) / width))
}

/** Flaeche eines Rings r(theta) (Polygon mit n Punkten). */
function ringArea(r, n = 256) {
  let a = 0
  for (let k = 0; k < n; k++) {
    const t0 = (2 * Math.PI * k) / n, t1 = (2 * Math.PI * (k + 1)) / n
    a += 0.5 * r(t0) * r(t1) * Math.sin(t1 - t0)
  }
  return a
}

export function buildParts(input, { outward = 0 } = {}) {
  const p = normalizeParams(input)
  const layout = floorLayout(p)
  const { shape } = layout
  const H = p.height
  const c = p.fitClearance
  const notes = []
  const parts = []
  // Lampenschirm: kein Untersetzer, kein Einsatz - Wasser und Licht vertragen sich nicht.
  if (p.body === 'hohl' && p.lamp !== 'keine') {
    if (p.saucerMode !== 'keine' || p.insertMode !== 'keine') notes.push('Beim Lampenschirm gibt es keinen Untersetzer und keinen Einsatz.')
    p.saucerMode = 'keine'
    p.insertMode = 'keine'
  }
  // Ringe fein genug fuer den Querschnitt (Lamellen, Wellen, Ecken).
  const N = clamp(Math.max(192, (p.section === 'welle' ? p.sectionWaves : 0) * 8, p.section === 'vieleck' ? p.polySides * 24 : 0,
    (p.section2 === 'welle' ? p.section2Waves : 0) * 8, p.section2 === 'vieleck' ? p.section2Sides * 24 : 0), 192, 720)
  // Rand des Bodens samt nach aussen stehendem Muster.
  const rim = (a) => shape.rimAt(a) + outward
  /**
   * Weitester Umriss des Topfs (samt Muster) zwischen den Hoehen z0 und z1, als Tabelle je
   * Ringwinkel: Ein bauchiger Topf ist ueber dem Boden weiter als unten - Reif, Schale und Stege
   * muessen um diese Stelle herum passen. Zwischen zwei Ringpunkten mit Sicherheit fuer die Sehne.
   */
  const potEnvelope = (z0, z1) => {
    const table = new Float64Array(N)
    const da = (2 * Math.PI) / N
    for (let j = 0; j < N; j++) {
      let m = 0
      const steps = Math.max(8, Math.ceil((z1 - z0) / 0.5))
      for (let s = -2; s <= 2; s++) {
        const a = j * da + (s * da) / 2
        for (let i = 0; i <= steps; i++) m = Math.max(m, shape.outerAt(a, z0 + ((z1 - z0) * i) / steps))
      }
      table[j] = m / Math.cos(da / 2) + outward
    }
    return (a) => table[((Math.round(a / da) % N) + N) % N]
  }
  /** Bauteile einzeln bauen: Geht eines schief, fehlt nur dieses - mit Hinweis statt Abbruch. */
  const safely = (label, fn) => {
    try { fn() } catch (error) { notes.push(`${label} ließ sich nicht bauen: ${error.message}`) }
  }
  // Hoehe, auf der Topf bzw. Beine stehen: im Untersetzer auf dessen Rippen. Mit Beinen keine
  // Rippen - die Beine halten den Topf schon aus dem Wasser, und ein Fuss auf einer Rippe, die
  // anderen daneben, liesse ihn kippeln.
  const saucerFloor = 2, saucerRib = p.saucerRibs === 'ja' && p.legMode === 'keine' ? 2.5 : 0
  const standLevel = p.saucerMode === 'schale' ? saucerFloor + saucerRib : 0
  let lift = standLevel
  // Fuesse der Beine (Mitte und Radius am Boden), fuer die Pruefung im Untersetzer.
  const feet = []
  const splayOut = (h) => h * Math.tan((p.legSplay * Math.PI) / 180)
  const footR = p.legShape === 'zylinder' ? p.legDiameter / 2 : (p.legDiameter / 2) * 0.62

  /* ---------- Beine und Staender ---------- */
  const legShape = (b, x, y, angle, topZ, height, withPeg, splayDeg) => {
    const rT = p.legDiameter / 2
    const rB = p.legShape === 'zylinder' ? rT : rT * 0.62
    const ch = Math.min(1, rB * 0.3)
    const peg = layout.peg
    const socket = peg.r + c
    // Kegelzapfen: an der Schulter so weit wie die Buchse (+0,05 mm, klemmt), zur Spitze schlanker.
    const profile = [[0, topZ - height], [rB - ch, topZ - height], [rB, topZ - height + ch], [rT, topZ]]
    if (withPeg) profile.push([socket + 0.05, topZ], [peg.r - 0.2, topZ + peg.length - 0.8], [peg.r - 1, topZ + peg.length], [0, topZ + peg.length])
    else profile.push([0, topZ])
    const t = Math.tan((splayDeg * Math.PI) / 180)
    const ca = Math.cos(angle), sa = Math.sin(angle)
    b.lathe(profile, p.legShape === 'kantig' ? 4 : 40, {
      phase: p.legShape === 'kantig' ? Math.PI / 4 : 0,
      // Spreizung: unterhalb der Oberkante nach aussen geschert; Ober- und Unterseite bleiben waagerecht.
      transform: (u, v, z) => {
        const out = z < topZ ? (topZ - z) * t : 0
        const lu = u + out
        return [x + lu * ca - v * sa, y + lu * sa + v * ca, z]
      },
    })
  }
  if (p.legMode === 'stecken' || p.legMode === 'angeformt') safely('Die Beine', () => {
    // Steckbeine nur dort, wo eine Buchse in den Boden passt.
    const legs = p.legMode === 'stecken' ? layout.legs.filter((leg) => leg.socket) : layout.legs
    if (p.legMode === 'stecken' && !legs.length) notes.push('Ohne Buchsen im Boden gibt es keine Steckbeine.')
    else {
      const merged = new MeshBuilder()
      legs.forEach((leg, k) => {
        feet.push({ a: leg.angle, r: Math.hypot(leg.x, leg.y) + splayOut(p.legHeight), fr: footR })
        if (p.legMode === 'stecken') {
          const b = new MeshBuilder()
          legShape(b, leg.x, leg.y, leg.angle, 0, p.legHeight, true, p.legSplay)
          parts.push({ id: `bein-${k + 1}`, name: `Bein ${k + 1}`, mesh: b.mesh(), z: 0, merge: false, flip: false })
        } else legShape(merged, leg.x, leg.y, leg.angle, 0.6, p.legHeight + 0.6, false, p.legSplay)
      })
      if (p.legMode === 'angeformt') {
        parts.push({ id: 'beine', name: 'Beine (angeformt)', mesh: merged.mesh(), z: 0, merge: true, flip: false })
        notes.push('Angeformte Beine: Der Boden liegt beim Drucken frei – mit Stützen unter dem Boden drucken, oder Steckbeine wählen (ohne Stützen).')
      }
      lift = standLevel + p.legHeight
    }
  })
  if (p.legMode === 'staender') safely('Der Ständer', () => {
    // Reif nach dem Querschnitt: innen mit Spiel um den Topf, darunter eine schraege Auflage (45 Grad),
    // auf der der Topf mit seiner Kante sitzt und sich dabei selbst zentriert. Mitte offen (Ablauf).
    const b = new MeshBuilder()
    const rIn = (a) => rim(a) + c + 0.5
    const zBot = -12, zTop = 8
    const lipW = (a) => clamp(rim(a) * 0.12, 4, 10)
    const rLip = (a) => rIn(a) - lipW(a)
    // Wo der Topf auf der Schraege (45 Grad, Reif-z = r - rIn) aufsitzt: mit der Kante - oder, wenn
    // er sich unten flacher als 45 Grad weitet, mit der Flanke; dann sitzt er entsprechend hoeher.
    let seat = -Infinity
    for (let k = 0; k < 360; k++) {
      const a = (2 * Math.PI * k) / 360
      for (let h = 0; h <= lipW(a) + 2; h += 0.25) seat = Math.max(seat, shape.outerAt(a, h) + outward - h - rIn(a))
    }
    // Die Wand des Reifs steht um die weiteste Stelle des Topfs in ihrer Hoehe (bauchige Toepfe);
    // eine Stufe fuehrt hinunter zur Schraege.
    const env = potEnvelope(0, zTop - seat + 1)
    const rWall = (a) => Math.max(rIn(a), env(a) + c + 0.5)
    const rOut = (a) => rWall(a) + 3.2
    const rows = [
      b.ring(N, rOut, zBot), b.ring(N, rOut, zTop), b.ring(N, rWall, zTop), b.ring(N, rWall, 0), b.ring(N, rIn, 0),
      b.ring(N, rLip, (a) => -lipW(a)), b.ring(N, rLip, zBot),
    ]
    b.wall([rows[0], rows[1]])
    b.band(rows[1], rows[2], true)
    b.wall([rows[3], rows[2]], true)
    b.band(rows[3], rows[4], true)
    b.wall([rows[5], rows[4]], true)
    b.wall([rows[6], rows[5]], true)
    b.band(rows[0], rows[6], false)
    // Beine unter den Reif, leicht in ihn hinein (ein Objekt).
    for (let k = 0; k < p.legCount; k++) {
      const a = (2 * Math.PI * k) / p.legCount + Math.PI / p.legCount
      const r = (rLip(a) + rOut(a)) / 2
      legShape(b, r * Math.cos(a), r * Math.sin(a), a, zBot + 0.6, p.legHeight + 0.6, false, p.legSplay)
      feet.push({ a, r: r + splayOut(p.legHeight + 0.6), fr: footR })
    }
    lift = standLevel + p.legHeight + (seat - zBot)
    // Zum Drucken umdrehen: Reif liegt mit der Oberkante auf, die Schraege braucht keine Stuetzen.
    const shift = p.legHeight - zBot
    const m = b.mesh()
    for (let i = 2; i < m.vertices.length; i += 3) m.vertices[i] += shift
    parts.push({ id: 'staender', name: 'Ständer', mesh: m, z: standLevel - lift, merge: false, flip: true })
  })

  /* ---------- Untersetzer ---------- */
  if (p.saucerMode === 'schale') safely('Der Untersetzer', () => {
    const b = new MeshBuilder()
    const floor = saucerFloor
    const flare = Math.tan((8 * Math.PI) / 180)
    const top = p.saucerHeight
    // Ausguss vorn (0 Grad) und Griffmulde hinten (180 Grad): Rand dort tiefer und nach aussen gezogen.
    const spout = p.saucerSpout === 'ja'
    const grip = p.saucerGrip === 'ja'
    const dip = (a) => (spout ? 3.5 * bump(a, 0, 0.2) : 0) + (grip ? Math.min(top * 0.35, 5) * bump(a, Math.PI, 0.5) : 0)
    const bulge = (a, t) => ((spout ? 5 * bump(a, 0, 0.17) : 0) + (grip ? 3 * bump(a, Math.PI, 0.5) : 0)) * t * t
    const zTop = (a) => top - dip(a)
    // Der Topf steht `lift` ueber dem Tisch; so weit er in die Schale reicht, ist er hier so weit wie
    // an seiner weitesten Stelle (bauchig) - daran richtet sich die Innenwand.
    const reach = Math.max(0, top - lift + 0.5)
    const env = reach > 0 ? potEnvelope(0, Math.min(H, reach)) : null
    const base = (a) => Math.max(rim(a), env ? env(a) : 0)
    // Mit Beinen bzw. Staender waechst die Schale, bis alle Fuesse mit 1,5 mm Luft darin stehen
    // (jeder Punkt des Fusses, nicht nur seine Mitte).
    // Kerben im Rand (Wellen, Ecken) koennen zwischen zwei Punkten des Fusses liegen: gegen den
    // engsten Rand im ganzen Winkelbereich des Fusses pruefen.
    let gap = p.saucerGap
    for (const f of feet) {
      const span = Math.asin(Math.min(1, f.fr / Math.max(f.r, f.fr))) + 0.01
      let low = Infinity
      for (let k = 0; k <= 64; k++) low = Math.min(low, base(f.a - span + (2 * span * k) / 64))
      gap = Math.max(gap, f.r + f.fr + 1.5 - low)
    }
    const rInner = (a, z) => base(a) + gap + (z - floor) * flare + bulge(a, (z - floor) / (top - floor))
    const rows = 10
    const outer = [], inner = []
    for (let i = 0; i <= rows; i++) {
      const t = i / rows
      outer.push(b.ring(N, (a) => rInner(a, t * zTop(a)) + p.saucerWall, (a) => t * zTop(a)))
    }
    for (let i = 0; i <= rows; i++) {
      const t = i / rows
      inner.push(b.ring(N, (a) => rInner(a, floor + t * (zTop(a) - floor)), (a) => floor + t * (zTop(a) - floor)))
    }
    b.wall(outer)
    b.wall(inner, true)
    b.band(outer[rows], inner[rows], true)
    b.cap(outer[0], 0, [], true)
    b.cap(inner[0], floor, [], false)
    let ribVolume = 0
    const ribH = saucerRib
    const tabEnv = ribH > 0 ? potEnvelope(0, 5.5) : null
    if (ribH > 0) {
      // Auflagerippen: Der Topf steht 2,5 mm ueber dem Boden, also nicht im Wasser.
      // Am Ende jeder Rippe ein Zentriersteg knapp ausserhalb der Topfkante.
      const n = 6
      for (let k = 0; k < n; k++) {
        const a = (2 * Math.PI * k) / n + Math.PI / n
        const r1 = rim(a) * 0.3, r2 = rim(a) - 1
        const L = r2 - r1, mid = (r1 + r2) / 2
        b.box(mid * Math.cos(a), mid * Math.sin(a), floor - 0.4, floor + ribH, L, 2.4, a)
        ribVolume += L * 2.4 * ribH
        // Steg knapp ausserhalb der weitesten Stelle des Topfs in seiner Hoehe (5 mm); nur, wenn er
        // noch vor die Innenwand passt.
        const rt = tabEnv(a) + c + 0.3 + 1
        if (rt + 1.2 < rInner(a, floor)) {
          b.box(rt * Math.cos(a), rt * Math.sin(a), floor - 0.4, floor + ribH + 5, 2, 6, a)
          ribVolume += 2 * 6 * (ribH + 5)
        }
      }
    }
    // Inhalt bis zur tiefsten Stelle des Rands (Ausguss).
    let minTop = Infinity
    for (let k = 0; k < 360; k++) minTop = Math.min(minTop, zTop((2 * Math.PI * k) / 360))
    let vol = 0
    const steps = 20
    for (let i = 0; i < steps; i++) {
      const z = floor + ((i + 0.5) * (minTop - floor)) / steps
      vol += ringArea((a) => rInner(a, z)) * ((minTop - floor) / steps)
    }
    vol -= ribVolume
    parts.push({ id: 'untersetzer', name: 'Untersetzer', mesh: b.mesh(), z: -lift, merge: false, flip: false, info: `fasst etwa ${ml(vol)} ml` })
    if (gap > p.saucerGap + 0.05) notes.push(`Untersetzer auf ${(gap).toFixed(1).replace('.', ',')} mm Abstand zum Topf erweitert, damit alle Füße darin stehen.`)
  })
  if (p.saucerMode === 'versteckt') safely('Die versteckte Schale', () => {
    if (!(p.body === 'hohl' && layout.foot > 0)) notes.push('Die versteckte Schale braucht eine hohle Vase mit hohlem Fuß (Boden-Einstellung „Hohler Fuß“).')
    else {
      // Schale im Hohlraum des Fusses: aussen mit Spiel zur Fusswand, 1,5 mm niedriger als der Fuss.
      const foot = layout.foot
      const rIn0 = (a) => {
        let m = Infinity
        for (let i = 0; i <= 6; i++) m = Math.min(m, shape.innerAt(a, (foot * i) / 6))
        return m - c - 0.4
      }
      const h = foot - 1.5
      const wall = 1.6, floor = 1.6
      let minR = Infinity
      for (let k = 0; k < 72; k++) minR = Math.min(minR, rIn0((2 * Math.PI * k) / 72))
      if (h < 4) notes.push('Für die versteckte Schale ist der hohle Fuß zu niedrig – mindestens 5,5 mm.')
      else if (minR - wall < 5) notes.push('Der hohle Fuß ist zu eng für eine versteckte Schale.')
      else {
        const b = new MeshBuilder()
        const o0 = b.ring(N, rIn0, 0), o1 = b.ring(N, rIn0, h)
        const i1 = b.ring(N, (a) => rIn0(a) - wall, h), i0 = b.ring(N, (a) => rIn0(a) - wall, floor)
        b.wall([o0, o1])
        b.band(o1, i1, true)
        b.wall([i0, i1], true)
        b.cap(o0, 0, [], true)
        b.cap(i0, floor, [], false)
        const vol = ringArea((a) => rIn0(a) - wall) * (h - floor)
        if (lift > 0) notes.push('Auf Beinen oder im Ständer steht die versteckte Schale nicht mehr auf dem Tisch – dann lieber einen Untersetzer wählen.')
        parts.push({ id: 'schale', name: 'Versteckte Schale', mesh: b.mesh(), z: 0, merge: false, flip: false, info: `fasst etwa ${ml(vol)} ml` })
      }
    }
  })

  /* ---------- Einsaetze ---------- */
  const hollow = p.body === 'hohl'
  const floorTop = hollow ? layout.foot + layout.floor : 1.2
  // Innenraum je Winkel und Hoehe; beim vollen Koerper (Slicer-Vasenmodus) etwa eine Linie Wand.
  const cavity = (a, z) => (hollow ? shape.innerAt(a, z) : shape.outerAt(a, z) - 1)
  if (p.insertMode === 'pflanze' || p.insertMode === 'bewaesserung') safely('Der Einsatz', () => {
    const water = p.insertMode === 'bewaesserung'
    const z0 = floorTop + (water ? p.reservoirHeight : p.insertStandoff)
    const z1 = H - 1.5
    if (z1 - z0 < 15) notes.push('Für einen Einsatz ist die Vase zu niedrig.')
    else {
      // Huelle zum Einsetzen von oben: an jeder Hoehe hoechstens so weit wie die engste Stelle darueber.
      const rows = 16
      const zs = Array.from({ length: rows + 1 }, (_, i) => z0 + ((z1 - z0) * i) / rows)
      const env = new Array(rows + 1)
      const AN = N
      for (let i = rows; i >= 0; i--) {
        env[i] = new Float64Array(AN)
        for (let j = 0; j < AN; j++) {
          const a = (2 * Math.PI * j) / AN
          let m = cavity(a, zs[i])
          // Zwischen dieser und der naechsten Hoehe dicht pruefen (Hals, Rippen); oben bis zum Rand,
          // durch den der Einsatz hinein muss.
          if (i < rows) for (let s = 1; s < 4; s++) m = Math.min(m, cavity(a, zs[i] + ((zs[i + 1] - zs[i]) * s) / 4))
          else for (let s = 1; s <= 4; s++) m = Math.min(m, cavity(a, z1 + ((H - z1) * s) / 4))
          env[i][j] = i < rows ? Math.min(m, env[i + 1][j]) : m
        }
      }
      const rAt = (i) => (a) => {
        const x = (((a / (2 * Math.PI)) % 1) + 1) % 1 * AN
        const j = Math.floor(x) % AN, f = x - Math.floor(x)
        return env[i][j] * (1 - f) + env[i][(j + 1) % AN] * f - c - 0.4
      }
      const minR = Math.min(...env[0]) - c - 0.4
      const wall = p.insertWall, floorT = 2
      if (minR < (water ? 18 : 12)) notes.push(water ? 'Die Öffnung ist zu eng für einen Einsatz mit Selbstbewässerung.' : 'Die Öffnung ist zu eng für einen Einsatz.')
      else {
        const b = new MeshBuilder()
        const outer = zs.map((z, i) => b.ring(N, rAt(i), z))
        const inner = zs.map((z, i) => b.ring(N, (a) => rAt(i)(a) - wall, i === 0 ? z + floorT : z))
        b.wall(outer)
        b.wall(inner, true)
        b.band(outer[rows], inner[rows], true)
        // Lochboden: Kreise duerfen sich nicht beruehren und muessen innen auf der Bodenplatte liegen
        // (bei schmalen Einsaetzen fallen aeussere Loecher bzw. der Giessschacht weg).
        const plate = (a) => rAt(0)(a) - wall
        const onPlate = (h, margin) => {
          for (let k = 0; k < 24; k++) {
            const a = (2 * Math.PI * k) / 24
            const x = h.cx + (h.r + margin) * Math.cos(a), y = h.cy + (h.r + margin) * Math.sin(a)
            if (Math.hypot(x, y) + 0.6 > 0.98 * plate(Math.atan2(y, x))) return false
          }
          return true
        }
        const apart = (h, list, gap) => list.every((o) => Math.hypot(h.cx - o.cx, h.cy - o.cy) >= h.r + o.r + gap)
        const center = { cx: 0, cy: 0, r: water ? 5 : 3 }
        const holes = [center]
        // Fuesse als Abstand zum Vasenboden (bei Selbstbewaesserung hohe Saeulen im Wasser).
        const fr = clamp(minR * 0.13, 2, water ? 5 : 3.5)
        const rFoot = clamp(minR * 0.62, center.r + fr + 1.5, minR - wall - fr - 1)
        const feet = [0, 1, 2].map((k) => {
          const a = (2 * Math.PI * k) / 3 + Math.PI / 6
          return { cx: rFoot * Math.cos(a), cy: rFoot * Math.sin(a), r: fr }
        })
        if (!water) {
          const rr = clamp(minR * 0.45, center.r + 4, minR)
          for (let k = 0; k < 5; k++) {
            const a = (2 * Math.PI * k) / 5 + 0.3
            const h = { cx: rr * Math.cos(a), cy: rr * Math.sin(a), r: 2.5 }
            if (onPlate(h, 1.2) && apart(h, [...holes, ...feet], 1.5)) holes.push(h)
          }
        }
        let shaft = null
        if (water) {
          // Giessschacht an der Wand (90 Grad): Rohr bis unter den Boden ins Wasser.
          // Das Rohr reicht bis knapp ueber den Vasenboden: Es muss auch dort frei in der Vase stehen.
          const a = Math.PI / 2
          const ro = 7, ri = 5
          const tubeFits = (s) => {
            for (let k = 0; k < 24; k++) {
              const x = s.cx + ro * Math.cos((2 * Math.PI * k) / 24), y = s.cy + ro * Math.sin((2 * Math.PI * k) / 24)
              const ang = Math.atan2(y, x), r = Math.hypot(x, y)
              if (r > plate(ang) - 0.8) return false
              for (let i = 0; i <= 6; i++) if (r > cavity(ang, floorTop + 0.5 + ((z0 - floorTop - 0.5) * i) / 6) - c - 0.5) return false
            }
            return true
          }
          for (let rr = Math.min(plate(a) - ro - 1, 0.97 * plate(a) - ri - 1.5); rr >= center.r + ro + 1.5 && !shaft; rr -= 1) {
            const s = { cx: rr * Math.cos(a), cy: rr * Math.sin(a), r: ro }
            if (tubeFits(s) && onPlate({ ...s, r: ri + 0.3 }, 0.5) && apart(s, [center, ...feet], 1.5)) {
              shaft = { cx: s.cx, cy: s.cy, ro, ri }
              holes.push({ cx: s.cx, cy: s.cy, r: ri + 0.3 })
            }
          }
          if (!shaft) notes.push('Für einen Gießschacht ist der Einsatz zu schmal – zum Nachfüllen den Einsatz kurz herausheben.')
        }
        const under = b.cap(outer[0], z0, holes, true)
        const above = b.cap(inner[0], z0 + floorT, holes, false)
        b.holeWalls(under, above)
        for (const f of feet) {
          b.lathe([[0, floorTop], [f.r, floorTop], [f.r, z0 + 0.6], [0, z0 + 0.6]], 24, {
            transform: (x, y, z) => [x + f.cx, y + f.cy, z],
          })
        }
        // Zwei Griffnasen innen am Rand zum Herausheben. Die ebene Aussenseite der Nase bleibt an
        // jeder Stelle innerhalb der Huelle (Rippen, Ecken), greift aber in die Wand.
        for (const a of [0, Math.PI]) {
          let rOut = rAt(rows)(a) - wall + 0.5
          const fits = (ro) => {
            for (let s = -5; s <= 5; s += 0.5) {
              const x = ro * Math.cos(a) - s * Math.sin(a), y = ro * Math.sin(a) + s * Math.cos(a)
              const ang = Math.atan2(y, x)
              for (let i = rows - 3; i <= rows; i++) if (Math.hypot(x, y) > rAt(i)(ang) - 0.25) return false
            }
            return true
          }
          while (!fits(rOut) && rOut > 8) rOut -= 0.25
          const r = rOut - 2.5
          b.box(r * Math.cos(a), r * Math.sin(a), z1 - 6, z1, 5, 10, a)
        }
        if (shaft) {
          b.lathe([[shaft.ri, floorTop + 0.5], [shaft.ro, floorTop + 0.5], [shaft.ro, z1], [shaft.ri, z1]], 32, {
            transform: (x, y, z) => [x + shaft.cx, y + shaft.cy, z],
          })
        }
        const info = water
          ? `Wasservorrat etwa ${ml(ringArea((a) => cavity(a, floorTop + 1)) * p.reservoirHeight * 0.9)} ml${shaft ? ' – nachfüllen über den Schacht' : ''}`
          : `Erde etwa ${ml(ringArea(rAt(0)) * (z1 - z0) * 0.85)} ml`
        parts.push({ id: 'einsatz', name: water ? 'Einsatz Selbstbewässerung' : 'Pflanzeinsatz', mesh: b.mesh(), z: 0, merge: false, flip: false, info, floor: { holes, feet, shaft } })
        if (water && !hollow) notes.push('Selbstbewässerung braucht eine dichte, hohle Vase als Wasserbehälter.')
      }
    }
  })
  if (p.insertMode === 'stecker') safely('Der Steckeinsatz', () => {
    // Platte auf dem Rand mit Loechern fuer Stiele (innen groesser, aussen kleiner), darunter ein
    // Kragen, der in der Oeffnung sitzt. Gedruckt mit der Platte nach unten.
    const b = new MeshBuilder()
    const plateR = (a) => shape.outerAt(a, H) + 1
    // Der Kragen steckt von H - 8 bis H in der Oeffnung: so weit wie ihre engste Stelle dort.
    const collarO = (a) => {
      let m = Infinity
      for (let i = 0; i <= 8; i++) m = Math.min(m, cavity(a, H - 8 + i))
      return m - c
    }
    const collarI = (a) => collarO(a) - 1.6
    let minCollar = Infinity
    for (let k = 0; k < 360; k++) minCollar = Math.min(minCollar, collarI((2 * Math.PI * k) / 360))
    if (minCollar < 8) notes.push('Die Öffnung ist zu eng für einen Steckeinsatz.')
    else {
      const t = 2.4
      const big = p.frogHole / 2, small = big * 0.65
      const holes = []
      const step = p.frogHole * 1.9
      for (let iy = -20; iy <= 20; iy++) {
        for (let ix = -20; ix <= 20; ix++) {
          const x = (ix + (iy % 2 ? 0.5 : 0)) * step, y = iy * step * 0.866
          const d = Math.hypot(x, y)
          const r = d < minCollar * 0.45 ? big : small
          if (d + r + 1.4 < minCollar && holes.length < 60) holes.push({ cx: x, cy: y, r })
        }
      }
      if (!holes.length) throw new Error('kein Loch dieser Größe passt in die Öffnung – kleinere Löcher wählen')
      const lo = b.ring(N, plateR, H), hi = b.ring(N, plateR, H + t)
      b.wall([lo, hi])
      const under = b.cap(lo, H, holes, true)
      const above = b.cap(hi, H + t, holes, false)
      b.holeWalls(under, above)
      const k0 = b.ring(N, collarO, H - 8), k1 = b.ring(N, collarO, H + 0.4)
      const j1 = b.ring(N, collarI, H + 0.4), j0 = b.ring(N, collarI, H - 8)
      b.wall([k0, k1])
      b.band(k1, j1, true)
      b.wall([j0, j1], true)
      b.band(k0, j0, false)
      parts.push({ id: 'stecker', name: 'Steckeinsatz', mesh: b.mesh(), z: 0, merge: false, flip: true, info: `${holes.length} ${holes.length === 1 ? 'Loch' : 'Löcher'} für Stiele` })
    }
  })
  if (p.insertMode === 'roehrchen') safely('Das Wasserröhrchen', () => {
    // Dichtes Roehrchen: passt durch die engste Stelle, haengt mit einem Kragen auf dem Rand.
    // Engste Stelle dicht abgetastet: Lamellen und Ecken liegen sonst zwischen den Messstellen.
    let narrow = Infinity
    for (let i = 0; i <= 48; i++) {
      const z = floorTop + 2 + ((H - floorTop - 2) * i) / 48
      for (let k = 0; k < 2880; k++) narrow = Math.min(narrow, cavity((2 * Math.PI * k) / 2880, z))
    }
    const rt = Math.min(p.tubeDiameter / 2, narrow - c - 0.5)
    let rimMin = Infinity
    for (let k = 0; k < 72; k++) rimMin = Math.min(rimMin, shape.outerAt((2 * Math.PI * k) / 72, H))
    // Kragen fast bis an den Aussenrand der Oeffnung: liegt sicher auf, ragt nicht ueber.
    const rf = Math.max(rt + 3, rimMin - 0.3)
    let openMin = Infinity
    for (let k = 0; k < 720; k++) openMin = Math.min(openMin, cavity((2 * Math.PI * k) / 720, H))
    if (rt < 4) notes.push('Die Vase ist zu eng für ein Wasserröhrchen.')
    else {
      const b = new MeshBuilder()
      const w = 1.6, zb = floorTop + 3
      b.lathe([[0, zb], [rt - 1, zb], [rt, zb + 1], [rt, H], [rf, H], [rf, H + 2], [rt - w, H + 2], [rt - w, zb + 2], [0, zb + 2]], 64)
      const vol = Math.PI * (rt - w) ** 2 * (H - zb - 2)
      parts.push({ id: 'roehrchen', name: 'Wasserröhrchen', mesh: b.mesh(), z: 0, merge: false, flip: true, info: `fasst etwa ${ml(vol)} ml – dicht drucken (3 Wände, keine Lücken)` })
      if (rf < openMin + 1) notes.push('Der Kragen des Röhrchens liegt kaum auf dem Rand – die Öffnung ist fast so weit wie die Vase.')
    }
  })
  /* ---------- Deckel ---------- */
  // Platte auf dem Rand (so weit wie die Vase aussen, beim Schraubdeckel mit Griffrand), darunter eine
  // Lippe bzw. ein Gewindezapfen, der in der Oeffnung sitzt. Gedruckt mit der Platte nach unten: Lippe,
  // Wulst und Gewinde stehen nach oben, ihre Flanken unter 45 Grad - ohne Stuetzen.
  if (p.lidMode !== 'keiner') safely('Der Deckel', () => {
    if (p.lamp !== 'keine') return
    if (p.insertMode === 'stecker' || p.insertMode === 'roehrchen') return
    const lid = shape.lid
    if (p.lidMode !== 'stuelp' && !lid) {
      notes.push(`Ein ${LID_MODES[p.lidMode]} braucht eine hohle Vase – Bauart „Hohl mit Wand“ wählen.`)
      return
    }
    const t = p.lidThickness
    const L = p.lidDepth
    const grip = p.lidGrip === 'ja' && p.lidMode === 'schraube'
    // Griffrand: 36 flache Riffeln (0,8 mm), so greift die Hand beim Schrauben.
    const plateR = (a) => shape.outerAt(a, H) + outward + (grip ? 0.8 * (0.5 + 0.5 * Math.cos(36 * a)) : 0)
    // Lippe bzw. Zapfen: aussen mit Spiel zur Oeffnung, innen 2 mm Wand (beim Gewinde 2,4 mm unter dem Kern).
    let plugO, plugI, zs, info
    if (p.lidMode === 'schraube') {
      const zb = lid.z0 + 0.5
      plugO = (a, z) => shape.neck - p.lidClearance + lid.depth * threadDepthAt(a, z, lid, p)
      const core = shape.neck - p.lidClearance - 2.4
      if (core < 4) throw new Error('die Öffnung ist zu eng für ein Gewinde')
      plugI = () => core
      const n = Math.ceil((H - zb) / (lid.pitch / 16))
      zs = Array.from({ length: n + 1 }, (_, i) => zb + ((H - zb) * i) / n)
      info = `Gewinde ${fmt(lid.pitch)} mm Steigung, ${fmt((H - lid.z0) / lid.pitch)} Gänge, Rechtsgewinde`
    } else {
      // Die Lippe folgt der Oeffnung: je Winkel die engste Stelle im Bereich der Lippe.
      const openAt = (a) => {
        let m = Infinity
        for (let i = 0; i <= 8; i++) m = Math.min(m, cavity(a, H - L + (L * i) / 8))
        return m
      }
      const table = new Float64Array(N)
      for (let j = 0; j < N; j++) table[j] = openAt((2 * Math.PI * j) / N)
      const at = (a) => table[((Math.round((a / (2 * Math.PI)) * N) % N) + N) % N]
      const wall = p.lidMode === 'schnapp' ? 1.2 : 1.6
      // Schnapp: Wulst auf der Lippe, wo die Nut sitzt; 0,3 mm groesser als die Oeffnung, in der Nut mit Spiel.
      const bead = (z) => {
        if (!lid || lid.kind !== 'schnapp') return 0
        const d = Math.abs(z - lid.zc) / (lid.half - 0.4)
        return d >= 1 ? 0 : (p.lidClearance + lid.snap) * (1 - d)
      }
      plugO = (a, z) => at(a) - p.lidClearance + bead(z)
      plugI = (a) => at(a) - p.lidClearance - wall
      let minI = Infinity
      for (let j = 0; j < N; j++) minI = Math.min(minI, table[j] - p.lidClearance - wall)
      if (minI < 3) throw new Error('die Öffnung ist zu eng für eine Lippe')
      const zb = H - L
      const n = Math.max(2, Math.ceil(L / (lid?.kind === 'schnapp' ? 0.2 : 2)))
      zs = Array.from({ length: n + 1 }, (_, i) => zb + (L * i) / n)
      info = p.lidMode === 'schnapp' ? `Lippe ${fmt(L)} mm mit Wulst, rastet ${fmt(lid.snap, 2)} mm ein` : `Lippe ${fmt(L)} mm, ${fmt(p.lidClearance, 2)} mm Spiel`
    }
    const b = new MeshBuilder()
    const lo = b.ring(N, plateR, H), hi = b.ring(N, plateR, H + t)
    b.wall([lo, hi])
    b.cap(hi, H + t, [], false)
    const outerRows = zs.map((z) => b.ring(N, (a) => plugO(a, z), z))
    b.band(lo, outerRows[outerRows.length - 1], false)
    b.wall(outerRows)
    const innerRows = [b.ring(N, (a) => plugI(a), zs[0]), b.ring(N, (a) => plugI(a), H)]
    b.band(outerRows[0], innerRows[0], false)
    b.wall(innerRows, true)
    b.cap(innerRows[1], H, [], true)
    parts.push({ id: 'deckel', name: LID_MODES[p.lidMode], mesh: b.mesh(), z: 0, merge: false, flip: true, info })
  })
  return { parts, lift, notes }
}

const fmt = (v, digits = 1) => v.toLocaleString('de-DE', { maximumFractionDigits: digits })

/** Umgebender Quader eines Netzes: { min: [x, y, z], max: [x, y, z] }. */
export function meshBox(vertices) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < vertices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], vertices[i + k])
      max[k] = Math.max(max[k], vertices[i + k])
    }
  }
  return { min, max }
}

/** Ein Punkt in seiner Lage: (x, y, z) -> umgedreht (180 Grad um x) und verschoben. */
export function placePoint(pose, x, y, z) {
  return pose.flip ? [x + pose.dx, -y + pose.dy, -z + pose.dz] : [x + pose.dx, y + pose.dy, z + pose.dz]
}

/**
 * Lage der Vase und jedes Teils, fuer Vorschau und Datei gleich. `mode`:
 * - 'zusammen': wie aufgebaut (Vase um `lift` angehoben, Teile um `lift + z`);
 * - 'druck': jedes Teil druckfertig (umgedreht, wenn `flip`), auf z = 0, in Reihen rechts neben
 *   der Vase. Teile mit `merge` gehoeren zur Vase und liegen wie sie.
 * `vaseBox` ist der Quader der Vase samt Muster. Liefert { vase, parts } mit je { flip, dx, dy, dz }.
 */
export function layoutParts(vaseBox, parts, lift, mode, { gap = 10, rowWidth = 220 } = {}) {
  if (mode === 'zusammen') {
    return {
      vase: { flip: false, dx: 0, dy: 0, dz: lift },
      parts: parts.map((part) => ({ flip: false, dx: 0, dy: 0, dz: lift + (part.merge ? 0 : part.z ?? 0) })),
    }
  }
  // Vase samt angeformten Teilen: zusammen auf das Bett.
  const obj = { min: [...vaseBox.min], max: [...vaseBox.max] }
  const boxes = parts.map((part) => part.box ?? meshBox(part.mesh.vertices))
  parts.forEach((part, k) => {
    if (!part.merge) return
    for (let i = 0; i < 3; i++) {
      obj.min[i] = Math.min(obj.min[i], boxes[k].min[i])
      obj.max[i] = Math.max(obj.max[i], boxes[k].max[i])
    }
  })
  const vase = { flip: false, dx: 0, dy: 0, dz: -obj.min[2] }
  const x0 = obj.max[0] + gap
  const width = Math.max(rowWidth, obj.max[0] - obj.min[0])
  let cx = x0, cy = obj.min[1], rowH = 0
  const poses = parts.map((part, k) => {
    if (part.merge) return { ...vase }
    const b = boxes[k]
    const flip = Boolean(part.flip)
    const yMin = flip ? -b.max[1] : b.min[1], yMax = flip ? -b.min[1] : b.max[1]
    const zMin = flip ? -b.max[2] : b.min[2]
    const sx = b.max[0] - b.min[0], sy = yMax - yMin
    if (cx > x0 && cx + sx > x0 + width) { cx = x0; cy += rowH + gap; rowH = 0 }
    const pose = { flip, dx: cx - b.min[0], dy: cy - yMin, dz: -zMin }
    cx += sx + gap
    rowH = Math.max(rowH, sy)
    return pose
  })
  return { vase, parts: poses }
}
