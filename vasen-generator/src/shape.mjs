// Vasen-Generator 2: the body form (radius over the height) and the cross-section (radius over the angle).

import { PROFILES } from './params.mjs'

const TAU = 2 * Math.PI
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

/**
 * The body form as a curve through its points: monotone cubic (Fritsch-Carlson), so a waist stays a waist and
 * the neck never gets thinner than its points. A point of kind 1 is a corner. Returns `at(t)` for t in 0..1.
 */
export function profileCurve(points) {
  const n = points.length
  const xs = points.map((pt) => pt[0]), ys = points.map((pt) => pt[1])
  if (n === 1) return () => ys[0]
  const h = new Float64Array(n - 1), delta = new Float64Array(n - 1)
  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1] - xs[i]
    delta[i] = (ys[i + 1] - ys[i]) / h[i]
  }
  const mL = new Float64Array(n), mR = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let m
    if (i === 0) m = delta[0]
    else if (i === n - 1) m = delta[n - 2]
    else if (delta[i - 1] * delta[i] <= 0) m = 0
    else {
      const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]
      m = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i])
    }
    mL[i] = mR[i] = m
    if (points[i][2] === 1) {
      mL[i] = i > 0 ? delta[i - 1] : delta[0]
      mR[i] = i < n - 1 ? delta[i] : delta[n - 2]
    }
  }
  let last = 0
  return (x) => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[n - 1]) return ys[n - 1]
    // Rows ask in ascending order: start at the piece found last.
    let i = x >= xs[last] ? last : 0
    while (i < n - 2 && x > xs[i + 1]) i++
    last = i
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * mR[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * mL[i + 1]
  }
}

export function profilePointsOf(p) {
  return p.profile === 'custom' && p.profilePoints ? p.profilePoints : PROFILES[p.profile] ?? PROFILES.bottle
}

/** The radius in mm at height z: the widest place of the curve is half the diameter. */
export function radiusFunction(p) {
  const at = profileCurve(profilePointsOf(p))
  let max = 0
  for (let k = 0; k <= 512; k++) max = Math.max(max, at(k / 512))
  const scale = p.diameter / 2 / (max || 1)
  const H = p.height
  return (z) => scale * Math.max(0.02, at(clamp(z / H, 0, 1)))
}

/**
 * A cross-section as the radius at an angle, its widest place 1, with the angles where it has a corner
 * (they are put on columns of the mesh, so corners come out sharp) and how often it repeats round the vase.
 */
