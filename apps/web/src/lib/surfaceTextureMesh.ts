/**
 * Mesh work for the surface texture (surfaceTexture.ts): welding a triangle
 * soup into a closed indexed mesh, refining it until it is fine enough for a
 * pattern, cutting it along levels of a field, and tidying it up after the
 * points were moved.
 *
 * Every step keeps a closed mesh closed: a point made on an edge is shared by
 * both triangles of that edge, and winding is kept. Each triangle remembers
 * the triangle of the mesh it came from (`parents`), so what was decided per
 * input triangle (a smooth bottom, say) still holds after refining.
 *
 * Coordinates are millimetres, z up (the editor's screen frame, see
 * displayAxes.ts); surfaceTexture.ts turns the editor's inside frame into it.
 */

/** Triangles with less area (mm²) are dropped: every slicer deletes them, and each deleted one tears a hole. */
export const SURFACE_MIN_AREA = 1e-12;
/** Edges shorter than this (mm) are pulled together before output, far below any print resolution. */
export const SURFACE_MIN_EDGE = 0.02;

export type SurfaceMesh = {
  vertices: Float64Array;
  indices: Uint32Array;
  /** For each triangle, the triangle of the mesh it was made from. */
  parents: Uint32Array;
  /** The triangle budget stopped the refining before it was done. */
  limited?: boolean;
};

export type SurfaceBase = {
  vertices: Float64Array;
  indices: Uint32Array;
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
  /** Surface area in mm². */
  area: number;
  /** What was dropped while welding: not a number, no area, and gaps at T-joints that were closed. */
  removed: { invalid: number; degenerate: number; tJoints: number };
};

/** A field of numbers per point and how much it changes from point i to point j (unwrapped across a seam). */
export type FieldDiff = (i: number, j: number) => number;

const SHIFT = 2 ** 26;

