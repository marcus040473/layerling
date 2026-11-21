// Vasen-Generator 2: ready-made vases, and one made at random.

import { PATTERNS, PROFILES, newLayer, normalizeParams } from './params.mjs'

export const PRESETS = [
  { id: 'fluted', name: { de: 'Kannelierte Flasche', en: 'Fluted bottle' }, color: '#8fb3a5', params: { profile: 'bottle', layers: [newLayer('ribs', { count: 40, depth: -1.4, width: 0.9 })] } },
  { id: 'spiral', name: { de: 'Spiral-Sechseck', en: 'Spiral hexagon' }, color: '#d9d4c7', params: { profile: 'belly', section: { type: 'polygon', sides: 6, round: 0.12 }, twist: 120 } },
  { id: 'honey', name: { de: 'Waben', en: 'Honeycomb' }, color: '#e0a83a', params: { profile: 'barrel', height: 150, layers: [newLayer('honeycomb', { count: 20, depth: -0.9, width: 0.3, from: 6, to: 94 })] } },
  { id: 'knit', name: { de: 'Strickvase', en: 'Knitted' }, color: '#c9705e', params: { profile: 'belly', layers: [newLayer('knit', { count: 34, depth: 0.9 })] } },
  { id: 'scales', name: { de: 'Drachenschuppen', en: 'Dragon scales' }, color: '#3f7f73', params: { profile: 'amphora', layers: [newLayer('scales', { count: 20, depth: 0.9, flip: true })] } },
  { id: 'basket', name: { de: 'Korbgeflecht', en: 'Basket weave' }, color: '#b98b55', params: { profile: 'bowl', height: 110, diameter: 130, layers: [newLayer('weave', { count: 24, depth: 1 })] } },
  { id: 'diamond', name: { de: 'Rauten', en: 'Diamonds' }, color: '#5b6f95', params: { profile: 'tulip', layers: [newLayer('ribs', { count: 28, depth: -1.1, width: 0.5, turn: 150, cross: true, profile: 'sharp' })] } },
  { id: 'bamboo', name: { de: 'Bambus', en: 'Bamboo' }, color: '#9bb06a', params: { profile: 'cylinder', diameter: 70, height: 200, layers: [newLayer('rings', { count: 5, depth: 1.6, width: 0.16, profile: 'round' }), newLayer('ribs', { count: 60, depth: -0.3, width: 0.6 })] } },
  { id: 'lamp', name: { de: 'Voronoi-Leuchte', en: 'Voronoi lamp' }, color: '#f1ede4', params: { profile: 'hourglass', height: 200, diameter: 140, body: 'hollow', wall: 0.9, bottom: 0, layers: [newLayer('voronoi', { count: 14, depth: -0.5, width: 0.3 })] } },
  { id: 'crystal', name: { de: 'Kristall', en: 'Crystal' }, color: '#7fa7c9', params: { profile: 'belly', style: 'lowpoly', lowAround: 14, lowRows: 9, lowJitter: 0.45 } },
  { id: 'planter', name: { de: 'Pflanztopf', en: 'Planter' }, color: '#c98f6b', params: { profile: 'cone', height: 110, diameter: 130, body: 'hollow', wall: 2, bottom: 2.4, hole: 10, section: { type: 'wave', waves: 16, amp: 0.05, style: 'arches' } } },
  { id: 'star', name: { de: 'Sternwirbel', en: 'Star swirl' }, color: '#caa5c9', params: { profile: 'tulip', section: { type: 'star', sides: 7, inner: 0.78 }, section2: { type: 'circle' }, morphFrom: 55, morphTo: 100, twist: 100 } },
  { id: 'hammered', name: { de: 'Gehämmert', en: 'Hammered' }, color: '#b9b4a8', params: { profile: 'amphora', layers: [newLayer('hammered', { count: 16, depth: -0.9 })] } },
]

function generator(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

/** A vase made at random from a seed; the same seed gives the same vase. Kept within what prints well. */
export function randomVase(seed) {
  const random = generator(seed * 2654435761)
  const pick = (list) => list[Math.floor(random() * list.length)]
  const between = (a, b) => a + (b - a) * random()
  const params = { profile: pick(Object.keys(PROFILES).filter((name) => name !== 'cylinder' || random() < 0.5)), height: Math.round(between(120, 220)), diameter: Math.round(between(70, 130)) }
  const kind = random()
  if (kind < 0.2) params.section = { type: 'polygon', sides: Math.round(between(3, 8)), round: between(0, 0.3) }
  else if (kind < 0.32) params.section = { type: 'star', sides: Math.round(between(5, 12)), inner: between(0.7, 0.9) }
  else if (kind < 0.5) params.section = { type: 'wave', waves: Math.round(between(6, 24)), amp: between(0.03, 0.08), style: pick(['soft', 'arches', 'flutes']) }
  if (params.section && random() < 0.75) params.twist = Math.round(between(-150, 150))
  if (params.section && random() < 0.25) { params.section2 = { type: 'circle' }; params.morphFrom = 40 }
  if (!params.section || random() < 0.35) {
    const pattern = pick(PATTERNS.filter((name) => name !== 'image'))
    const layer = newLayer(pattern, { seed: Math.round(between(1, 999)) })
    if (pattern === 'ribs') Object.assign(layer, { count: Math.round(between(16, 60)), turn: random() < 0.5 ? Math.round(between(-200, 200)) : 0, cross: random() < 0.3 })
    else if (pattern !== 'rings') layer.count = Math.round(between(12, 30))
    if (random() < 0.3) { layer.from = Math.round(between(0, 30)); layer.to = Math.round(between(60, 100)) }
    params.layers = [layer]
  }
  if (!params.layers && !params.section && random() < 0.5) Object.assign(params, { style: 'lowpoly', lowAround: Math.round(between(8, 24)), lowRows: Math.round(between(5, 14)), lowSeed: Math.round(between(1, 999)) })
  return normalizeParams(params)
}
