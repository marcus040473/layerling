/**
 * The centre of the flat face a triangle belongs to: every triangle in the same plane that is
 * connected to it, weighted by area. A shape dropped on the top of a box or a cylinder lands
 * in the middle of that top, as in Tinkercad (#823). Works in the mesh's own coordinates.
 */
export function planarFaceCentre(
  positions: ArrayLike<number>,
  index: ArrayLike<number> | null,
  triangle: number,
  maxTriangles = 200_000,
): { centre: [number, number, number]; radius: number; farthest: [number, number, number] } | null {
  const triangleCount = Math.floor((index ? index.length : positions.length / 3) / 3);
  if (triangle < 0 || triangle >= triangleCount || triangleCount > maxTriangles) return null;
  const vertexOf = (tri: number, corner: number) => (index ? index[tri * 3 + corner] : tri * 3 + corner);
  const point = (vertex: number): [number, number, number] => [positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]];

  const normals = new Float64Array(triangleCount * 3);
  const areas = new Float64Array(triangleCount);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let tri = 0; tri < triangleCount; tri += 1) {
    const a = point(vertexOf(tri, 0));
    const b = point(vertexOf(tri, 1));
    const c = point(vertexOf(tri, 2));
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    areas[tri] = length / 2;
    if (length > 0) {
      normals[tri * 3] = nx / length;
      normals[tri * 3 + 1] = ny / length;
      normals[tri * 3 + 2] = nz / length;
    }
    for (const p of [a, b, c]) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
      minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
    }
  }
  if (areas[triangle] <= 0) return null;
  const tolerance = Math.max(1e-6, Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) * 1e-5);
  const key = (p: [number, number, number]) => `${Math.round(p[0] / tolerance)},${Math.round(p[1] / tolerance)},${Math.round(p[2] / tolerance)}`;

  // Triangles of the plane only, joined where they share a corner: separate faces that happen to
  // lie in the same plane (two feet of a stand) stay apart.
  const n = [normals[triangle * 3], normals[triangle * 3 + 1], normals[triangle * 3 + 2]];
  const origin = point(vertexOf(triangle, 0));
  const inPlane = (tri: number) => {
    if (areas[tri] <= 0) return false;
    if (normals[tri * 3] * n[0] + normals[tri * 3 + 1] * n[1] + normals[tri * 3 + 2] * n[2] < 0.9999) return false;
    const p = point(vertexOf(tri, 0));
    return Math.abs((p[0] - origin[0]) * n[0] + (p[1] - origin[1]) * n[1] + (p[2] - origin[2]) * n[2]) <= tolerance * 10;
  };
  const byCorner = new Map<string, number[]>();
  for (let tri = 0; tri < triangleCount; tri += 1) {
    if (!inPlane(tri)) continue;
    for (let corner = 0; corner < 3; corner += 1) {
      const k = key(point(vertexOf(tri, corner)));
      const list = byCorner.get(k);
      if (list) list.push(tri);
      else byCorner.set(k, [tri]);
    }
  }

  const seen = new Set<number>([triangle]);
  const queue = [triangle];
  let area = 0;
  const sum = [0, 0, 0];
  while (queue.length) {
    const tri = queue.pop()!;
    const corners = [0, 1, 2].map((corner) => point(vertexOf(tri, corner)));
    area += areas[tri];
    for (let axis = 0; axis < 3; axis += 1) sum[axis] += areas[tri] * (corners[0][axis] + corners[1][axis] + corners[2][axis]) / 3;
    for (const corner of corners) {
      for (const next of byCorner.get(key(corner)) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
  }
  if (area <= 0) return null;
  const centre: [number, number, number] = [sum[0] / area, sum[1] / area, sum[2] / area];
  // How far the face reaches from its centre, so a pointer near the middle can be told from one near an edge.
  // The corner farthest out comes along too: a body stretched in the view is measured in the room through it.
  let radius = 0;
  let farthest = centre;
  for (const tri of seen) {
    for (let corner = 0; corner < 3; corner += 1) {
      const p = point(vertexOf(tri, corner));
      const distance = Math.hypot(p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]);
      if (distance > radius) {
        radius = distance;
        farthest = p;
      }
    }
  }
  return { centre, radius, farthest };
}