export function faceCross(v: ArrayLike<number>, a: number, b: number, c: number): [number, number, number] {
  const ax = v[a * 3], ay = v[a * 3 + 1], az = v[a * 3 + 2];
  const ux = v[b * 3] - ax, uy = v[b * 3 + 1] - ay, uz = v[b * 3 + 2] - az;
  const wx = v[c * 3] - ax, wy = v[c * 3 + 1] - ay, wz = v[c * 3 + 2] - az;
  return [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
}

function edgeKey(a: number, b: number) {
  return a < b ? a * SHIFT + b : b * SHIFT + a;
}

/**
 * Edges (two point numbers, in either order) to whole numbers, in typed arrays with open
 * addressing. A Map keyed by `a * 2^26 + b` boxes every key beyond 31 bits; on a mesh of a million
 * triangles that cost seconds and most of the garbage collection.
 */
export class EdgeTable {
  private keysA: Int32Array;
  private keysB: Int32Array;
  private values: Int32Array;
  private mask: number;
  size = 0;

  constructor(expected = 16) {
    let capacity = 16;
    while (capacity < expected * 2) capacity *= 2;
    this.keysA = new Int32Array(capacity).fill(-1);
    this.keysB = new Int32Array(capacity);
    this.values = new Int32Array(capacity);
    this.mask = capacity - 1;
  }

  private slot(a: number, b: number) {
    let h = Math.imul(a, 0x9e3779b1) ^ Math.imul(b + 0x7f4a7c15, 0x85ebca77);
    h = (h ^ (h >>> 15)) & this.mask;
    while (this.keysA[h] !== -1 && (this.keysA[h] !== a || this.keysB[h] !== b)) h = (h + 1) & this.mask;
    return h;
  }

  /** The number for edge p-q, or `missing` when it has none. */
  get(p: number, q: number, missing = -1) {
    const h = p < q ? this.slot(p, q) : this.slot(q, p);
    return this.keysA[h] === -1 ? missing : this.values[h];
  }

  has(p: number, q: number) {
    return this.keysA[p < q ? this.slot(p, q) : this.slot(q, p)] !== -1;
  }

  set(p: number, q: number, value: number) {
    const [a, b] = p < q ? [p, q] : [q, p];
    let h = this.slot(a, b);
    if (this.keysA[h] === -1) {
      if ((this.size + 1) * 2 > this.keysA.length) {
        this.grow();
        h = this.slot(a, b);
      }
      this.keysA[h] = a;
      this.keysB[h] = b;
      this.size += 1;
    }
    this.values[h] = value;
  }

  private grow() {
    const { keysA, keysB, values } = this;
    this.keysA = new Int32Array(keysA.length * 2).fill(-1);
    this.keysB = new Int32Array(keysA.length * 2);
    this.values = new Int32Array(keysA.length * 2);
    this.mask = keysA.length * 2 - 1;
    for (let i = 0; i < keysA.length; i += 1) {
      if (keysA[i] === -1) continue;
      const h = this.slot(keysA[i], keysB[i]);
      this.keysA[h] = keysA[i];
      this.keysB[h] = keysB[i];
      this.values[h] = values[i];
    }
  }
}

/**
 * Drop triangles that cannot be worked on before anything is computed: coordinates that are not
 * finite (they would spoil size, axis and bottom) and triangles without area.
 */
function cleanSoup(soup: ArrayLike<number>) {
  const count = Math.floor(soup.length / 9);
  const keep = new Uint8Array(count);
  let invalid = 0;
  let degenerate = 0;
  for (let t = 0; t < count; t += 1) {
    const i = t * 9;
    let finite = true;
    for (let k = 0; k < 9; k += 1) if (!Number.isFinite(soup[i + k])) finite = false;
    if (!finite) {
      invalid += 1;
      continue;
    }
    const ux = soup[i + 3] - soup[i], uy = soup[i + 4] - soup[i + 1], uz = soup[i + 5] - soup[i + 2];
    const wx = soup[i + 6] - soup[i], wy = soup[i + 7] - soup[i + 1], wz = soup[i + 8] - soup[i + 2];
    const area = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
    if (!(area >= SURFACE_MIN_AREA)) {
      degenerate += 1;
      continue;
    }
    keep[t] = 1;
  }
  const out = new Float64Array((count - invalid - degenerate) * 9);
  for (let t = 0, o = 0; t < count; t += 1) {
    if (!keep[t]) continue;
    for (let k = 0; k < 9; k += 1) out[o++] = soup[t * 9 + k];
  }
  return { soup: out, invalid, degenerate };
}

/** Points closer than 1/10000 mm become one; triangles that collapse to a line on the way are dropped. */
function weld(soup: Float64Array) {
  const map = new Map<string, number>();
  const verts: number[] = [];
  const idx: number[] = [];
  const key = (x: number, y: number, z: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
  for (let i = 0; i < soup.length; i += 9) {
    const tri: number[] = [];
    for (let k = 0; k < 9; k += 3) {
      const x = soup[i + k], y = soup[i + k + 1], z = soup[i + k + 2];
      const kk = key(x, y, z);
      let id = map.get(kk);
      if (id === undefined) {
        id = verts.length / 3;
        verts.push(x, y, z);
        map.set(kk, id);
      }
      tri.push(id);
    }
    if (tri[0] !== tri[1] && tri[1] !== tri[2] && tri[0] !== tri[2]) idx.push(tri[0], tri[1], tri[2]);
  }
  return { vertices: Float64Array.from(verts), indices: Uint32Array.from(idx), dropped: soup.length / 9 - idx.length / 3 };
}

/**
 * Close T-joints: where an open point lies in the middle of an open edge (the neighbour is split
 * finer there), the triangle at that edge is split at those points, fanned from the opposite
 * corner, winding kept. Up to `passes` rounds for chains. A closed mesh costs one pass over its
 * edges. Returns the new indices and how many points were taken in.
 */
export function closeTJunctions(v: Float64Array, indices: Uint32Array, passes = 8) {
  let I = indices;
  let closed = 0;
  // Quick test with sorted edges instead of a set: every edge exactly twice - nothing to do.
  {
    const keys = new Float64Array(I.length);
    for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k += 1) keys[t + k] = edgeKey(I[t + k], I[t + ((k + 1) % 3)]);
    keys.sort();
    let ok = keys.length % 2 === 0;
    for (let i = 0; ok && i < keys.length; i += 2) ok = keys[i] === keys[i + 1] && (i + 2 >= keys.length || keys[i + 2] !== keys[i]);
    if (ok) return { indices: I, closed };
  }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < v.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      lo[k] = Math.min(lo[k], v[i + k]);
      hi[k] = Math.max(hi[k], v[i + k]);
    }
  }
  const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  // Distance from the edge: just above the welding grid (1e-4 mm), growing with the size.
  const tol = Math.max(1e-3, diag * 1e-6);
  for (let pass = 0; pass < passes; pass += 1) {
    const half = new Set<number>();
    for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k += 1) half.add(I[t + k] * SHIFT + I[t + ((k + 1) % 3)]);
    const open: number[] = [];
    const onRim = new Set<number>();
    for (let t = 0; t < I.length; t += 3) {
      for (let k = 0; k < 3; k += 1) {
        const a = I[t + k], b = I[t + ((k + 1) % 3)];
        if (half.has(b * SHIFT + a)) continue;
        open.push(t / 3, k);
        onRim.add(a);
        onRim.add(b);
      }
    }
    if (open.length === 0) break;
    // Open points into a grid (cell about the mean open edge), then for each open edge the cells of its box.
    let sum = 0;
    for (let e = 0; e < open.length; e += 2) {
      const t = open[e] * 3, k = open[e + 1];
      const a = I[t + k], b = I[t + ((k + 1) % 3)];
      sum += Math.hypot(v[b * 3] - v[a * 3], v[b * 3 + 1] - v[a * 3 + 1], v[b * 3 + 2] - v[a * 3 + 2]);
    }
    const cell = Math.max(sum / (open.length / 2), tol * 10);
    const grid = new Map<string, number[]>();
    const cellKey = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    onRim.forEach((p) => {
      const key = cellKey(v[p * 3], v[p * 3 + 1], v[p * 3 + 2]);
      const list = grid.get(key);
      if (list) list.push(p);
      else grid.set(key, [p]);
    });
    const splits = new Map<number, { k: number; pts: { t: number; p: number }[] }>();
    for (let e = 0; e < open.length; e += 2) {
      const f = open[e], k = open[e + 1];
      const a = I[f * 3 + k], b = I[f * 3 + ((k + 1) % 3)];
      const ax = v[a * 3], ay = v[a * 3 + 1], az = v[a * 3 + 2];
      const dx = v[b * 3] - ax, dy = v[b * 3 + 1] - ay, dz = v[b * 3 + 2] - az;
      const L2 = dx * dx + dy * dy + dz * dz;
      if (L2 === 0) continue;
      const c0 = [Math.floor((Math.min(ax, ax + dx) - tol) / cell), Math.floor((Math.min(ay, ay + dy) - tol) / cell), Math.floor((Math.min(az, az + dz) - tol) / cell)];
      const c1 = [Math.floor((Math.max(ax, ax + dx) + tol) / cell), Math.floor((Math.max(ay, ay + dy) + tol) / cell), Math.floor((Math.max(az, az + dz) + tol) / cell)];
      // A very long edge through many cells: then rather test all open points.
      const cells = (c1[0] - c0[0] + 1) * (c1[1] - c0[1] + 1) * (c1[2] - c0[2] + 1);
      const candidates: number[] = [];
      if (cells > onRim.size) onRim.forEach((p) => candidates.push(p));
      else {
        for (let x = c0[0]; x <= c1[0]; x += 1) for (let y = c0[1]; y <= c1[1]; y += 1) for (let z = c0[2]; z <= c1[2]; z += 1) {
          const list = grid.get(`${x},${y},${z}`);
          if (list) candidates.push(...list);
        }
      }
      const pts: { t: number; p: number }[] = [];
      const L = Math.sqrt(L2);
      for (const p of candidates) {
        if (p === a || p === b) continue;
        const px = v[p * 3] - ax, py = v[p * 3 + 1] - ay, pz = v[p * 3 + 2] - az;
        const t = (px * dx + py * dy + pz * dz) / L2;
        if (t * L <= tol || (1 - t) * L <= tol) continue;
        const qx = px - t * dx, qy = py - t * dy, qz = pz - t * dz;
        if (qx * qx + qy * qy + qz * qz > tol * tol) continue;
        pts.push({ t, p });
      }
      if (pts.length === 0 || splits.has(f)) continue;
      pts.sort((u, w) => u.t - w.t);
      splits.set(f, { k, pts });
    }
    if (splits.size === 0) break;
    const out: number[] = [];
    for (let f = 0; f < I.length / 3; f += 1) {
      const s = splits.get(f);
      if (!s) {
        out.push(I[f * 3], I[f * 3 + 1], I[f * 3 + 2]);
        continue;
      }
      const a = I[f * 3 + s.k], b = I[f * 3 + ((s.k + 1) % 3)], c = I[f * 3 + ((s.k + 2) % 3)];
      const chain = [a, ...s.pts.map((q) => q.p), b];
      for (let q = 0; q + 1 < chain.length; q += 1) out.push(chain[q], chain[q + 1], c);
      closed += s.pts.length;
    }
    I = Uint32Array.from(out);
  }
  return { indices: I, closed };
}

/** A triangle soup (nine numbers per triangle) cleaned, welded and measured. Throws when nothing usable is left. */
export function prepareSurfaceBase(soup: ArrayLike<number>): SurfaceBase {
  const cleaned = cleanSoup(soup);
  if (cleaned.soup.length === 0) throw new Error("The body has no usable triangles");
  const welded = weld(cleaned.soup);
  if (welded.indices.length === 0) throw new Error("The body has no usable triangles");
  const tj = closeTJunctions(welded.vertices, welded.indices);
  const v = welded.vertices;
  const I = tj.indices;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < v.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k], v[i + k]);
      max[k] = Math.max(max[k], v[i + k]);
    }
  }
  let area = 0;
  for (let t = 0; t < I.length; t += 3) area += Math.hypot(...faceCross(v, I[t], I[t + 1], I[t + 2])) / 2;
  return {
    vertices: v,
    indices: I,
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    area,
    removed: { invalid: cleaned.invalid, degenerate: cleaned.degenerate + welded.dropped, tJoints: tj.closed },
  };
}

