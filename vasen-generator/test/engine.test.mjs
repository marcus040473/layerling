// Run with: node --test vasen-generator/test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildVase, vaseSampler } from '../src/engine.mjs'
import { to3mf, toBinaryStl, weldedMesh } from '../src/export.mjs'
import { fromLayerling } from '../src/from-layerling.mjs'
import { DEFAULTS, PATTERNS, PROFILES, SECTIONS, newLayer, normalizeParams } from '../src/params.mjs'
import { PATTERN_FUNCTIONS, prepareLayer } from '../src/patterns.mjs'
import { PRESETS, randomVase } from '../src/presets.mjs'
import { columnAngles, sectionFunction } from '../src/shape.mjs'

/** A closed body facing out: every edge of the welded mesh once each way, no triangle without area, volume above 0. */
function closed(mesh) {
  const { vertices: P, triangles: I } = weldedMesh(mesh)
  const edges = new Map()
  let volume = 0, degenerate = 0
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2]
    if (a === b || b === c || a === c) degenerate++
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const key = u * 4294967296 + v, back = v * 4294967296 + u
      if (edges.get(back) === 1) edges.delete(back)
      else edges.set(key, (edges.get(key) ?? 0) + 1)
    }
    volume += P[a * 3] * (P[b * 3 + 1] * P[c * 3 + 2] - P[b * 3 + 2] * P[c * 3 + 1]) - P[a * 3 + 1] * (P[b * 3] * P[c * 3 + 2] - P[b * 3 + 2] * P[c * 3]) + P[a * 3 + 2] * (P[b * 3] * P[c * 3 + 1] - P[b * 3 + 1] * P[c * 3])
  }
  return { open: edges.size, degenerate, volume: volume / 6 }
}

function assertClosed(mesh, label) {
  const result = closed(mesh)
  assert.equal(result.open, 0, `${label}: open edges`)
  assert.equal(result.degenerate, 0, `${label}: triangles without area`)
  assert.ok(result.volume > 0, `${label}: faces out`)
  for (const value of mesh.positions) assert.ok(Number.isFinite(value), `${label}: a number`)
  return result
}

test('every pattern gives a closed body, solid and hollow', () => {
  for (const pattern of PATTERNS) {
    const layer = newLayer(pattern)
    if (pattern === 'image') layer.image = { w: 4, h: 4, data: Float32Array.from({ length: 16 }, (_, i) => (i % 5) / 4) }
    for (const body of ['solid', 'hollow']) {
      const mesh = buildVase({ body, layers: [layer], quality: 'draft' })
      assertClosed(mesh, `${pattern} ${body}`)
      assert.ok(mesh.triangleCount > 1000, `${pattern} ${body}: has a wall`)
    }
  }
})

test('every body form and cross-section gives a closed body, twisted and turning into another', () => {
  for (const profile of Object.keys(PROFILES)) assertClosed(buildVase({ profile, quality: 'draft' }), profile)
  for (const type of SECTIONS) {
    assertClosed(buildVase({ section: { type }, twist: 200, sway: 10, quality: 'draft' }), `${type} twisted`)
    assertClosed(buildVase({ section: { type }, section2: { type: 'wave', style: 'sharp' }, body: 'hollow', hole: 12, quality: 'draft' }), `${type} to wave, hollow with a hole`)
  }
})

test('hollow without a bottom, facets and every preset are closed', () => {
  assertClosed(buildVase({ body: 'hollow', bottom: 0 }), 'open at the bottom')
  assertClosed(buildVase({ style: 'lowpoly' }), 'facets')
  assertClosed(buildVase({ style: 'lowpoly', body: 'hollow' }), 'facets hollow')
  assertClosed(buildVase({ style: 'lowpoly', body: 'hollow', bottom: 0, lowJitter: 0.9 }), 'facets, a tube')
  for (const preset of PRESETS) assertClosed(buildVase({ ...preset.params, quality: 'draft' }), preset.id)
  for (let seed = 1; seed <= 25; seed++) assertClosed(buildVase({ ...randomVase(seed), quality: 'draft' }), `random ${seed}`)
})

