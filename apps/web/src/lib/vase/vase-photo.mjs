/**
 * Foto als Vorlage: den Gegenstand (eine Vase, ein Topf) im Foto finden und seinen Umriss als Koerperform
 * nehmen - in echten Massen, die man vorher eingibt. Ohne Browser nutzbar (Tests): `img` ist
 * { width, height, data } mit RGBA-Bytes wie ImageData.
 *
 * Gefunden wird so: Hintergrund = Farbe am Bildrand (Median); was deutlich davon abweicht, gehoert zum
 * Gegenstand (Schwelle nach Otsu, mindestens ein fester Abstand gegen Rauschen); es zaehlt der groesste
 * zusammenhaengende Bereich - Kruemel, Staub und Flecken am Rand nicht. Ist der Rand selbst unruhig
 * (Zimmer, Regal), gibt es keinen klaren Hintergrund: dann `ok: false` mit Grund. Rand und Boden, schraeg
 * von oben als Ellipse gesehen, zaehlen nicht zur Hoehe.
 */
import { profileFromSamples } from './svg-import.mjs'

/** Groesste Seite des Rasters, auf dem gesucht wird (schneller, Rauschen mittelt sich). */
const GRID = 360

/** Bild auf hoechstens GRID Bildpunkte je Seite mitteln: { w, h, rgb (Float32, 3 je Punkt), f (Faktor) }. */
function downsample(img) {
  const f = Math.max(1, Math.max(img.width, img.height) / GRID)
  const w = Math.max(1, Math.round(img.width / f)), h = Math.max(1, Math.round(img.height / f))
  const rgb = new Float32Array(w * h * 3)
  const cnt = new Float32Array(w * h)
  for (let y = 0; y < img.height; y++) {
    const gy = Math.min(h - 1, Math.floor(y / f))
    for (let x = 0; x < img.width; x++) {
      const gx = Math.min(w - 1, Math.floor(x / f))
      const k = (y * img.width + x) * 4, g = gy * w + gx
      // Durchsichtige Bildpunkte (PNG) gelten als weiss.
      const a = img.data[k + 3] / 255
      rgb[g * 3] += img.data[k] * a + 255 * (1 - a)
      rgb[g * 3 + 1] += img.data[k + 1] * a + 255 * (1 - a)
      rgb[g * 3 + 2] += img.data[k + 2] * a + 255 * (1 - a)
      cnt[g]++
    }
  }
  for (let g = 0; g < w * h; g++) for (let c = 0; c < 3; c++) rgb[g * 3 + c] /= cnt[g] || 1
  return { w, h, rgb, f: img.width / w, fy: img.height / h }
}

const median = (list) => {
  const s = Float32Array.from(list).sort()
  return s.length ? s[s.length >> 1] : 0
}

/** Schwelle nach Otsu ueber Werte 0..max (256 Stufen). */
function otsu(values, max) {
  const hist = new Float64Array(256)
  for (const v of values) hist[Math.min(255, Math.floor((v / max) * 255))]++
  const total = values.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0, wB = 0, best = 0, at = 0
  for (let i = 0; i < 256; i++) {
    wB += hist[i]
    if (!wB || wB === total) continue
    sumB += i * hist[i]
    const mB = sumB / wB, mF = (sum - sumB) / (total - wB)
    const between = wB * (total - wB) * (mB - mF) ** 2
    if (between > best) { best = between; at = i }
  }
  return ((at + 0.5) / 255) * max
}

/**
 * Gegenstand im Foto finden. Liefert { ok, box: { x0, y0, x1, y1 } in Bildpunkten des Fotos (y nach unten;
 * oben und unten die Mitten von Rand- und Bodenellipse), rows: je Zeile des Rasters von oben [links, rechts]
 * oder null, top/bottom: erste und letzte Zeile des Koerpers, grid: { w, h, f, fy }, notes }.
 */
