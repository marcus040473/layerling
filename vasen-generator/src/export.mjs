// Vasen-Generator 2: files for the slicer. Binary STL straight from the typed arrays, and 3MF (every point
// once, compressed) which comes out several times smaller for the same mesh.

/** Binary STL, z up, millimetres. 50 bytes per triangle. */
export function toBinaryStl(mesh, name = 'Vase') {
  const { positions: P, indices: I } = mesh
  const count = I.length / 3
  const bytes = new Uint8Array(84 + count * 50)
  const view = new DataView(bytes.buffer)
  const header = `Vasen-Generator: ${name}`.slice(0, 79)
  for (let i = 0; i < header.length; i++) bytes[i] = header.charCodeAt(i) & 0x7f
  view.setUint32(80, count, true)
  let o = 84
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3
    const ax = P[a], ay = P[a + 1], az = P[a + 2]
    const ux = P[b] - ax, uy = P[b + 1] - ay, uz = P[b + 2] - az
    const vx = P[c] - ax, vy = P[c + 1] - ay, vz = P[c + 2] - az
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
    view.setFloat32(o, nx / len, true); view.setFloat32(o + 4, ny / len, true); view.setFloat32(o + 8, nz / len, true)
    view.setFloat32(o + 12, ax, true); view.setFloat32(o + 16, ay, true); view.setFloat32(o + 20, az, true)
    view.setFloat32(o + 24, P[b], true); view.setFloat32(o + 28, P[b + 1], true); view.setFloat32(o + 32, P[b + 2], true)
    view.setFloat32(o + 36, P[c], true); view.setFloat32(o + 40, P[c + 1], true); view.setFloat32(o + 44, P[c + 2], true)
    o += 50
  }
  return bytes
}

/**
 * The mesh with every point once: the copies made for shading (flat rim, bottom, floor) fall back onto the
 * points they stand on, so the result is one closed body by its numbers, not only by its coordinates.
 */
export function weldedMesh(mesh) {
  const { positions, indices, weldStart, weld, vertexCount } = mesh
  // Points no triangle uses (inside the simplified plain parts of a wall) are left out.
  const used = new Uint8Array(vertexCount)
  for (let i = 0; i < indices.length; i++) used[indices[i]] = 1
  const target = new Uint32Array(vertexCount)
  const source = []
  let next = 0
  for (let v = 0; v < vertexCount; v++) {
    const on = v >= weldStart ? weld[v - weldStart] : -1
    if (on >= 0) { target[v] = target[on]; continue }
    if (!used[v] && v < weldStart) continue
    target[v] = next++
    source.push(v)
  }
  // A copy whose own point no triangle uses directly still stands on that point: it must be there.
  for (let v = weldStart; v < vertexCount; v++) {
    const on = weld[v - weldStart]
    if (on >= 0 && used[v] && !used[on] && on < weldStart) throw new Error('a rim point is missing from the wall')
  }
  const vertices = new Float32Array(next * 3)
  for (let k = 0; k < next; k++) {
    const v = source[k] * 3
    vertices[k * 3] = positions[v]; vertices[k * 3 + 1] = positions[v + 1]; vertices[k * 3 + 2] = positions[v + 2]
  }
  const triangles = new Uint32Array(indices.length)
  for (let i = 0; i < indices.length; i++) triangles[i] = target[indices[i]]
  return { vertices, triangles }
}

let crcTable = null
function crc32(bytes, crc = 0) {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let c = ~crc >>> 0
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return ~c >>> 0
}

async function deflate(bytes) {
  if (typeof CompressionStream === 'undefined') return null
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** A ZIP of the files [{ name, bytes }], compressed where the browser can. */
export async function zip(files) {
  const encoder = new TextEncoder()
  const parts = [], central = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const packed = await deflate(file.bytes)
    const data = packed && packed.length < file.bytes.length ? packed : file.bytes
    const method = data === file.bytes ? 0 : 8
    const crc = crc32(file.bytes)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(8, method, true)
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, file.bytes.length, true)
    local.setUint16(26, name.length, true)
    const entry = new DataView(new ArrayBuffer(46))
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(10, method, true)
    entry.setUint32(16, crc, true); entry.setUint32(20, data.length, true); entry.setUint32(24, file.bytes.length, true)
    entry.setUint16(28, name.length, true); entry.setUint32(42, offset, true)
    parts.push(new Uint8Array(local.buffer), name, data)
    central.push(new Uint8Array(entry.buffer), name)
    offset += 30 + name.length + data.length
  }
  const size = central.reduce((sum, part) => sum + part.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true)
  end.setUint32(12, size, true); end.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of all) { out.set(part, at); at += part.length }
  return out
}

/** 3MF: one object, millimetres. The model text is written in pieces, so a large vase needs no giant string. */
export async function to3mf(mesh, name = 'Vase') {
  const { vertices, triangles } = weldedMesh(mesh)
  const encoder = new TextEncoder()
  const chunks = []
  let text = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n<metadata name="Title">${name.replace(/[<>&"]/g, '')}</metadata>\n<metadata name="Application">Vasen-Generator</metadata>\n<resources>\n<object id="1" type="model">\n<mesh>\n<vertices>\n`
  const flush = () => { chunks.push(encoder.encode(text)); text = '' }
  const number = (v) => (Math.round(v * 10000) / 10000).toString()
  for (let v = 0; v < vertices.length; v += 3) {
    text += `<vertex x="${number(vertices[v])}" y="${number(vertices[v + 1])}" z="${number(vertices[v + 2])}"/>\n`
    if (text.length > 1 << 20) flush()
  }
  text += '</vertices>\n<triangles>\n'
  for (let t = 0; t < triangles.length; t += 3) {
    text += `<triangle v1="${triangles[t]}" v2="${triangles[t + 1]}" v3="${triangles[t + 2]}"/>\n`
    if (text.length > 1 << 20) flush()
  }
  text += '</triangles>\n</mesh>\n</object>\n</resources>\n<build>\n<item objectid="1"/>\n</build>\n</model>\n'
  flush()
  const model = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let at = 0
  for (const chunk of chunks) { model.set(chunk, at); at += chunk.length }
  return zip([
    { name: '[Content_Types].xml', bytes: encoder.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>') },
    { name: '_rels/.rels', bytes: encoder.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>') },
    { name: '3D/3dmodel.model', bytes: model },
  ])
}