/** The base as a mesh whose triangles are their own parents. */
export function baseMesh(base: SurfaceBase): SurfaceMesh {
  return { vertices: base.vertices, indices: base.indices, parents: Uint32Array.from({ length: base.indices.length / 3 }, (_, i) => i) };
}

/**
 * Split every edge longer than `maxEdge` in its middle, until none is too long or the triangle
 * budget would be passed. Both triangles of an edge share the middle point. Edges at a point in
 * `smooth` (it surely stays smooth) are not split. With `flags`, only edges at flagged points are
 * split (refining where a pattern fades in, or at its flanks); new points are not flagged, so the
 * refining closes in on the place rather than spreading. With `edgeFilter`, only the edges it picks.
 */
export function subdivide(
  mesh: { vertices: Float64Array; indices: Uint32Array },
  maxEdge: number,
  maxTriangles: number,
  smoothPoints: Uint8Array | null = null,
  flags: Uint8Array | null = null,
  /** Only edges this says yes to are split (cracks: the band round the lines); it gets the points as they grow. */
  edgeFilter: ((vertices: ArrayLike<number>, a: number, b: number) => boolean) | null = null,
) {
  const verts = Array.from(mesh.vertices);
  const flagList = flags ? Array.from(flags) : null;
  const smooth = smoothPoints ? Array.from(smoothPoints) : null;
  let tris = mesh.indices;
  let parents = Uint32Array.from({ length: tris.length / 3 }, (_, i) => i);
  const L2 = maxEdge * maxEdge;
  let limited = false;
  const long = (a: number, b: number) => {
    const dx = verts[a * 3] - verts[b * 3], dy = verts[a * 3 + 1] - verts[b * 3 + 1], dz = verts[a * 3 + 2] - verts[b * 3 + 2];
    const tooLong = dx * dx + dy * dy + dz * dz > L2;
    if (edgeFilter !== null) return tooLong && edgeFilter(verts, a, b);
    if (flagList !== null) return tooLong && (flagList[a] === 1 || flagList[b] === 1);
    // One end surely smooth (inner wall, bottom): the edge only lies in smooth faces and needs no grid there.
    // (Both ends only was not enough: an edge that is never split pulled its neighbour towards it forever.)
    if (smooth !== null && (smooth[a] === 1 || smooth[b] === 1)) return false;
    return tooLong;
  };
  for (let pass = 0; pass < 40; pass += 1) {
    const marks = new Uint8Array(tris.length / 3);
    let next = 0;
    for (let t = 0, f = 0; t < tris.length; t += 3, f += 1) {
      const a = tris[t], b = tris[t + 1], c = tris[t + 2];
      const m = (long(a, b) ? 1 : 0) | (long(b, c) ? 2 : 0) | (long(c, a) ? 4 : 0);
      marks[f] = m;
      next += 1 + ((m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1));
    }
    if (next === tris.length / 3) break;
    if (next > maxTriangles) {
      limited = true;
      break;
    }
    const mids = new EdgeTable(next - tris.length / 3);
    const mid = (a: number, b: number) => {
      let id = mids.get(a, b);
      if (id < 0) {
        id = verts.length / 3;
        verts.push((verts[a * 3] + verts[b * 3]) / 2, (verts[a * 3 + 1] + verts[b * 3 + 1]) / 2, (verts[a * 3 + 2] + verts[b * 3 + 2]) / 2);
        if (flagList !== null) flagList.push(0);
        if (smooth !== null) smooth.push(0);
        mids.set(a, b, id);
      }
      return id;
    };
    const len2 = (a: number, b: number) => {
      const dx = verts[a * 3] - verts[b * 3], dy = verts[a * 3 + 1] - verts[b * 3 + 1], dz = verts[a * 3 + 2] - verts[b * 3 + 2];
      return dx * dx + dy * dy + dz * dz;
    };
    const out = new Uint32Array(next * 3);
    const outParents = new Uint32Array(next);
    let o = 0;
    let parent = 0;
    const put = (a: number, b: number, c: number) => {
      outParents[o / 3] = parent;
      out[o++] = a;
      out[o++] = b;
      out[o++] = c;
    };
    for (let t = 0, f = 0; t < tris.length; t += 3, f += 1) {
      parent = parents[f];
      let a = tris[t], b = tris[t + 1], c = tris[t + 2];
      let m = marks[f];
      const n = (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
      if (n === 0) {
        put(a, b, c);
        continue;
      }
      if (n === 3) {
        const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
        put(a, ab, ca);
        put(ab, b, bc);
        put(ca, bc, c);
        put(ab, bc, ca);
        continue;
      }
      // Turn until the marks lie canonically: one edge a-b, two edges a-b and b-c.
      for (let r = 0; r < 3; r += 1) {
        if ((n === 1 && m === 1) || (n === 2 && m === 3)) break;
        [a, b, c] = [b, c, a];
        m = ((m >> 1) | ((m & 1) << 2)) & 7;
      }
      if (n === 1) {
        const ab = mid(a, b);
        put(a, ab, c);
        put(ab, b, c);
      } else {
        const ab = mid(a, b), bc = mid(b, c);
        put(ab, b, bc);
        if (len2(a, bc) < len2(ab, c)) {
          put(a, ab, bc);
          put(a, bc, c);
        } else {
          put(a, ab, c);
          put(ab, bc, c);
        }
      }
    }
    tris = out;
    parents = outParents;
  }
  return { vertices: Float64Array.from(verts), indices: tris, parents, limited };
}

/**
 * Cut the triangles marked in `sliced` along the levels `m * P + offset` of a field (one value
 * per point, `diff` its change from one point to another), so that every level becomes a line of
 * points in the mesh. Triangles not cut take in the points on the edges they share with cut ones
 * (fans), so the mesh stays closed. With `ydiff` (the field along the levels), two cut triangles
 * that meet over their longest edge and make a flat convex quad are cut as that quad: otherwise
 * its diagonal would cut every strip once more. Parents point into `mesh.parents`.
 */
export function sliceByField(mesh: SurfaceMesh, field: Float64Array, diff: FieldDiff, P: number, offsets: number[], sliced: Uint8Array, ydiff: FieldDiff | null = null): SurfaceMesh {
  const verts = Array.from(mesh.vertices);
  const I = mesh.indices;
  const parents = mesh.parents;
  const T = I.length / 3;
  const len2 = (p: number, q: number) => {
    const dx = verts[p * 3] - verts[q * 3], dy = verts[p * 3 + 1] - verts[q * 3 + 1], dz = verts[p * 3 + 2] - verts[q * 3 + 2];
    return dx * dx + dy * dy + dz * dz;
  };
  const pairOf = new Int32Array(T).fill(-1);
  const quads: { ring: number[]; f: number; g: number }[] = [];
  if (ydiff) {
    const longestOf = (f: number) => {
      const a = I[f * 3], b = I[f * 3 + 1], c = I[f * 3 + 2];
      const ab = len2(a, b), bc = len2(b, c), ca = len2(c, a);
      const [p, q, r] = ab >= bc && ab >= ca ? [a, b, c] : bc >= ca ? [b, c, a] : [c, a, b];
      return { key: edgeKey(p, q), p, q, r };
    };
    const byEdge = new Map<number, number[]>();
    for (let f = 0; f < T; f += 1) {
      if (!sliced[f]) continue;
      const { key } = longestOf(f);
      const list = byEdge.get(key);
      if (list) list.push(f);
      else byEdge.set(key, [f]);
    }
    byEdge.forEach((list) => {
      if (list.length !== 2) return;
      const [f, g] = list;
      if (pairOf[f] >= 0 || pairOf[g] >= 0) return;
      const F = longestOf(f), G = longestOf(g);
      // The quad in the order of f: p, s (tip of g), q, r (tip of f); convex in (across, along)?
      const ring = [F.p, G.r, F.q, F.r];
      const xs = ring.map((i) => diff(F.p, i)), ys = ring.map((i) => ydiff(F.p, i));
      let sign = 0;
      let convex = true;
      for (let k = 0; k < 4 && convex; k += 1) {
        const a = k, b = (k + 1) % 4, c = (k + 2) % 4;
        const z = (xs[b] - xs[a]) * (ys[c] - ys[b]) - (ys[b] - ys[a]) * (xs[c] - xs[b]);
        if (Math.abs(z) < 1e-12) convex = false;
        else if (sign === 0) sign = Math.sign(z);
        else if (Math.sign(z) !== sign) convex = false;
      }
      if (!convex) return;
      // Nearly flat only (fold under 15 degrees): across a fold (where a handle starts) the sweep turned single triangles over.
      const n1 = faceCross(verts, I[f * 3], I[f * 3 + 1], I[f * 3 + 2]), n2 = faceCross(verts, I[g * 3], I[g * 3 + 1], I[g * 3 + 2]);
      const l1 = Math.hypot(...n1), l2 = Math.hypot(...n2);
      if (l1 === 0 || l2 === 0 || (n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]) / (l1 * l2) < 0.99985) return;
      pairOf[f] = g;
      pairOf[g] = f;
      quads.push({ ring, f, g });
    });
  }
  // Points on an edge (canonical p < q): the levels between its ends, as the share t from p to q. Both triangles of the edge get the same points.
  const edgePts = new EdgeTable(T * 2);
  const lists: { t: number; id: number }[][] = [];
  const eps = Math.min(SURFACE_MIN_EDGE, P / 4);
  const pointsOn = (p: number, q: number) => {
    const known = edgePts.get(p, q);
    if (known >= 0) return lists[known];
    const list: { t: number; id: number }[] = [];
    const d = diff(p, q);
    if (Math.abs(d) > eps) {
      const x0 = field[p], x1 = x0 + d;
      const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
      for (let m = Math.floor(lo / P) - 1; m <= Math.ceil(hi / P) + 1; m += 1) {
        for (const o of offsets) {
          const g = m * P + o;
          // No point closer than eps (in the field) to an end: the end then counts as on the level - the same for every edge
          // at it, so the mesh stays closed, and no triangles without area are made that slicers tear open when they merge.
          if (g <= lo + eps || g >= hi - eps) continue;
          const t = (g - x0) / d;
          const id = verts.length / 3;
          verts.push(verts[p * 3] + t * (verts[q * 3] - verts[p * 3]), verts[p * 3 + 1] + t * (verts[q * 3 + 1] - verts[p * 3 + 1]), verts[p * 3 + 2] + t * (verts[q * 3 + 2] - verts[p * 3 + 2]));
          list.push({ t, id });
        }
      }
      list.sort((u, w) => u.t - w.t);
    }
    edgePts.set(p, q, lists.length);
    lists.push(list);
    return list;
  };
  /** Points from p to q with their field value in the triangle (xp, xq: its values at the ends). */
  const pts = (p: number, xp: number, q: number, xq: number) => {
    const canon = p < q;
    const list = (canon ? pointsOn(p, q) : pointsOn(q, p)).map((e) => ({ id: e.id, x: canon ? xp + e.t * (xq - xp) : xq + e.t * (xp - xq) }));
    return canon ? list : list.reverse();
  };
  const active = new EdgeTable(T * 2);
  for (let f = 0; f < T; f += 1) {
    if (!sliced[f]) continue;
    for (let k = 0; k < 3; k += 1) active.set(I[f * 3 + k], I[f * 3 + ((k + 1) % 3)], 1);
  }
  const isActive = (p: number, q: number) => active.has(p, q);
  const out: number[] = [];
  const outParents: number[] = [];
  const emit = (p: number, q: number, r: number, nx: number, ny: number, nz: number, parent: number) => {
    const [x, y, z] = faceCross(verts, p, q, r);
    if (x * nx + y * ny + z * nz < 0) out.push(p, r, q);
    else out.push(p, q, r);
    outParents.push(parent);
  };
  const collinear = (a: number, b: number, c: number) => {
    const ux = verts[b * 3] - verts[a * 3], uy = verts[b * 3 + 1] - verts[a * 3 + 1], uz = verts[b * 3 + 2] - verts[a * 3 + 2];
    const wx = verts[c * 3] - verts[a * 3], wy = verts[c * 3 + 1] - verts[a * 3 + 1], wz = verts[c * 3 + 2] - verts[a * 3 + 2];
    const cross = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    return cross <= 1e-6 * Math.hypot(ux, uy, uz) * Math.hypot(wx, wy, wz);
  };
  /**
   * Sweep a convex polygon (corners `ring`, field values `xs` relative) into strips: two chains
   * monotone in the field from the lowest to the highest corner, forwards and backwards along the
   * rim, with the points on the edges; between two values a strip of two triangles is made.
   */
  const sweep = (ring: number[], xs: number[], nx: number, ny: number, nz: number, parent: number) => {
    const m = ring.length;
    let iLo = 0, iHi = 0;
    for (let k = 1; k < m; k += 1) {
      if (xs[k] < xs[iLo]) iLo = k;
      if (xs[k] > xs[iHi]) iHi = k;
    }
    if (iLo === iHi) {
      for (let k = 1; k < m - 1; k += 1) emit(ring[0], ring[k], ring[k + 1], nx, ny, nz, parent);
      return;
    }
    const chain = (dir: number) => {
      const list: { id: number; x: number }[] = [];
      let k = iLo;
      while (k !== iHi) {
        const nk = (k + dir + m) % m;
        list.push(...pts(ring[k], xs[k], ring[nk], xs[nk]));
        if (nk !== iHi) list.push({ id: ring[nk], x: xs[nk] });
        k = nk;
      }
      return list;
    };
    const chain1 = chain(1), chain2 = chain(-1);
    const start = ring[iLo];
    let l1 = start, l2 = start, i = 0, j = 0;
    // A chain that runs over several cuts of its first edge before the other has left the start: start and those
    // points lie on a line. They are gathered (`run`) and joined to the next point off the line as a fan.
    let run: number[] | null = null;
    while (i < chain1.length || j < chain2.length) {
      const first = j >= chain2.length || (i < chain1.length && chain1[i].x <= chain2[j].x);
      const pt = first ? chain1[i++] : chain2[j++];
      if (l1 !== l2) {
        if (run) {
          if (collinear(run[0], run[run.length - 1], pt.id)) run.push(pt.id);
          else {
            for (let k = 0; k + 1 < run.length; k += 1) emit(run[k], run[k + 1], pt.id, nx, ny, nz, parent);
            run = null;
          }
        } else if (collinear(l1, l2, pt.id)) run = [start, l1 === start ? l2 : l1, pt.id];
        else emit(l1, l2, pt.id, nx, ny, nz, parent);
      }
      if (first) l1 = pt.id;
      else l2 = pt.id;
    }
    if (run) for (let k = 0; k + 1 < run.length; k += 1) emit(run[k], run[k + 1], ring[iHi], nx, ny, nz, parent);
    else if (l1 !== l2) emit(l1, l2, ring[iHi], nx, ny, nz, parent);
  };
  for (const { ring, f, g } of quads) {
    const n1 = faceCross(verts, I[f * 3], I[f * 3 + 1], I[f * 3 + 2]), n2 = faceCross(verts, I[g * 3], I[g * 3 + 1], I[g * 3 + 2]);
    sweep(ring, ring.map((i) => diff(ring[0], i)), n1[0] + n2[0], n1[1] + n2[1], n1[2] + n2[2], parents[f]);
  }
  for (let f = 0; f < T; f += 1) {
    if (pairOf[f] >= 0) continue;
    const A = I[f * 3], B = I[f * 3 + 1], C = I[f * 3 + 2];
    const parent = parents[f];
    if (!sliced[f]) {
      // An uncut triangle next to cut ones: take in their points on the shared edges.
      const onAB = isActive(A, B) ? pts(A, 0, B, 0).map((e) => e.id) : [];
      const onBC = isActive(B, C) ? pts(B, 0, C, 0).map((e) => e.id) : [];
      const onCA = isActive(C, A) ? pts(C, 0, A, 0).map((e) => e.id) : [];
      const used = (onAB.length ? 1 : 0) + (onBC.length ? 1 : 0) + (onCA.length ? 1 : 0);
      if (used === 0) {
        out.push(A, B, C);
        outParents.push(parent);
        continue;
      }
      const ring = [A, ...onAB, B, ...onBC, C, ...onCA];
      if (used === 1) {
        // A fan from the corner opposite the edge with points: no triangle lies on a line.
        const apex = onAB.length ? 2 + onAB.length : onBC.length ? 0 : 1 + onAB.length;
        const m = ring.length;
        for (let k = 1; k < m - 1; k += 1) {
          out.push(ring[apex], ring[(apex + k) % m], ring[(apex + k + 1) % m]);
          outParents.push(parent);
        }
      } else {
        // Two or three edges with points: a point in the middle, fanned all round.
        const g = verts.length / 3;
        verts.push((verts[A * 3] + verts[B * 3] + verts[C * 3]) / 3, (verts[A * 3 + 1] + verts[B * 3 + 1] + verts[C * 3 + 1]) / 3, (verts[A * 3 + 2] + verts[B * 3 + 2] + verts[C * 3 + 2]) / 3);
        for (let k = 0; k < ring.length; k += 1) {
          out.push(g, ring[k], ring[(k + 1) % ring.length]);
          outParents.push(parent);
        }
      }
      continue;
    }
    const [nx, ny, nz] = faceCross(verts, A, B, C);
    sweep([A, B, C], [0, diff(A, B), diff(A, C)], nx, ny, nz, parent);
  }
  return { vertices: Float64Array.from(verts), indices: Uint32Array.from(out), parents: Uint32Array.from(outParents), limited: false };
}

