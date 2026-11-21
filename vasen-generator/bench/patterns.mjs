// What each pattern costs on the bottle of 90 x 180 mm, per quality: build time and triangles.
// Run: node vasen-generator/bench/patterns.mjs
import { buildVase } from '../src/engine.mjs'
import { PATTERNS, newLayer } from '../src/params.mjs'

const qualities = ['draft', 'standard', 'fine']
console.log('pattern'.padEnd(12), ...qualities.map((q) => q.padStart(22)))
for (const pattern of PATTERNS) {
  const layer = newLayer(pattern)
  if (pattern === 'image') {
    const w = 256, h = 256
    layer.image = { w, h, data: Float32Array.from({ length: w * h }, (_, i) => 0.5 + 0.5 * Math.sin((i % w) / 9) * Math.cos(Math.floor(i / w) / 7)) }
  }
  const cells = qualities.map((quality) => {
    const input = { layers: [layer], quality }
    buildVase(input)
    let ms = Infinity, mesh
    for (let k = 0; k < 4; k++) { const t = performance.now(); mesh = buildVase(input); ms = Math.min(ms, performance.now() - t) }
    return `${ms.toFixed(0).padStart(6)} ms ${String(mesh.triangleCount).padStart(9)}`
  })
  console.log(pattern.padEnd(12), ...cells.map((cell) => cell.padStart(22)))
}
