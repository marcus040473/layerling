// Vasen-Generator 2: settings. Plain data, no code in them, so they can go into a link, a file or a worker.

/** Body forms as control points [height 0..1, radius 0..1]; kind 1 = corner. The widest place is the diameter. */
export const PROFILES = {
  bottle: [[0, 0.93], [0.06, 1], [0.5, 1], [0.6, 0.95], [0.7, 0.7], [0.78, 0.46], [0.86, 0.37], [1, 0.4]],
  belly: [[0, 0.66], [0.1, 0.86], [0.32, 1], [0.55, 0.94], [0.75, 0.66], [0.9, 0.46], [1, 0.5]],
  amphora: [[0, 0.34], [0.12, 0.62], [0.42, 1], [0.66, 0.74], [0.82, 0.4], [0.92, 0.36], [1, 0.5]],
  tulip: [[0, 0.5], [0.2, 0.92], [0.42, 0.84], [0.66, 0.6], [0.86, 0.7], [1, 1]],
  barrel: [[0, 0.88], [0.45, 1], [0.72, 0.97], [0.86, 0.8], [0.95, 0.66], [1, 0.64]],
  hourglass: [[0, 0.92], [0.5, 0.5], [1, 1]],
  bowl: [[0, 0.5], [0.25, 0.8], [0.6, 0.96], [1, 1]],
  cone: [[0, 0.6], [1, 1]],
  cylinder: [[0, 1], [1, 1]],
}

export const SECTIONS = ['circle', 'polygon', 'star', 'wave', 'super', 'ellipse']
export const WAVE_STYLES = ['soft', 'sharp', 'arches', 'flutes']
export const PATTERNS = ['ribs', 'rings', 'honeycomb', 'bumps', 'voronoi', 'hammered', 'scales', 'knit', 'weave', 'bricks', 'noise', 'image']
export const PATTERN_PROFILES = ['round', 'sharp', 'flat', 'dome']
export const BODIES = ['solid', 'hollow']
export const QUALITIES = ['draft', 'standard', 'fine']
export const MATERIALS = { pla: 1.24, petg: 1.27, abs: 1.04, asa: 1.07, tpu: 1.21 }

/** Triangle budget and how many points a pattern cell gets, per quality. */
export const QUALITY = {
  draft: { budget: 160_000, detail: 0.65, smooth: 96, tol: 0.05, maxStep: 8 },
  standard: { budget: 700_000, detail: 1, smooth: 160, tol: 0.02, maxStep: 5 },
  fine: { budget: 2_500_000, detail: 1.6, smooth: 256, tol: 0.01, maxStep: 3 },
}

export const SECTION_DEFAULTS = Object.freeze({
  type: 'circle',
  sides: 6, // polygon, star
  round: 0.15, // polygon: 0 sharp .. 1 a circle
  inner: 0.6, // star: radius of the valleys
  waves: 12,
  amp: 0.08, // wave: share of the radius
  style: 'soft',
  m: 6, n1: 1, n2: 1.7, n3: 1.7, // superformula
  ratio: 0.7, // ellipse: short side / long side
})

export const LAYER_DEFAULTS = Object.freeze({
  pattern: 'ribs',
  on: true,
  count: 36, // cells round the vase (rings: rings over the height)
  aspect: 1, // cell height / cell width
  depth: -1.2, // mm; below 0 goes inwards, above 0 outwards
  width: 0.55, // share of a cell the groove, joint, bump or strand takes
  profile: 'round',
  turn: 0, // degrees the pattern turns over the height, on top of the body's twist
  cross: false, // ribs: a second set turning the other way (diamonds)
  wave: 0, // ribs: sideways swing in cells; rings: up and down in cells
  waveCount: 3,
  stagger: 0.5, // bricks
  flip: false, // scales: rims at the top (prints without overhang)
  from: 0, to: 100, // height band in %
  fade: 6, // mm
  seed: 1,
  octaves: 3, // noise
  fit: 'tile', // image: tile | once (over the height band)
  invert: false,
  image: null, // { w, h, data: number[] | Float32Array 0..1 }
})

