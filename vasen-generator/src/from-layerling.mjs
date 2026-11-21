// Vasen-Generator 2: the settings of Layerling's vase (lib/vase/vase-geometry.mjs, German names) as settings of
// this core. It is the bridge for building Layerling's vase with this core: what the core covers is taken over,
// what it does not cover yet is named in `unsupported`, so the caller can stay with the old core for that vase.

import { normalizeParams } from './params.mjs'

const OLD_PROFILES = {
  flasche: [[0, 0.93], [0.06, 1], [0.5, 1], [0.6, 0.95], [0.7, 0.7], [0.78, 0.46], [0.86, 0.37], [1, 0.4]],
  bauchig: [[0, 0.66], [0.1, 0.86], [0.32, 1], [0.55, 0.94], [0.75, 0.66], [0.9, 0.46], [1, 0.5]],
  schale: [[0, 0.62], [0.08, 0.86], [0.2, 1], [0.3, 0.9], [0.4, 0.5], [0.55, 0.3], [0.85, 0.27], [1, 0.36]],
  fass: [[0, 0.88], [0.45, 1], [0.72, 0.97], [0.86, 0.8], [0.95, 0.66], [1, 0.64]],
  zylinder: [[0, 1], [1, 1]],
  trichter: [[0, 0.62], [1, 1]],
}
const WAVE_STYLE = { weich: 'soft', spitz: 'sharp', bogen: 'arches', lamellen: 'soft' }
const RIB_SHAPE = { rund: 'round', v: 'sharp', flach: 'flat' }
const QUALITY = { entwurf: 'draft', standard: 'standard', fein: 'fine' }

function section(type, sides, round, waves, amp, style, unsupported, name) {
  if (type === 'vieleck') return { type: 'polygon', sides, round }
  if (type === 'welle') {
    if (style === 'lamellen') unsupported.push(`${name}: lamellen`)
    return { type: 'wave', waves, amp, style: WAVE_STYLE[style] ?? 'soft' }
  }
  if (type === 'gezeichnet') unsupported.push(`${name}: gezeichnet`)
  return { type: 'circle' }
}

/** Layerling's vase settings (complete, as normalizeParams of the old core gives them) as this core's. */
export function fromLayerling(old) {
  const unsupported = []
  const band = { from: old.zoneFrom ?? 0, to: old.zoneTo ?? 100, fade: old.zoneFade ?? 6 }
  const radius = (old.diameter ?? 90) / 2
  const layers = []
  if (old.effect === 'rillen' && old.ribCount > 0 && old.ribDepth > 0) {
    layers.push({
      pattern: 'ribs', count: old.ribCount, depth: -old.ribDepth, width: old.grooveWidth, profile: RIB_SHAPE[old.ribShape] ?? 'round',
      wave: old.waveAmplitude > 0 ? (old.ribCount * old.waveAmplitude) / (2 * Math.PI * radius) : 0, waveCount: old.waveCount, ...band,
    })
  } else if (old.effect === 'streifen') {
    layers.push({ pattern: 'ribs', count: old.stripeCount, depth: -old.stripeDepth, width: old.stripeWidth, profile: 'round', turn: old.stripeTurn, cross: old.stripeStyle === 'doppelt', ...band })
  } else if (old.effect === 'voronoi') {
    const count = Math.max(3, Math.round((2 * Math.PI * radius) / old.voronoiCell))
    layers.push({ pattern: 'voronoi', count, depth: -old.voronoiDepth, width: Math.min(1, old.voronoiGap / ((2 * Math.PI * radius) / count)), profile: 'round', seed: old.voronoiSeed, ...band })
  }
  const custom = old.profile === 'gezeichnet' && Array.isArray(old.profilePoints)
  if (old.twistMode === 'kurve') unsupported.push('twistMode: kurve')
  if (old.twistAlong === 'kontur' && (old.twist || old.swayAngle)) unsupported.push('twistAlong: kontur')
  if ((old.sectionZoneFrom ?? 0) > 0 || (old.sectionZoneTo ?? 100) < 100) unsupported.push('sectionZone')
  for (const [key, off] of [['cutout', 'keine'], ['lamp', 'keine'], ['reinforce', 'keine'], ['legMode', 'keine'], ['saucerMode', 'keine'], ['insertMode', 'keine'], ['lidMode', 'keiner']]) {
    if (old[key] && old[key] !== off) unsupported.push(`${key}: ${old[key]}`)
  }
  for (const key of ['footHeight', 'rubberFeet', 'floorSlope']) if (old[key] > 0) unsupported.push(key)
  if (old.drainHoles > 1) unsupported.push('drainHoles > 1')
  if (old.innerShape === 'rund') unsupported.push('innerShape: rund')
  const params = normalizeParams({
    height: old.height,
    diameter: old.diameter,
    profile: 'custom',
    profilePoints: (custom ? old.profilePoints : OLD_PROFILES[old.profile] ?? OLD_PROFILES.flasche).map((pt) => [pt[0], pt[1], pt[2] === 1 ? 1 : 0]),
    section: section(old.section, old.polySides, old.polyRound, old.sectionWaves, old.sectionWaveAmp, old.sectionWaveStyle, unsupported, 'section'),
    section2: old.section2 && old.section2 !== 'keiner' ? section(old.section2, old.section2Sides, old.section2Round, old.section2Waves, old.section2WaveAmp, old.section2WaveStyle, unsupported, 'section2') : { type: 'none' },
    morphFrom: old.section2From,
    morphTo: old.section2To,
    twist: old.twist,
    sway: old.swayAngle,
    swayCount: old.swayCount,
    body: old.body === 'hohl' ? 'hollow' : 'solid',
    wall: old.wall,
    bottom: old.body === 'hohl' ? old.bottom : 1,
    hole: old.drainHoles === 1 ? old.drainDiameter : 0,
    style: old.effect === 'lowpoly' ? 'lowpoly' : 'smooth',
    lowAround: old.lowpolyAround,
    lowRows: old.lowpolyRows,
    lowJitter: old.lowpolyJitter,
    lowSeed: old.lowpolySeed,
    layers,
    quality: QUALITY[old.quality] ?? 'standard',
    lineWidth: old.lineWidth,
    material: old.material,
  })
  return { params, unsupported }
}
