// The same vase from Layerling's present core and from this one: build time and size of the mesh.
// Run from the repository: node vasen-generator/bench/compare.mjs [path to vase-geometry.mjs]
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { buildVase } from '../src/engine.mjs'
import { fromLayerling } from '../src/from-layerling.mjs'

const oldPath = resolve(process.argv[2] ?? new URL('../../apps/web/src/lib/vase/vase-geometry.mjs', import.meta.url).pathname)
const old = await import(pathToFileURL(oldPath).href)

const cases = {
  'smooth bottle': { effect: 'keine' },
  'grooves, 48': { effect: 'rillen' },
  'grooves, fine, twisted 180': { effect: 'rillen', quality: 'fein', ribCount: 96, twist: 180 },
  'crossed stripes': { effect: 'streifen', stripeStyle: 'doppelt', stripeTurn: 360, stripeCount: 24 },
  'voronoi': { effect: 'voronoi' },
  'voronoi, fine': { effect: 'voronoi', quality: 'fein' },
  'hexagon to wave, twisted': { section: 'vieleck', polySides: 6, section2: 'welle', section2Waves: 12, twist: 90, effect: 'keine' },
  'hollow, grooves': { body: 'hohl', effect: 'rillen' },
  'facets': { effect: 'lowpoly' },
  '300 x 400 mm, voronoi, fine': { effect: 'voronoi', quality: 'fein', height: 400, diameter: 300 },
}

function best(run) {
  run()
  let ms = Infinity, out
  for (let k = 0; k < 5; k++) { const t = performance.now(); out = run(); ms = Math.min(ms, performance.now() - t) }
  return [ms, out]
}

console.log('vase'.padEnd(30), 'old core'.padStart(22), 'new core'.padStart(22), '  faster')
for (const [name, over] of Object.entries(cases)) {
  const settings = old.normalizeParams({ height: 180, diameter: 90, ...over })
  const [oldMs, oldMesh] = best(() => old.buildVase(settings))
  const { params, unsupported } = fromLayerling(settings)
  const [newMs, newMesh] = best(() => buildVase(params, { normalized: true }))
  const cell = (ms, tris) => `${ms.toFixed(1).padStart(8)} ms ${String(tris).padStart(9)}`
  console.log(name.padEnd(30), cell(oldMs, oldMesh.triangleCount), cell(newMs, newMesh.triangleCount), `${(oldMs / newMs).toFixed(1).padStart(7)}x`, unsupported.length ? `(not carried over: ${unsupported.join(', ')})` : '')
}