/**
 * Point normals weighted by area and, per point, whether a face at it bends away by more than
 * half of `edgeAngle` (a sharp edge), how far the steepest face at it points down and up (so a
 * point on the rim of the bottom counts as bottom and stays on the bed).
 */
export function normalsAndCreases(v: Float64Array, I: Uint32Array, edgeAngle: number) {
  const n = v.length / 3;
  const vn = new Float64Array(n * 3);
  const fn = new Float64Array(I.length);
  for (let t = 0; t < I.length; t += 3) {
    const [x, y, z] = faceCross(v, I[t], I[t + 1], I[t + 2]);
    fn[t] = x;
    fn[t + 1] = y;
    fn[t + 2] = z;
    for (let k = 0; k < 3; k += 1) {
      const id = I[t + k] * 3;
      vn[id] += x;
      vn[id + 1] += y;
      vn[id + 2] += z;
    }
  }
  for (let i = 0; i < n * 3; i += 3) {
    const l = Math.hypot(vn[i], vn[i + 1], vn[i + 2]) || 1;
    vn[i] /= l;
    vn[i + 1] /= l;
    vn[i + 2] /= l;
  }
  const minDot = new Float64Array(n).fill(1);
  const down = new Float64Array(n).fill(-1);
  const up = new Float64Array(n).fill(-1);
  for (let t = 0; t < I.length; t += 3) {
    const l = Math.hypot(fn[t], fn[t + 1], fn[t + 2]);
    if (l === 0) continue;
    const fz = fn[t + 2] / l;
    for (let k = 0; k < 3; k += 1) {
      const id = I[t + k];
      const d = (fn[t] * vn[id * 3] + fn[t + 1] * vn[id * 3 + 1] + fn[t + 2] * vn[id * 3 + 2]) / l;
      if (d < minDot[id]) minDot[id] = d;
      if (-fz > down[id]) down[id] = -fz;
      if (fz > up[id]) up[id] = fz;
    }
  }
  // An edge that bends by w moves away from the averaged normal by w/2.
  const limit = Math.cos(((edgeAngle / 2) * Math.PI) / 180);
  const crease = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) crease[i] = minDot[i] < limit ? 1 : 0;
  return { normals: vn, crease, down, up };
}

