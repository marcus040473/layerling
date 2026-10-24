import * as THREE from "three";

const PRECISION = 10 ** 4;
const triangle = new THREE.Triangle();
const normal = new THREE.Vector3();
const start = new THREE.Vector3();
const end = new THREE.Vector3();

/**
 * THREE.EdgesGeometry, line for line, with numbers where it builds a text key for every corner
 * and every edge. The same lines in the same order come out (tests/unit/fastEdgesGeometry.test.ts);
 * drawing the edges of a cut through an imported 100,000-triangle mesh took half a second of the
 * main thread with the text keys.
 *
 * Corners are the same when they round to the same 1/10,000, as three.js has it. An edge seen from
 * both of its triangles is drawn when they meet at `thresholdAngle` degrees or more; an edge of
 * one triangle only is drawn always. Geometry this does not read plainly (interleaved or
 * normalized positions) goes to three.js itself.
 */
export function fastEdgesGeometry(geometry: THREE.BufferGeometry, thresholdAngle = 1): THREE.EdgesGeometry {
  const positionAttr = geometry.getAttribute("position") as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  if (!positionAttr || "isInterleavedBufferAttribute" in positionAttr || positionAttr.normalized || positionAttr.itemSize !== 3) {
    return new THREE.EdgesGeometry(geometry, thresholdAngle);
  }
  const thresholdDot = Math.cos(THREE.MathUtils.DEG2RAD * thresholdAngle);
  const indexAttr = geometry.getIndex();
  const indexCount = indexAttr ? indexAttr.count : positionAttr.count;
  const corner = cornerIds(positionAttr);
  const cornerCount = corner.count;

  // What three.js keeps per edge key: absent, waiting for its partner (the entry), or done (null).
  // A Map keeps its order as the object does with keys that are not numbers.
  const edgeData = new Map<number, { index0: number; index1: number; nx: number; ny: number; nz: number } | null>();
  const vertices: number[] = [];
  const indexArr = [0, 0, 0];
  const ids = [0, 0, 0];
  const points = [triangle.a, triangle.b, triangle.c];
  for (let i = 0; i < indexCount; i += 3) {
    if (indexAttr) {
      indexArr[0] = indexAttr.getX(i);
      indexArr[1] = indexAttr.getX(i + 1);
      indexArr[2] = indexAttr.getX(i + 2);
    } else {
      indexArr[0] = i;
      indexArr[1] = i + 1;
      indexArr[2] = i + 2;
    }
    triangle.a.fromBufferAttribute(positionAttr, indexArr[0]);
    triangle.b.fromBufferAttribute(positionAttr, indexArr[1]);
    triangle.c.fromBufferAttribute(positionAttr, indexArr[2]);
    triangle.getNormal(normal);
    ids[0] = corner.ids[indexArr[0]];
    ids[1] = corner.ids[indexArr[1]];
    ids[2] = corner.ids[indexArr[2]];
    // Degenerate triangles are skipped.
    if (ids[0] === ids[1] || ids[1] === ids[2] || ids[2] === ids[0]) continue;
    for (let j = 0; j < 3; j += 1) {
      const jNext = (j + 1) % 3;
      const hash = ids[j] * cornerCount + ids[jNext];
      const reverseHash = ids[jNext] * cornerCount + ids[j];
      const sibling = edgeData.get(reverseHash);
      if (sibling) {
        if (normal.x * sibling.nx + normal.y * sibling.ny + normal.z * sibling.nz <= thresholdDot) {
          const v0 = points[j];
          const v1 = points[jNext];
          vertices.push(v0.x, v0.y, v0.z);
          vertices.push(v1.x, v1.y, v1.z);
        }
        edgeData.set(reverseHash, null);
      } else if (!edgeData.has(hash)) {
        edgeData.set(hash, { index0: indexArr[j], index1: indexArr[jNext], nx: normal.x, ny: normal.y, nz: normal.z });
      }
    }
  }
  for (const entry of edgeData.values()) {
    if (!entry) continue;
    start.fromBufferAttribute(positionAttr, entry.index0);
    end.fromBufferAttribute(positionAttr, entry.index1);
    vertices.push(start.x, start.y, start.z);
    vertices.push(end.x, end.y, end.z);
  }

  const edges = new THREE.EdgesGeometry(null, thresholdAngle);
  // What three.js would note there; nothing in layerling reads it.
  (edges.parameters as { geometry: THREE.BufferGeometry | null }).geometry = geometry;
  edges.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  return edges;
}

/**
 * A number per position that is the same exactly when three.js's text key would be: the three
 * coordinates rounded to 1/10,000. Text keys treat -0 as 0 and NaN as NaN, and so does this.
 */
function cornerIds(positionAttr: THREE.BufferAttribute) {
  const count = positionAttr.count;
  const grid = new Float64Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    grid[index * 3] = Math.round(positionAttr.getX(index) * PRECISION) + 0;
    grid[index * 3 + 1] = Math.round(positionAttr.getY(index) * PRECISION) + 0;
    grid[index * 3 + 2] = Math.round(positionAttr.getZ(index) * PRECISION) + 0;
  }
  let capacity = 1;
  while (capacity < count * 2) capacity <<= 1;
  const mask = capacity - 1;
  const table = new Int32Array(capacity).fill(-1);
  const tableIds = new Int32Array(capacity);
  const ids = new Int32Array(count);
  let next = 0;
  for (let index = 0; index < count; index += 1) {
    const x = grid[index * 3];
    const y = grid[index * 3 + 1];
    const z = grid[index * 3 + 2];
    let hash = Math.imul(hashPart(x), 0x9e3779b1);
    hash = Math.imul(hash ^ hashPart(y), 0x85ebca6b);
    hash = Math.imul(hash ^ hashPart(z), 0xc2b2ae35);
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x85ebca6b);
    hash ^= hash >>> 13;
    hash &= mask;
    for (;;) {
      const entry = table[hash];
      if (entry === -1) {
        table[hash] = index;
        tableIds[hash] = next;
        ids[index] = next;
        next += 1;
        break;
      }
      if (sameNumber(grid[entry * 3], x) && sameNumber(grid[entry * 3 + 1], y) && sameNumber(grid[entry * 3 + 2], z)) {
        ids[index] = tableIds[hash];
        break;
      }
      hash = (hash + 1) & mask;
    }
  }
  return { ids, count: Math.max(1, next) };
}

function hashPart(value: number) {
  return value !== value ? 0x7fc00000 : (value | 0) ^ ((value / 4294967296) | 0);
}

/** NaN meets NaN, as the text "NaN" meets itself. */
function sameNumber(a: number, b: number) {
  return a === b || (a !== a && b !== b);
}