export const DEFAULTS = Object.freeze({
  height: 180,
  diameter: 90,
  profile: 'bottle',
  profilePoints: null, // profile 'custom': [[t, r, kind?], ...]
  section: SECTION_DEFAULTS,
  section2: { ...SECTION_DEFAULTS, type: 'none' },
  morphFrom: 0, morphTo: 100, // % of the height where section turns into section2
  twist: 0, // degrees over the height
  sway: 0, swayCount: 2, // degrees back and forth
  body: 'solid', // solid = one closed body for the slicer's vase mode; hollow = wall and bottom
  wall: 1.6,
  bottom: 1.6, // hollow: 0 = open at the bottom (lamp shade, tube)
  hole: 0, // hollow: hole in the middle of the bottom, mm (drain, cable)
  style: 'smooth', // smooth | lowpoly
  lowAround: 22, lowRows: 12, lowJitter: 0.35, lowSeed: 1,
  layers: [],
  quality: 'standard',
  lineWidth: 0.45,
  layerHeight: 0.2,
  material: 'pla',
  speed: 60, // mm/s, for the time estimate
  maxOverhang: 45,
})

export const LIMITS = {
  height: [10, 600], diameter: [10, 400], morphFrom: [0, 100], morphTo: [0, 100],
  twist: [-1440, 1440], sway: [0, 180], swayCount: [0.5, 12],
  wall: [0.4, 12], bottom: [0, 20], hole: [0, 200],
  lowAround: [3, 96], lowRows: [1, 80], lowJitter: [0, 0.9], lowSeed: [1, 9999],
  lineWidth: [0.2, 1.6], layerHeight: [0.05, 0.8], speed: [5, 500], maxOverhang: [20, 80],
}
const SECTION_LIMITS = { sides: [3, 24], round: [0, 1], inner: [0.15, 0.98], waves: [2, 96], amp: [0, 0.4], m: [1, 24], n1: [0.2, 20], n2: [0.2, 20], n3: [0.2, 20], ratio: [0.3, 1] }
const LAYER_LIMITS = {
  count: [1, 400], aspect: [0.2, 6], depth: [-8, 8], width: [0.05, 1], turn: [-1440, 1440], wave: [0, 3], waveCount: [0.5, 24],
  stagger: [0, 0.5], from: [0, 100], to: [0, 100], fade: [0, 80], seed: [1, 9999], octaves: [1, 5],
}
const INTEGERS = new Set(['sides', 'waves', 'count', 'lowAround', 'lowRows', 'lowSeed', 'seed', 'octaves'])
export const MAX_LAYERS = 6
export const MAX_IMAGE = 1024
const MAX_PROFILE_POINTS = 40

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

function numbers(target, source, defaults, limits) {
  for (const key of Object.keys(limits)) {
    const raw = Number(source?.[key])
    let value = Number.isFinite(raw) ? clamp(raw, limits[key][0], limits[key][1]) : defaults[key]
    if (INTEGERS.has(key)) value = Math.round(value)
    target[key] = value
  }
}

const choice = (value, list, fallback) => (list.includes(value) ? value : fallback)

function normalizeSection(input, allowNone) {
  const out = {}
  numbers(out, input, SECTION_DEFAULTS, SECTION_LIMITS)
  out.type = choice(input?.type, allowNone ? ['none', ...SECTIONS] : SECTIONS, allowNone ? 'none' : 'circle')
  out.style = choice(input?.style, WAVE_STYLES, 'soft')
  return out
}

/** A height map kept as plain numbers 0..1; null when it is not one. */
function normalizeImage(input) {
  const w = Math.round(Number(input?.w)), h = Math.round(Number(input?.h))
  if (!(w >= 1 && h >= 1 && w <= MAX_IMAGE && h <= MAX_IMAGE) || !input.data || input.data.length !== w * h) return null
  return { w, h, data: input.data instanceof Float32Array ? input.data : Float32Array.from(input.data, (v) => clamp(Number(v) || 0, 0, 1)) }
}