export type Adjacency = { start: Uint32Array; nb: Uint32Array };

/** Neighbours of every point (compressed rows); edges listed twice do no harm to the path search. */
export function adjacency(n: number, I: Uint32Array): Adjacency {
  const start = new Uint32Array(n + 1);
  for (let t = 0; t < I.length; t += 1) start[I[t] + 1] += 2;
  for (let i = 0; i < n; i += 1) start[i + 1] += start[i];
  const fill = start.slice(0, n);
  const nb = new Uint32Array(start[n]);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    nb[fill[a]++] = b;
    nb[fill[a]++] = c;
    nb[fill[b]++] = a;
    nb[fill[b]++] = c;
    nb[fill[c]++] = a;
    nb[fill[c]++] = b;
  }
  return { start, nb };
}

function smoothstep(edge0: number, edge1: number, x: number) {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Weight per point from the distance (along the surface, Dijkstra over the edges) to the nearest
 * point that stays smooth (`w0` = 0): smooth up to `margin`, then fading in over `fade` mm.
 */
export function fadeWeights(v: Float64Array, adj: Adjacency, w0: Uint8Array, fade: number, margin = 0) {
  const n = w0.length;
  const w = new Float32Array(n);
  const reach = fade + margin;
  if (reach <= 0) {
    for (let i = 0; i < n; i += 1) w[i] = w0[i];
    return w;
  }
  const dist = new Float64Array(n).fill(Infinity);
  const heapKey: number[] = [];
  const heapVal: number[] = [];
  const push = (k: number, val: number) => {
    let i = heapKey.length;
    heapKey.push(k);
    heapVal.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapKey[p] <= k) break;
      heapKey[i] = heapKey[p];
      heapVal[i] = heapVal[p];
      i = p;
    }
    heapKey[i] = k;
    heapVal[i] = val;
  };
  const pop = () => {
    const topVal = heapVal[0];
    const lastK = heapKey.pop()!;
    const lastV = heapVal.pop()!;
    if (heapKey.length) {
      let i = 0;
      const len = heapKey.length;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= len) break;
        const r = l + 1;
        const c = r < len && heapKey[r] < heapKey[l] ? r : l;
        if (heapKey[c] >= lastK) break;
        heapKey[i] = heapKey[c];
        heapVal[i] = heapVal[c];
        i = c;
      }
      heapKey[i] = lastK;
      heapVal[i] = lastV;
    }
    return topVal;
  };
  for (let i = 0; i < n; i += 1) {
    if (w0[i] !== 0) continue;
    dist[i] = 0;
    for (let e = adj.start[i]; e < adj.start[i + 1]; e += 1) {
      if (w0[adj.nb[e]] !== 0) {
        push(0, i);
        break;
      }
    }
  }
  while (heapKey.length) {
    const d0 = heapKey[0];
    const i = pop();
    if (d0 > dist[i]) continue;
    for (let e = adj.start[i]; e < adj.start[i + 1]; e += 1) {
      const j = adj.nb[e];
      if (w0[j] === 0) continue;
      const nd = d0 + Math.hypot(v[i * 3] - v[j * 3], v[i * 3 + 1] - v[j * 3 + 1], v[i * 3 + 2] - v[j * 3 + 2]);
      if (nd < dist[j] && nd < reach) {
        dist[j] = nd;
        push(nd, j);
      }
    }
  }
  for (let i = 0; i < n; i += 1) w[i] = w0[i] === 0 || dist[i] <= margin ? 0 : dist[i] >= reach ? 1 : smoothstep(margin, reach, dist[i]);
  return w;
}