export function findObject(img) {
  if (!img || !(img.width > 2) || !(img.height > 2) || !img.data) return { ok: false, notes: ['Kein Bild.'] }
  const g = downsample(img)
  const { w, h, rgb } = g
  // Hintergrund: Median der Randpunkte, je Farbkanal.
  const border = []
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x)
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1)
  const bg = [0, 1, 2].map((c) => median(border.map((p) => rgb[p * 3 + c])))
  const dist = new Float32Array(w * h)
  for (let p = 0; p < w * h; p++) dist[p] = Math.hypot(rgb[p * 3] - bg[0], rgb[p * 3 + 1] - bg[1], rgb[p * 3 + 2] - bg[2])
  const MIN = 28
  // Unruhiger Rand: viele Randpunkte weichen deutlich vom Median ab - dann gibt es keinen klaren Hintergrund.
  const busy = border.filter((p) => dist[p] > 2 * MIN).length / border.length
  if (busy > 0.35) return { ok: false, notes: ['Der Hintergrund ist unruhig (am Bildrand keine einheitliche Farbe) – der Gegenstand lässt sich nicht sicher finden. Am besten vor einer hellen, einfarbigen Wand fotografieren; sonst „Kalibrieren“.'] }
  const T = Math.max(MIN, otsu(dist, 442))
  const fg = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) fg[p] = dist[p] > T ? 1 : 0
  // Groesster zusammenhaengender Bereich (4er-Nachbarschaft).
  const label = new Int32Array(w * h).fill(-1)
  let bestLabel = -1, bestSize = 0
  const stack = []
  for (let p = 0, n = 0; p < w * h; p++) {
    if (!fg[p] || label[p] >= 0) continue
    let size = 0
    label[p] = n
    stack.push(p)
    while (stack.length) {
      const q = stack.pop()
      size++
      const x = q % w, y = (q - x) / w
      for (const r of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, y > 0 ? q - w : -1, y < h - 1 ? q + w : -1]) {
        if (r >= 0 && fg[r] && label[r] < 0) { label[r] = n; stack.push(r) }
      }
    }
    if (size > bestSize) { bestSize = size; bestLabel = n }
    n++
  }
  if (bestLabel < 0 || bestSize < 0.01 * w * h) return { ok: false, notes: ['Im Foto hebt sich nichts deutlich vom Hintergrund ab.'] }
  // Je Zeile linker und rechter Rand des Bereichs.
  const rows = []
  let y0 = h, y1 = -1, x0 = w, x1 = -1
  for (let y = 0; y < h; y++) {
    let lo = -1, hi = -1
    for (let x = 0; x < w; x++) if (label[y * w + x] === bestLabel) { if (lo < 0) lo = x; hi = x }
    rows.push(lo < 0 ? null : [lo, hi])
    if (lo >= 0) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, lo); x1 = Math.max(x1, hi) }
  }
  const notes = []
  if (x1 - x0 >= w - 2 && y1 - y0 >= h - 2) return { ok: false, notes: ['Der gefundene Bereich füllt das ganze Foto – der Gegenstand hebt sich nicht vom Hintergrund ab.'] }
  if (x0 === 0 || x1 === w - 1 || y0 === 0) notes.push('Der Gegenstand reicht bis an den Bildrand – vielleicht ist er angeschnitten.')
  // Perspektive: Leicht von oben fotografiert, erscheinen Rand und Boden als Ellipsen - die aeussersten Zeilen
  // werden schlagartig schmaler (mehr als 8 % je Zeile; ein echter Fuss laeuft flacher aus). Sie zaehlen nicht
  // zur Hoehe: Rand und Boden liegen in der Mitte ihrer Ellipse, dort, wo die volle Breite erreicht ist.
  const width = (y) => (rows[y] ? rows[y][1] - rows[y][0] + 1 : 0)
  const capMax = Math.max(1, Math.round(0.05 * (y1 - y0 + 1)))
  let top = y0, bottom = y1
  while (top < y0 + capMax && width(top) < 0.92 * width(top + 1)) top++
  while (bottom > y1 - capMax && width(bottom) < 0.92 * width(bottom - 1)) bottom--
  // Zur Mitte hin flacht die Ellipse ab: nach dem steilen Stueck weiter, solange es noch merklich breiter wird.
  if (top > y0) while (top < y0 + capMax && width(top) < 0.98 * width(top + 1)) top++
  if (bottom < y1) while (bottom > y1 - capMax && width(bottom) < 0.98 * width(bottom - 1)) bottom--
  if (top > y0 + 1 || bottom < y1 - 1) notes.push('Rand und Boden erscheinen als Ellipse (leicht von oben fotografiert) – gemessen wird zwischen ihren Mitten.')
  const box = { x0: x0 * g.f, y0: top * g.fy, x1: (x1 + 1) * g.f, y1: (bottom + 1) * g.fy }
  return { ok: true, box, rows, top, bottom, grid: { w, h, f: g.f, fy: g.fy }, notes }
}