test('the vase is as high and as wide as set, and stands on the bed', () => {
  const mesh = buildVase({ height: 150, diameter: 80, profile: 'belly' })
  let minZ = Infinity, maxZ = -Infinity, maxR = 0
  for (let i = 0; i < mesh.positions.length; i += 3) {
    minZ = Math.min(minZ, mesh.positions[i + 2]); maxZ = Math.max(maxZ, mesh.positions[i + 2])
    maxR = Math.max(maxR, Math.hypot(mesh.positions[i], mesh.positions[i + 1]))
  }
  assert.equal(minZ, 0)
  assert.equal(maxZ, 150)
  assert.ok(Math.abs(maxR - 40) < 0.05, `widest radius ${maxR}`)
  assert.ok(Math.abs(mesh.stats.width - 80) < 0.1)
})

test('a groove goes as deep as set and no deeper; outside its height band the wall is smooth', () => {
  const plain = buildVase({ profile: 'cylinder', diameter: 100, height: 100 })
  const mesh = buildVase({ profile: 'cylinder', diameter: 100, height: 100, layers: [newLayer('ribs', { count: 24, depth: -2, from: 40, to: 60, fade: 0 })] })
  let deepest = Infinity, outside = 0
  const S = mesh.stats.columns
  for (let v = 0; v < (mesh.stats.rows + 1) * S; v++) {
    const r = Math.hypot(mesh.positions[v * 3], mesh.positions[v * 3 + 1]), z = mesh.positions[v * 3 + 2]
    if (z < 39 || z > 61) outside = Math.max(outside, Math.abs(r - 50))
    deepest = Math.min(deepest, r)
  }
  assert.ok(Math.abs(deepest - 48) < 0.02, `deepest ${deepest}`)
  assert.ok(outside < 1e-3, `smooth outside the band, off by ${outside}`)
  assert.ok(plain.triangleCount < mesh.triangleCount)
})

test('a hollow vase keeps its wall: the inner wall stays the set distance inside the outer one', () => {
  const mesh = buildVase({ body: 'hollow', wall: 2, profile: 'belly', section: { type: 'polygon', sides: 6, round: 0 }, twist: 90 })
  assert.ok(mesh.grid.inner.thinnest >= 2 - 1e-6, `thinnest ${mesh.grid.inner.thinnest}`)
  assert.ok(mesh.stats.capacityMl > 100)
  const tube = buildVase({ body: 'hollow', wall: 2, bottom: 0 })
  assert.equal(tube.stats.capacityMl, 0)
})

test('the corners of a polygon lie on columns of the mesh, twisted or not', () => {
  const angles = columnAngles(96, [sectionFunction({ type: 'polygon', sides: 6, round: 0 })])
  for (let k = 0; k < 6; k++) assert.ok(angles.some((a) => Math.abs(a - (2 * Math.PI * k) / 6) < 1e-9), `corner ${k}`)
  for (let j = 1; j < angles.length; j++) assert.ok(angles[j] > angles[j - 1], 'ascending')
  // On a twisted hexagon the six corner columns reach the full radius at every height.
  const mesh = buildVase({ profile: 'cylinder', diameter: 100, section: { type: 'polygon', sides: 6, round: 0 }, twist: 300 })
  const S = mesh.stats.columns
  for (let i = 0; i <= mesh.stats.rows; i += 7) {
    let max = 0
    for (let j = 0; j < S; j++) max = Math.max(max, Math.hypot(mesh.positions[(i * S + j) * 3], mesh.positions[(i * S + j) * 3 + 1]))
    assert.ok(Math.abs(max - 50) < 1e-3, `row ${i}: ${max}`)
  }
})

test('patterns stay between 0 and 1 and close round the vase without a seam', () => {
  for (const pattern of PATTERNS) {
    if (pattern === 'image') continue
    const L = prepareLayer(newLayer(pattern))
    if (pattern === 'weave' && L.count % 2) L.count += 1
    const fn = PATTERN_FUNCTIONS[pattern]
    for (let k = 0; k < 400; k++) {
      const a = (k * 0.618) % L.count, b = k * 0.137
      const value = fn(a, b, L, a)
      assert.ok(value >= -1e-9 && value <= 1 + 1e-9, `${pattern} at ${a}, ${b}: ${value}`)
      assert.ok(Math.abs(value - fn(a + L.count, b, L, a + L.count)) < 1e-9, `${pattern}: the same one turn on`)
    }
  }
})