/**
 * Pull edges shorter than `minLen` together: the second point goes into the first, the two
 * triangles at the edge fall away, and twins of opposite winding (two triangles on the same three
 * points) cancel out. A closed mesh stays closed. The point list stays as it is; unused points do
 * no harm. `faces`: for each new triangle its old one (null when there was nothing to do).
 */
export function collapseShortEdges(vertices: ArrayLike<number>, indices: Uint32Array, minLen = SURFACE_MIN_EDGE) {
  const n = vertices.length / 3;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i += 1) parent[i] = i;
  const find = (i: number) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const min2 = minLen * minLen;
  const short: number[] = [];
  for (let t = 0; t < indices.length; t += 3) {
    for (let k = 0; k < 3; k += 1) {
      const a = indices[t + k], b = indices[t + ((k + 1) % 3)];
      if (a >= b) continue;
      const dx = vertices[a * 3] - vertices[b * 3], dy = vertices[a * 3 + 1] - vertices[b * 3 + 1], dz = vertices[a * 3 + 2] - vertices[b * 3 + 2];
      if (dx * dx + dy * dy + dz * dz < min2) short.push(a, b);
    }
  }
  if (short.length === 0) return { indices, merged: 0, faces: null };
  const count = new Int32Array(n + 1);
  for (let t = 0; t < indices.length; t += 1) count[indices[t] + 1] += 1;
  for (let i = 0; i < n; i += 1) count[i + 1] += count[i];
  const fill = count.slice(0, n);
  const incident = new Int32Array(indices.length);
  for (let t = 0; t < indices.length; t += 1) incident[fill[indices[t]]++] = (t - (t % 3)) / 3;
  const neighbors = (i: number) => {
    const set = new Set<number>();
    for (let e = count[i]; e < count[i + 1]; e += 1) {
      const f = incident[e] * 3;
      for (let k = 0; k < 3; k += 1) set.add(find(indices[f + k]));
    }
    set.delete(find(i));
    return set;
  };
  let merged = 0;
  // Per pass only points away from every merge so far: then the neighbourhood from the input triangles holds. The next pass takes the rest.
  const used = new Uint8Array(n);
  for (let e = 0; e < short.length; e += 2) {
    const a = short[e], b = short[e + 1];
    if (used[a] || used[b]) continue;
    const ra = find(a), rb = find(b);
    if (ra === rb) continue;
    // Link condition: the shared neighbours are exactly the tips of the triangles at the edge - otherwise an edge would get more than two faces.
    const na = neighbors(a), nb = neighbors(b);
    let common = 0;
    na.forEach((x) => {
      if (nb.has(x)) common += 1;
    });
    let apex = 0;
    for (let q = count[a]; q < count[a + 1]; q += 1) {
      const f = incident[q] * 3;
      const r0 = find(indices[f]), r1 = find(indices[f + 1]), r2 = find(indices[f + 2]);
      if ((r0 === ra || r1 === ra || r2 === ra) && (r0 === rb || r1 === rb || r2 === rb)) apex += 1;
    }
    if (common !== apex) continue;
    // No triangle may lose its area or tilt by more than 60 degrees on the way (a tiny one next to a steep flank would
    // fold over the flank): then the short edge rather stays.
    let flat = false;
    for (let q = count[b]; q < count[b + 1] && !flat; q += 1) {
      const f = incident[q] * 3;
      const r0 = find(indices[f]), r1 = find(indices[f + 1]), r2 = find(indices[f + 2]);
      if (r0 === ra || r1 === ra || r2 === ra) continue;
      const ids = [r0, r1, r2].map((r) => (r === rb ? ra : r));
      const [x0, y0, z0] = faceCross(vertices, r0, r1, r2);
      const [x, y, z] = faceCross(vertices, ids[0], ids[1], ids[2]);
      const l = Math.hypot(x, y, z);
      if (l / 2 < 1e-6 || x0 * x + y0 * y + z0 * z <= 0.5 * Math.hypot(x0, y0, z0) * l) flat = true;
    }
    if (flat) continue;
    parent[rb] = ra;
    // Every point of the triangles that change sits this pass out: two merges in one triangle were each checked as if
    // the other did not happen, and together they could fold it.
    for (const p of [a, b]) {
      for (let q = count[p]; q < count[p + 1]; q += 1) {
        const f = incident[q] * 3;
        used[indices[f]] = 1;
        used[indices[f + 1]] = 1;
        used[indices[f + 2]] = 1;
      }
    }
    merged += 1;
  }
  if (merged === 0) return { indices, merged: 0, faces: null };
  const touched = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    if (parent[i] !== i) {
      touched[i] = 1;
      touched[find(i)] = 1;
    }
  }
  const out = new Int32Array(indices.length);
  const from = new Int32Array(indices.length / 3);
  let m = 0;
  const seen = new Map<string, number>();
  for (let t = 0; t < indices.length; t += 3) {
    const a = find(indices[t]), b = find(indices[t + 1]), c = find(indices[t + 2]);
    if (a === b || b === c || a === c) continue;
    out[m] = a;
    out[m + 1] = b;
    out[m + 2] = c;
    from[m / 3] = t / 3;
    m += 3;
    if (touched[a] || touched[b] || touched[c]) {
      const key = [a, b, c].sort((x, y) => x - y).join(",");
      const prev = seen.get(key);
      if (prev === undefined) seen.set(key, m - 3);
      else if (prev >= 0) {
        // A second triangle on the same points: of opposite winding both cancel, of the same winding one stays.
        const p = out[prev], q = out[prev + 1], r = out[prev + 2];
        const same = (p === a && q === b) || (p === b && q === c) || (p === c && q === a);
        out[m - 3] = -1;
        if (!same) {
          out[prev] = -1;
          seen.set(key, -1);
        }
      } else out[m - 3] = -1;
    }
  }
  let k = 0;
  for (let t = 0; t < m; t += 3) if (out[t] >= 0) k += 1;
  const kept = new Uint32Array(k * 3);
  const faces = new Uint32Array(k);
  k = 0;
  for (let t = 0; t < m; t += 3) {
    if (out[t] < 0) continue;
    kept[k * 3] = out[t];
    kept[k * 3 + 1] = out[t + 1];
    kept[k * 3 + 2] = out[t + 2];
    faces[k++] = from[t / 3];
  }
  return { indices: kept, merged, faces };
}