export function sectionFunction(s) {
  if (s.type === 'polygon') {
    const n = s.sides, half = Math.PI / n, a = Math.cos(half)
    const rho = clamp(s.round, 0, 1) * a
    const c = (a - rho) / a // corner of the smaller polygon the rounding rolls round
    const max = c + rho
    const at = (th) => {
      let phi = th % (TAU / n)
      if (phi < 0) phi += TAU / n
      if (phi > half) phi -= TAU / n // -half..half, 0 at a corner
      const side = a / Math.cos(half - Math.abs(phi))
      if (rho <= 1e-9) return side / max
      const sin = Math.sin(phi), cos = Math.cos(phi)
      const disc = rho * rho - c * c * sin * sin
      if (disc < 0) return side / max
      const t = c * cos + Math.sqrt(disc)
      // The arc counts where the ray leaves the rounding within the corner's own wedge.
      return (Math.atan2(Math.abs(t * sin), t * cos - c) <= half + 1e-9 ? t : side) / max
    }
    return { at, sharp: rho <= 1e-9 ? Array.from({ length: n }, (_, k) => (TAU * k) / n) : [], repeat: n }
  }
  if (s.type === 'star') {
    const n = s.sides, beta = Math.PI / n, k = s.inner
    const sinB = Math.sin(beta)
    const at = (th) => {
      let phi = th % (TAU / n)
      if (phi < 0) phi += TAU / n
      if (phi > beta) phi = TAU / n - phi // 0 at a tip, beta at a valley
      return (k * sinB) / (k * Math.sin(beta - phi) + Math.sin(phi))
    }
    return { at, sharp: Array.from({ length: 2 * n }, (_, i) => (Math.PI * i) / n), repeat: 2 * n }
  }
  if (s.type === 'wave') {
    const n = s.waves, amp = s.amp, style = s.style
    const at = (th) => {
      const phase = (n * th) / TAU
      const f = phase - Math.floor(phase)
      const wave = style === 'sharp' ? 1 - 4 * Math.abs(f - 0.5)
        : style === 'arches' ? 2 * Math.abs(Math.cos(Math.PI * f)) - 1
        : style === 'flutes' ? 1 - 2 * Math.abs(Math.sin(Math.PI * f))
        : Math.cos(TAU * f)
      return (1 + amp * wave) / (1 + amp)
    }
    const sharp = style === 'sharp' ? Array.from({ length: 2 * n }, (_, i) => (Math.PI * i) / n)
      : style === 'arches' ? Array.from({ length: n }, (_, i) => (TAU * (i + 0.5)) / n)
      : style === 'flutes' ? Array.from({ length: n }, (_, i) => (TAU * i) / n)
      : []
    return { at, sharp, repeat: style === 'sharp' ? 2 * n : n }
  }
  if (s.type === 'super') {
    const raw = (th) => {
      const t = (s.m * th) / 4
      const v = Math.pow(Math.abs(Math.cos(t)), s.n2) + Math.pow(Math.abs(Math.sin(t)), s.n3)
      return Math.pow(Math.max(v, 1e-9), -1 / s.n1)
    }
    let max = 0
    for (let k = 0; k < 4096; k++) max = Math.max(max, raw((TAU * k) / 4096))
    // Pointed forms would close the middle: no part of the outline comes nearer than a fifth of the widest.
    const at = (th) => Math.max(0.2, raw(th) / max)
    return { at, sharp: [], repeat: 1 }
  }
  if (s.type === 'ellipse') {
    const b = s.ratio
    const at = (th) => b / Math.hypot(b * Math.cos(th), Math.sin(th))
    return { at, sharp: [], repeat: 2 }
  }
  return { at: () => 1, sharp: [], repeat: 1 }
}

/**
 * The angles of the mesh's columns: spread evenly along the outline instead of evenly by angle, so the flanks
 * of a star get as many points as its tips and a pattern's cells keep their width; with two cross-sections
 * along the mean of both. A column sits on every corner. Angles ascend from 0 and stay below 2 pi.
 */
export function columnAngles(count, sections) {
  const T = 4096
  const cum = new Float64Array(T + 1)
  for (const s of sections) {
    let prev = s.at(0), total = 0
    const part = new Float64Array(T + 1)
    for (let k = 1; k <= T; k++) {
      const r = s.at((TAU * k) / T)
      total += Math.hypot(((r + prev) / 2) * (TAU / T), r - prev)
      part[k] = total
      prev = r
    }
    for (let k = 1; k <= T; k++) cum[k] += part[k] / total
  }
  const whole = cum[T]
  const angles = new Float64Array(count)
  let k = 0
  for (let j = 0; j < count; j++) {
    const want = (whole * j) / count
    while (k < T - 1 && cum[k + 1] < want) k++
    const span = cum[k + 1] - cum[k]
    angles[j] = (TAU * (k + (span > 0 ? (want - cum[k]) / span : 0))) / T
  }
  // Corners onto the nearest column, as long as the columns keep their order.
  const taken = new Uint8Array(count)
  for (const s of sections) {
    for (const corner of s.sharp) {
      let lo = 0, hi = count - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (angles[mid] <= corner) lo = mid
        else hi = mid - 1
      }
      const next = (lo + 1) % count
      const dLo = corner - angles[lo], dNext = next === 0 ? TAU - corner : angles[next] - corner
      const j = dLo <= dNext ? lo : next
      if (taken[j] || (j === 0 && corner > Math.PI)) continue
      const before = j > 0 ? angles[j - 1] : -1, after = j < count - 1 ? angles[j + 1] : TAU
      if (corner <= before + 1e-9 || corner >= after - 1e-9) continue
      angles[j] = corner
      taken[j] = 1
    }
  }
  return angles
}