/**
 * Umriss eines gefundenen Gegenstands als Koerperform: je Zeile die halbe Breite (Mitte je Zeile - falls er
 * schief steht), geglaettet und auf wenige Punkte vereinfacht. `height`, `diameter`: echte Masse in mm
 * (Durchmesser = breiteste Stelle); ohne Durchmesser gilt der Massstab der Hoehe auch quer.
 * Liefert { ok, profilePoints, height, diameter, notes } wie der SVG-Import.
 */
export function photoProfile(found, { height, diameter = null, tolerance = null } = {}) {
  if (!found?.ok) return { ok: false, notes: found?.notes ?? ['Kein Gegenstand gefunden.'] }
  if (!(height > 0)) return { ok: false, notes: ['Bitte die Höhe des Gegenstands in mm angeben.'] }
  const { rows, grid, top, bottom } = found
  const n = bottom - top + 1
  if (n < 8) return { ok: false, notes: ['Der Gegenstand ist im Foto zu klein für einen Umriss.'] }
  // Halbe Breite je Zeile in Bildpunkten des Fotos; Luecken (eine Zeile ohne Treffer) ueberbrueckt.
  const half = []
  for (let y = top; y <= bottom; y++) half.push(rows[y] ? ((rows[y][1] - rows[y][0] + 1) * grid.f) / 2 : null)
  for (let k = 0; k < n; k++) {
    if (half[k] !== null) continue
    let a = k - 1, b = k + 1
    while (b < n && half[b] === null) b++
    half[k] = a >= 0 && b < n ? (half[a] + half[b]) / 2 : a >= 0 ? half[a] : half[b]
  }
  // Glaetten: gleitender Median ueber 5 Zeilen (Kanten bleiben), dann Mittel ueber 3.
  const med = half.map((_, k) => median(half.slice(Math.max(0, k - 2), k + 3)))
  const smooth = med.map((_, k) => (med[Math.max(0, k - 1)] + med[k] + med[Math.min(n - 1, k + 1)]) / 3)
  const pxH = n * grid.fy
  const sy = height / pxH
  const widest = Math.max(...smooth) * 2
  const sx = diameter > 0 ? diameter / widest : sy
  // Von unten nach oben: t = 0 am Fuss.
  const ts = [], rs = []
  for (let k = n - 1; k >= 0; k--) {
    ts.push((n - 1 - k) / (n - 1))
    rs.push(smooth[k] * sx)
  }
  const tol = tolerance ?? Math.max(0.3, height / 300)
  const fit = profileFromSamples(ts, rs, height, { tolerance: tol })
  if (!fit) return { ok: false, notes: ['Aus dem Umriss lässt sich keine Körperform ablesen.'] }
  const notes = [...found.notes]
  const ratio = diameter > 0 ? sx / sy : 1
  if (Math.abs(ratio - 1) > 0.08) notes.push(`Breite und Höhe passen nicht zum Seitenverhältnis im Foto (quer ${Math.round((ratio - 1) * 100)} % gestreckt) – schräg fotografiert? Der Umriss folgt den eingegebenen Maßen.`)
  return { ok: true, ...fit, height, diameter: diameter > 0 ? diameter : fit.diameter, notes }
}

/**
 * Lage des Fotos hinter der Zeichnung (mm, y nach oben), damit der gefundene Gegenstand `height` hoch und
 * `diameter` breit ist (quer notfalls gestreckt), mittig auf der Achse, mit dem Fuss auf dem Bett:
 * { x0, y0, w, h } wie das Foto in der Zeichenflaeche liegt.
 */
export function photoPlacement(img, box, { height, diameter = null }) {
  const sy = height / (box.y1 - box.y0)
  const sx = diameter > 0 ? diameter / (box.x1 - box.x0) : sy
  const w = img.width * sx, h = img.height * sy
  const cx = ((box.x0 + box.x1) / 2) * sx
  return { x0: -cx, y0: -(img.height - box.y1) * sy, w, h }
}