/**
 * Triangles without area whose tip lies on the long opposite edge (left over from cutting): the
 * triangle falls away and the neighbour across the long edge is split at the tip, so the mesh
 * stays closed and without a T-joint. Several passes for chains. Returns the same indices when
 * there was nothing to do.
 */
export function fixCaps(vertices: ArrayLike<number>, indices: Uint32Array, maxArea = 1e-7) {
  let I = indices;
  for (let pass = 0; pass < 4; pass += 1) {
    const caps: number[] = [];
    for (let t = 0; t < I.length; t += 3) if (Math.hypot(...faceCross(vertices, I[t], I[t + 1], I[t + 2])) / 2 < maxArea) caps.push(t / 3);
    if (caps.length === 0) return I;
    const byEdge = new Map<number, number[]>();
    for (let t = 0; t < I.length; t += 3) {
      for (let k = 0; k < 3; k += 1) {
        const key = edgeKey(I[t + k], I[t + ((k + 1) % 3)]);
        const list = byEdge.get(key);
        if (list) list.push(t / 3);
        else byEdge.set(key, [t / 3]);
      }
    }
    const drop = new Uint8Array(I.length / 3);
    const isCap = new Uint8Array(I.length / 3);
    for (const f of caps) isCap[f] = 1;
    const add: number[] = [];
    const d = (i: number, j: number) => Math.hypot(vertices[i * 3] - vertices[j * 3], vertices[i * 3 + 1] - vertices[j * 3 + 1], vertices[i * 3 + 2] - vertices[j * 3 + 2]);
    for (const f of caps) {
      if (drop[f]) continue;
      const a = I[f * 3], b = I[f * 3 + 1], c = I[f * 3 + 2];
      // Longest edge p-q, tip m between them.
      const ab = d(a, b), bc = d(b, c), ca = d(c, a);
      const [p, q, m] = ab >= bc && ab >= ca ? [a, b, c] : bc >= ca ? [b, c, a] : [c, a, b];
      const list = (byEdge.get(edgeKey(p, q)) ?? []).filter((g) => g !== f && !drop[g] && !isCap[g]);
      if (list.length !== 1) continue;
      const g = list[0];
      const ga = I[g * 3], gb = I[g * 3 + 1], gc = I[g * 3 + 2];
      // The neighbour (q, p, s) in its own order: split at m.
      const rot = ga === q ? [ga, gb, gc] : gb === q ? [gb, gc, ga] : [gc, ga, gb];
      if (rot[1] !== p) continue;
      const s = rot[2];
      drop[f] = 1;
      drop[g] = 1;
      add.push(q, m, s, m, p, s);
    }
    if (add.length === 0) return I;
    const out: number[] = [];
    for (let t = 0; t < I.length; t += 3) if (!drop[t / 3]) out.push(I[t], I[t + 1], I[t + 2]);
    out.push(...add);
    I = Uint32Array.from(out);
  }
  return I;
}

/**
 * Drop fins: two triangles on the same three points with opposite winding (left over when caps
 * are folded at very narrow triangles). They enclose nothing; with them their edges would have
 * four faces.
 */
export function dropFins(indices: Uint32Array) {
  const seen = new Map<number, { f: number; sign: number; hi: number }[]>();
  const drop = new Uint8Array(indices.length / 3);
  let any = false;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    // Turned so that the smallest point comes first; the order of the others then tells the winding.
    const r0 = a < b && a < c ? a : b < c ? b : c;
    const r1 = r0 === a ? b : r0 === b ? c : a;
    const r2 = r0 === a ? c : r0 === b ? a : b;
    const sign = r1 < r2 ? 1 : -1;
    const hi = Math.max(r1, r2);
    const key = r0 * SHIFT + Math.min(r1, r2);
    const list = seen.get(key);
    const twin = list?.find((e) => e.hi === hi && e.sign === -sign && !drop[e.f]);
    if (twin) {
      drop[twin.f] = 1;
      drop[t / 3] = 1;
      any = true;
    } else if (list) list.push({ f: t / 3, sign, hi });
    else seen.set(key, [{ f: t / 3, sign, hi }]);
  }
  if (!any) return indices;
  const out: number[] = [];
  for (let t = 0; t < indices.length; t += 3) if (!drop[t / 3]) out.push(indices[t], indices[t + 1], indices[t + 2]);
  return Uint32Array.from(out);
}

const FOLD_COS = Math.cos((75 * Math.PI) / 180);

/**
 * Points that moved below the bed `zBed` are only moved along their way until they reach it (the
 * point they came from always lies above). When a triangle at such a point would lose its area or
 * tilt by more than 75 degrees, the point stays where it was. Returns how many points were moved back.
 */