test('the budget is kept, and a draft is coarser than a fine vase', () => {
  const layers = [newLayer('honeycomb', { count: 40 })]
  const small = buildVase({ layers }, { budget: 50_000 })
  assert.ok(small.triangleCount <= 50_000 * 1.1, `triangles ${small.triangleCount}`)
  assert.ok(small.notes.some((note) => note.code === 'reduced'))
  const draft = buildVase({ layers, quality: 'draft' }), fine = buildVase({ layers, quality: 'fine' })
  assert.ok(draft.triangleCount < fine.triangleCount)
  assertClosed(small, 'within the budget')
})

test('printing notes: a form that widens too fast, a wall too thin, a pattern too fine', () => {
  const codes = (params) => buildVase(params).notes.map((note) => note.code)
  assert.ok(codes({ profile: 'custom', profilePoints: [[0, 0.2], [0.2, 1], [1, 1]], height: 100, diameter: 200 }).includes('overhang'))
  assert.ok(!codes({ profile: 'cylinder' }).includes('overhang'))
  assert.ok(codes({ body: 'hollow', wall: 0.5 }).includes('thinWall'))
  assert.ok(codes({ layers: [newLayer('ribs', { count: 400, width: 0.3 })] }).includes('tooFine'))
  assert.ok(codes({}).includes('vaseMode'))
  assert.ok(codes({ body: 'hollow', bottom: 0 }).includes('openBottom'))
})

test('settings from anywhere come out complete and within their limits', () => {
  const p = normalizeParams({ height: 1e9, diameter: 'x', profile: 'nope', section: { type: 'polygon', sides: 99 }, layers: [{ pattern: 'nope', depth: 99 }, null, 5], body: {} })
  assert.equal(p.height, 600)
  assert.equal(p.diameter, DEFAULTS.diameter)
  assert.equal(p.profile, 'bottle')
  assert.equal(p.section.sides, 24)
  assert.equal(p.layers.length, 3)
  assert.equal(p.layers[0].pattern, 'ribs')
  assert.equal(p.layers[0].depth, 8)
  assert.deepEqual(normalizeParams(p), p)
  assertClosed(buildVase(p), 'from anywhere')
})

test('the files: STL with every triangle, 3MF with every point once', async () => {
  const mesh = buildVase({ body: 'hollow', hole: 10, quality: 'draft' })
  const stl = toBinaryStl(mesh)
  assert.equal(stl.length, 84 + 50 * mesh.triangleCount)
  assert.equal(new DataView(stl.buffer).getUint32(80, true), mesh.triangleCount)
  const welded = weldedMesh(mesh)
  assert.ok(welded.vertices.length / 3 < mesh.vertexCount)
  const file = await to3mf(mesh)
  assert.equal(String.fromCharCode(file[0], file[1]), 'PK')
  assert.ok(file.length < stl.length / 2, '3MF is the smaller file')
})

test("Layerling's vase settings carry over, and what is not covered is named", () => {
  const { params, unsupported } = fromLayerling({ height: 180, diameter: 90, profile: 'bauchig', section: 'vieleck', polySides: 6, polyRound: 0.2, twist: 90, body: 'hohl', wall: 2, bottom: 2, effect: 'rillen', ribCount: 48, ribDepth: 1.6, grooveWidth: 0.55, ribShape: 'v', zoneFrom: 10, zoneTo: 90, zoneFade: 6, quality: 'fein', lidMode: 'schraube' })
  assert.equal(params.section.type, 'polygon')
  assert.equal(params.body, 'hollow')
  assert.equal(params.layers[0].pattern, 'ribs')
  assert.equal(params.layers[0].depth, -1.6)
  assert.equal(params.layers[0].profile, 'sharp')
  assert.equal(params.quality, 'fine')
  assert.deepEqual(unsupported, ['lidMode: schraube'])
  assertClosed(buildVase(params), 'from Layerling')
})

test('the sampler gives the wall without patterns', () => {
  const at = vaseSampler({ profile: 'cylinder', diameter: 100 })
  assert.ok(Math.abs(at(1.3, 50) - 50) < 1e-9)
})