function normalizeLayer(input) {
  const out = {}
  numbers(out, input, LAYER_DEFAULTS, LAYER_LIMITS)
  out.pattern = choice(input?.pattern, PATTERNS, 'ribs')
  out.profile = choice(input?.profile, PATTERN_PROFILES, 'round')
  out.fit = choice(input?.fit, ['tile', 'once'], 'tile')
  out.on = input?.on !== false
  out.cross = Boolean(input?.cross)
  out.flip = Boolean(input?.flip)
  out.invert = Boolean(input?.invert)
  out.image = out.pattern === 'image' ? normalizeImage(input?.image) : null
  if (out.to < out.from) [out.from, out.to] = [out.to, out.from]
  return out
}

/** Points of a drawn body form: sorted by height, from 0 to 1, radius above 0. */
export function normalizeProfilePoints(list) {
  if (!Array.isArray(list)) return null
  const points = list
    .filter((pt) => Array.isArray(pt) && Number.isFinite(Number(pt[0])) && Number.isFinite(Number(pt[1])))
    .map((pt) => [clamp(Number(pt[0]), 0, 1), clamp(Number(pt[1]), 0.02, 1), pt[2] === 1 ? 1 : 0])
    .sort((a, b) => a[0] - b[0])
    .slice(0, MAX_PROFILE_POINTS)
  const out = []
  for (const pt of points) if (!out.length || pt[0] - out[out.length - 1][0] > 1e-4) out.push(pt)
  if (out.length < 2) return null
  out[0][0] = 0
  out[out.length - 1][0] = 1
  return out
}

/** Complete settings within their limits; whatever is unknown falls away. Safe for links and files. */
export function normalizeParams(input = {}) {
  const out = {}
  numbers(out, input, DEFAULTS, LIMITS)
  out.profilePoints = normalizeProfilePoints(input?.profilePoints)
  out.profile = input?.profile === 'custom' && out.profilePoints ? 'custom' : choice(input?.profile, Object.keys(PROFILES), 'bottle')
  if (out.profile !== 'custom') out.profilePoints = null
  out.section = normalizeSection(input?.section, false)
  out.section2 = normalizeSection(input?.section2, true)
  if (out.morphTo < out.morphFrom) [out.morphFrom, out.morphTo] = [out.morphTo, out.morphFrom]
  out.body = choice(input?.body, BODIES, 'solid')
  out.style = choice(input?.style, ['smooth', 'lowpoly'], 'smooth')
  out.quality = choice(input?.quality, QUALITIES, 'standard')
  out.material = choice(input?.material, Object.keys(MATERIALS), 'pla')
  out.layers = (Array.isArray(input?.layers) ? input.layers : []).slice(0, MAX_LAYERS).map(normalizeLayer)
  return out
}

/** A layer with the defaults of its pattern: what looks right when it is first chosen. */
export const PATTERN_STARTERS = {
  ribs: { count: 36, depth: -1.2, width: 0.55, profile: 'round' },
  rings: { count: 24, depth: -1, width: 0.5, profile: 'round' },
  honeycomb: { count: 22, depth: -1, width: 0.22, profile: 'round' },
  bumps: { count: 26, depth: 1, width: 0.8, profile: 'dome' },
  voronoi: { count: 16, depth: -1, width: 0.22, profile: 'round' },
  hammered: { count: 18, depth: -0.8, width: 1, profile: 'round' },
  scales: { count: 18, depth: 0.9, width: 0.4, profile: 'round' },
  knit: { count: 30, depth: 0.9, width: 0.5, aspect: 0.8, profile: 'dome' },
  weave: { count: 20, depth: 1, width: 0.8, profile: 'dome' },
  bricks: { count: 14, depth: -0.8, width: 0.14, aspect: 0.5, profile: 'flat' },
  noise: { count: 24, depth: 1, width: 1, profile: 'round', octaves: 4 },
  image: { count: 3, depth: 0.8, width: 1, profile: 'round', fit: 'once' },
}

export function newLayer(pattern = 'ribs', over = {}) {
  return normalizeLayer({ ...LAYER_DEFAULTS, ...PATTERN_STARTERS[pattern], ...over, pattern })
}