export function clampToBed(out: Float64Array, orig: Float64Array, I: Uint32Array, zBed: number) {
  const prev = new Map<number, [number, number, number]>();
  for (let i = 0; i < out.length / 3; i += 1) {
    const z = out[i * 3 + 2];
    if (z >= zBed) continue;
    const oz = orig[i * 3 + 2];
    prev.set(i, [out[i * 3], out[i * 3 + 1], z]);
    const t = oz > z ? Math.max(0, Math.min(1, (oz - zBed) / (oz - z))) : 0;
    for (let k = 0; k < 2; k += 1) out[i * 3 + k] = orig[i * 3 + k] + t * (out[i * 3 + k] - orig[i * 3 + k]);
    out[i * 3 + 2] = zBed;
  }
  if (prev.size === 0) return 0;
  const pos = (i: number, before: boolean): [number, number, number] => (before && prev.has(i) ? prev.get(i)! : [out[i * 3], out[i * 3 + 1], out[i * 3 + 2]]);
  const cross = (a: number[], b: number[], c: number[]) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    return [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
  };
  const revert = new Set<number>();
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (!prev.has(a) && !prev.has(b) && !prev.has(c)) continue;
    const n0 = cross(pos(a, true), pos(b, true), pos(c, true));
    const n1 = cross(pos(a, false), pos(b, false), pos(c, false));
    const l0 = Math.hypot(n0[0], n0[1], n0[2]), l1 = Math.hypot(n1[0], n1[1], n1[2]);
    const folded = l1 / 2 < SURFACE_MIN_AREA || (l0 > 0 && (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]) / (l0 * l1) < FOLD_COS);
    if (folded) [a, b, c].forEach((i) => prev.has(i) && revert.add(i));
  }
  revert.forEach((i) => {
    for (let k = 0; k < 3; k += 1) out[i * 3 + k] = orig[i * 3 + k];
  });
  return prev.size;
}

/**
 * Check of an indexed mesh: separate bodies (joined over shared points), open edges (one face
 * only) and edges with more than two faces. A clean closed body has 1, 0, 0; several bodies are no fault.
 */
export function surfaceMeshReport(indices: Uint32Array, vertexCount: number) {
  const T = indices.length / 3;
  const count = new Map<number, number>();
  for (let t = 0; t < T; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const key = edgeKey(indices[t * 3 + k], indices[t * 3 + ((k + 1) % 3)]);
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  let openEdges = 0, nonManifoldEdges = 0;
  count.forEach((c) => {
    if (c === 1) openEdges += 1;
    else if (c > 2) nonManifoldEdges += 1;
  });
  const parent = new Int32Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) parent[i] = i;
  const find = (i: number) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let t = 0; t < T; t += 1) {
    const a = find(indices[t * 3]);
    parent[find(indices[t * 3 + 1])] = a;
    parent[find(indices[t * 3 + 2])] = find(a);
  }
  const roots = new Set<number>();
  for (let t = 0; t < T; t += 1) roots.add(find(indices[t * 3]));
  return { shells: roots.size, openEdges, nonManifoldEdges };
}

/**
 * A direction per point to move it along that changes smoothly over the surface: the corner
 * normals of the input triangles (averaged over the faces at that corner that bend by less than
 * `creaseAngle` degrees, so a box keeps its flat faces), interpolated over each input triangle.
 * The normals of the refined mesh itself jump between neighbours by the facet angle of the input
 * (3.75 degrees on a 96-sided cylinder); moved by the depth, tiny triangles where two cuts nearly
 * meet folded over. Points on an edge between input triangles get the mean of both sides.
 */
export function interpolatedNormals(base: { vertices: Float64Array; indices: Uint32Array }, mesh: SurfaceMesh, creaseAngle: number) {
  const bv = base.vertices, BI = base.indices;
  const T0 = BI.length / 3;
  const fn = new Float64Array(T0 * 3);
  const fa = new Float64Array(T0);
  for (let f = 0; f < T0; f += 1) {
    const [x, y, z] = faceCross(bv, BI[f * 3], BI[f * 3 + 1], BI[f * 3 + 2]);
    const l = Math.hypot(x, y, z);
    fa[f] = l / 2;
    if (l > 0) {
      fn[f * 3] = x / l;
      fn[f * 3 + 1] = y / l;
      fn[f * 3 + 2] = z / l;
    }
  }
  const n0 = bv.length / 3;
  const start = new Uint32Array(n0 + 1);
  for (let t = 0; t < BI.length; t += 1) start[BI[t] + 1] += 1;
  for (let i = 0; i < n0; i += 1) start[i + 1] += start[i];
  const fill = start.slice(0, n0);
  const faces = new Uint32Array(BI.length);
  for (let t = 0; t < BI.length; t += 1) faces[fill[BI[t]]++] = (t - (t % 3)) / 3;
  const limit = Math.cos((creaseAngle * Math.PI) / 180);
  const corner = new Float64Array(T0 * 9);
  for (let f = 0; f < T0; f += 1) {
    for (let k = 0; k < 3; k += 1) {
      const a = BI[f * 3 + k];
      let x = 0, y = 0, z = 0;
      for (let e = start[a]; e < start[a + 1]; e += 1) {
        const g = faces[e];
        if (fn[f * 3] * fn[g * 3] + fn[f * 3 + 1] * fn[g * 3 + 1] + fn[f * 3 + 2] * fn[g * 3 + 2] < limit) continue;
        x += fn[g * 3] * fa[g];
        y += fn[g * 3 + 1] * fa[g];
        z += fn[g * 3 + 2] * fa[g];
      }
      const l = Math.hypot(x, y, z) || 1;
      corner[f * 9 + k * 3] = x / l;
      corner[f * 9 + k * 3 + 1] = y / l;
      corner[f * 9 + k * 3 + 2] = z / l;
    }
  }
  const v = mesh.vertices, I = mesh.indices;
  const out = new Float64Array(v.length);
  for (let t = 0; t < I.length / 3; t += 1) {
    const P = mesh.parents[t];
    const A = BI[P * 3] * 3, B = BI[P * 3 + 1] * 3, C = BI[P * 3 + 2] * 3;
    const e0x = bv[B] - bv[A], e0y = bv[B + 1] - bv[A + 1], e0z = bv[B + 2] - bv[A + 2];
    const e1x = bv[C] - bv[A], e1y = bv[C + 1] - bv[A + 1], e1z = bv[C + 2] - bv[A + 2];
    const d00 = e0x * e0x + e0y * e0y + e0z * e0z, d01 = e0x * e1x + e0y * e1y + e0z * e1z, d11 = e1x * e1x + e1y * e1y + e1z * e1z;
    const denom = d00 * d11 - d01 * d01;
    for (let k = 0; k < 3; k += 1) {
      const i = I[t * 3 + k];
      let wb = 0, wc = 0;
      if (denom > 0) {
        const px = v[i * 3] - bv[A], py = v[i * 3 + 1] - bv[A + 1], pz = v[i * 3 + 2] - bv[A + 2];
        const d20 = px * e0x + py * e0y + pz * e0z, d21 = px * e1x + py * e1y + pz * e1z;
        wb = Math.min(1, Math.max(0, (d11 * d20 - d01 * d21) / denom));
        wc = Math.min(1 - wb, Math.max(0, (d00 * d21 - d01 * d20) / denom));
      }
      const wa = 1 - wb - wc;
      for (let c = 0; c < 3; c += 1) out[i * 3 + c] += wa * corner[P * 9 + c] + wb * corner[P * 9 + 3 + c] + wc * corner[P * 9 + 6 + c];
    }
  }
  for (let i = 0; i < out.length; i += 3) {
    const l = Math.hypot(out[i], out[i + 1], out[i + 2]);
    if (l > 0) {
      out[i] /= l;
      out[i + 1] /= l;
      out[i + 2] /= l;
    }
  }
  return out;
}
