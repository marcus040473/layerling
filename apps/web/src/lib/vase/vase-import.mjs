/**
 * Take a body form from a mesh (STL, 3MF, OBJ) - from a model vase, say.
 *
 * The vase stands upright (Z up, as in the slicer). The axis of revolution is the vertical line through its
 * centre of mass (for an open mesh, that of its surface). At 240 heights the mesh's
 * greatest distance from the axis is measured: the hull of a body of revolution, as SolidCraft takes it
 * for "Spun profile". So a hollow vase gives its outer wall, and a handle sticks out. The
 * measurements become points with control handles as in the SVG import (at most 0.2 mm off). If the
 * part lies on its side (no flat face at the bottom) or is not round about the axis, a note says so.
 */
import { profileFromSamples } from './svg-import.mjs'

const fmt = (v) => v.toLocaleString('de-DE', { maximumFractionDigits: 1 })
const SECTORS = 16

/**
 * `soup`: triangles as a flat list x, y, z (9 numbers each). Returns { ok, profilePoints, height,
 * diameter, notes } like svgToProfile, or { ok: false, notes }.
 */
export function meshToProfile(soup, { stations = 240, tolerance = 0.2 } = {}) {
  const n = Math.floor(soup.length / 9) * 9
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (let i = 0; i < n; i += 3) {
    const x = soup[i], y = soup[i + 1], z = soup[i + 2]
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
    if (z < z0) z0 = z
    if (z > z1) z1 = z
  }
  const H = z1 - z0
  if (!(H > 0)) return { ok: false, notes: ['Das Netz hat keine Höhe – ist es leer oder flach?'] }
  // Axis through the body's centre of mass (signed tetrahedra to the origin) - for a triangle or a
  // pentagon, the middle of the bounding box is off. Open mesh: centre of mass of the surface.
  let vol = 0, mx = 0, my = 0, area = 0, ax = 0, ay = 0
  for (let t = 0; t < n; t += 9) {
    const [a0, a1, a2, b0, b1, b2, c0, c1, c2] = [soup[t], soup[t + 1], soup[t + 2] - z0, soup[t + 3], soup[t + 4], soup[t + 5] - z0, soup[t + 6], soup[t + 7], soup[t + 8] - z0]
    const v = (a0 * (b1 * c2 - b2 * c1) - a1 * (b0 * c2 - b2 * c0) + a2 * (b0 * c1 - b1 * c0)) / 6
    if (!Number.isFinite(v)) continue
    vol += v
    mx += (v * (a0 + b0 + c0)) / 4
    my += (v * (a1 + b1 + c1)) / 4
    const ux = b0 - a0, uy = b1 - a1, uz = b2 - a2, wx = c0 - a0, wy = c1 - a1, wz = c2 - a2
    const A = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2
    area += A
    ax += (A * (a0 + b0 + c0)) / 3
    ay += (A * (a1 + b1 + c1)) / 3
  }
  const solid = Math.abs(vol) > 1e-6 * (x1 - x0) * (y1 - y0) * H
  const cx = solid ? mx / vol : area > 0 ? ax / area : (x0 + x1) / 2
  const cy = solid ? my / vol : area > 0 ? ay / area : (y0 + y1) / 2
  const dz = H / stations
  // Per height: greatest distance from the axis, and per angle sector (to check whether the part is round).
  const rMax = new Float64Array(stations).fill(-1)
  const sector = new Float64Array(stations * SECTORS).fill(-1)
  const hit = (k, x, y) => {
    const dx = x - cx, dy = y - cy
    const r = Math.hypot(dx, dy)
    if (r > rMax[k]) rMax[k] = r
    const s = Math.min(SECTORS - 1, Math.floor(((Math.atan2(dy, dx) / (2 * Math.PI)) + 0.5) * SECTORS))
    if (r > sector[k * SECTORS + s]) sector[k * SECTORS + s] = r
  }
  // Bottom and top: the points right there (edge of the bottom, rim of the opening).
  let rBottom = -1, rTop = -1
  const eps = H * 1e-6
  for (let i = 0; i < n; i += 3) {
    const r = Math.hypot(soup[i] - cx, soup[i + 1] - cy)
    if (soup[i + 2] <= z0 + eps && r > rBottom) rBottom = r
    if (soup[i + 2] >= z1 - eps && r > rTop) rTop = r
  }
  // Does the part stand? A standing vase has a flat face at the bottom (a hollow foot still has a ring);
  // a part lying on its side touches the bed only along a line, for the same width of its bottom edge.
  let flat = 0
  for (let t = 0; t < n; t += 9) {
    if (Math.max(soup[t + 2], soup[t + 5], soup[t + 8]) > z0 + 0.01) continue
    const ux = soup[t + 3] - soup[t], uy = soup[t + 4] - soup[t + 1], wx = soup[t + 6] - soup[t], wy = soup[t + 7] - soup[t + 1]
    flat += Math.abs(ux * wy - uy * wx) / 2
  }
  const lying = flat < 0.05 * Math.PI * Math.max(rBottom, 1) ** 2
  for (let t = 0; t < n; t += 9) {
    const za = soup[t + 2], zb = soup[t + 5], zc = soup[t + 8]
    const lo = Math.min(za, zb, zc), hi = Math.max(za, zb, zc)
    if (!(hi > lo)) continue
    // Heights z_k = z0 + (k + 0.5) dz that the triangle crosses.
    const k0 = Math.max(0, Math.ceil((lo - z0) / dz - 0.5)), k1 = Math.min(stations - 1, Math.floor((hi - z0) / dz - 0.5))
    for (let k = k0; k <= k1; k++) {
      const z = z0 + (k + 0.5) * dz
      // The distance from the axis is convex along a segment: the greatest lies at one end of the cut.
      for (const [a, b] of [[t, t + 3], [t + 3, t + 6], [t + 6, t]]) {
        const ea = soup[a + 2], eb = soup[b + 2]
        if ((ea - z) * (eb - z) > 0 || ea === eb) continue
        const f = (z - ea) / (eb - ea)
        hit(k, soup[a] + f * (soup[b] - soup[a]), soup[a + 1] + f * (soup[b + 1] - soup[a + 1]))
      }
    }
  }
  const ts = [], rs = []
  if (rBottom > 0) { ts.push(0); rs.push(rBottom) }
  let notRound = 0, measured = 0
  for (let k = 0; k < stations; k++) {
    if (rMax[k] <= 0) continue
    ts.push((k + 0.5) / stations)
    rs.push(rMax[k])
    // Round about the axis? Only with enough measuring points all round (a coarse polygon does not hit every sector).
    let filled = 0, lo = Infinity
    for (let s = 0; s < SECTORS; s++) {
      const v = sector[k * SECTORS + s]
      if (v < 0) continue
      filled++
      lo = Math.min(lo, v)
    }
    if (filled >= SECTORS / 2) {
      measured++
      if (lo < 0.45 * rMax[k]) notRound++
    }
  }
  if (rTop > 0) { ts.push(1); rs.push(rTop) }
  const fit = profileFromSamples(ts, rs, H, { tolerance })
  if (!fit) return { ok: false, notes: ['Aus dem Netz lässt sich keine Körperform ablesen.'] }
  const notes = [`Aus dem Netz: ${fmt(fit.height)} mm hoch, ${fmt(fit.diameter)} mm breit, ${fit.profilePoints.length} Punkte (größter Abstand zur senkrechten Achse an ${stations} Höhen).`]
  if (lying) notes.push('Unten liegt keine ebene Fläche auf (runder Fuß – oder liegt das Teil?). Die Achse ist immer die Senkrechte (Z); ein liegendes Teil erst im Slicer aufstellen und neu speichern.')
  else if (measured > 0 && notRound > measured / 2) notes.push('Das Teil ist um die senkrechte Achse nicht rund (Henkel, Ausleger, ovale Form?) – genommen wurde der größte Abstand rundum.')
  return { ok: true, ...fit, notes }
}

// In Layerling the editor reads the file itself (like the import window) and hands the triangles to meshToProfile;
// reading through the surface tool (meshFileToProfile in the vase tool) is not needed here.
