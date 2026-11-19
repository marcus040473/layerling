// Vasen-Generator 2: the core on a worker. The page builds the quick preview itself; the finished vase and the
// files are made here, so a fine vase with millions of triangles never holds the page up. The arrays are handed
// over, not copied.

import { buildVase } from './engine.mjs'
import { to3mf, toBinaryStl } from './export.mjs'

/** A mesh as it travels: arrays cut to their own buffers, and no functions. */
export function portableMesh(mesh) {
  return {
    positions: mesh.positions.slice(),
    normals: mesh.normals.slice(),
    indices: mesh.indices.slice(),
    vertexCount: mesh.vertexCount,
    triangleCount: mesh.triangleCount,
    lidStart: mesh.lidStart,
    weldStart: mesh.weldStart,
    weld: mesh.weld,
    flat: mesh.flat,
    stats: mesh.stats,
    notes: mesh.notes,
    ms: mesh.ms,
  }
}

export async function handle(message) {
  if (message.type === 'build') {
    const mesh = portableMesh(buildVase(message.params, { quality: message.quality }))
    return { result: { id: message.id, type: 'build', mesh }, transfer: [mesh.positions.buffer, mesh.normals.buffer, mesh.indices.buffer] }
  }
  if (message.type === 'export') {
    const mesh = buildVase(message.params, { quality: message.quality })
    const files = []
    for (const format of message.formats) {
      const bytes = format === '3mf' ? await to3mf(mesh, message.name) : toBinaryStl(mesh, message.name)
      files.push({ format, bytes })
    }
    return { result: { id: message.id, type: 'export', files, triangles: mesh.triangleCount }, transfer: files.map((file) => file.bytes.buffer) }
  }
  return { result: { id: message.id, type: 'error', error: 'unknown' }, transfer: [] }
}

if (typeof self !== 'undefined' && typeof window === 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = async (event) => {
    try {
      const { result, transfer } = await handle(event.data)
      self.postMessage(result, transfer)
    } catch (error) {
      self.postMessage({ id: event.data?.id, type: 'error', error: String(error?.message ?? error) })
    }
  }
}
