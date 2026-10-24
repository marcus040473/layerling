import type { MeshData, Vec3 } from "@/lib/editorMeshCore";

/**
 * Which openings are closed on their own: a small one, its rim at most this share of the mesh's
 * bounding box diagonal (an eye of a figure left open, a crack in a scan), and a flat one of any
 * size, its rim off its plane by at most `HOLE_FILL_MAX_WARP` of its radius (an open side, the open
 * back of an eye cup). A large opening whose rim bends is a missing piece of curved surface, and a
 * cap guessed over it would change the part.
 */
export const HOLE_FILL_MAX_RIM_SHARE = 0.1;
export const HOLE_FILL_MAX_WARP = 0.05;

export type MeshHoleFill = {
  /** The mesh with its small openings capped; the input when nothing was closed. */
  mesh: MeshData;
  /** How many openings were capped. */
  closed: number;
  /** How many openings stay open: large and bent, a cap that would fold over, or a rim through one corner twice. */
  open: number;
};

/**
 * Closes the small openings of a mesh whose surface is otherwise whole (#791). Corners are welded
 * by position, the edges only one triangle uses are chained into rims, and every rim small or flat
 * enough is capped by a fan from its centre, turned the same way as the triangles around it, when
 * no triangle of the fan folds back over the others. A mesh with
 * an edge three or more triangles share is left alone: its trouble is not a hole.
 */
export function closeSmallMeshHoles(mesh: MeshData, maxRimShare = HOLE_FILL_MAX_RIM_SHARE): MeshHoleFill {
  const unchanged = (open: number): MeshHoleFill => ({ mesh, closed: 0, open });
  if (mesh.faces.length === 0) return unchanged(0);

  const vertices: Vec3[] = [];
  const welded = new Map<string, number>();
  const remap = mesh.vertices.map(([x, y, z]) => {
    const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
    let index = welded.get(key);
    if (index === undefined) {
      index = vertices.length;
      welded.set(key, index);
      vertices.push([x, y, z]);
    }
    return index;
  });

  const faces: [number, number, number][] = [];
  // Every edge as "low,high" with how often it is used, and the direction a triangle runs along it.
  const uses = new Map<string, number>();
  const direction = new Map<string, [number, number]>();
  for (const face of mesh.faces) {
    const [a, b, c] = face.map((index) => remap[index]) as [number, number, number];
    if (a === b || b === c || c === a) continue;
    faces.push([a, b, c]);
    for (const [from, to] of [[a, b], [b, c], [c, a]] as const) {
      const key = from < to ? `${from},${to}` : `${to},${from}`;
      uses.set(key, (uses.get(key) ?? 0) + 1);
      direction.set(key, [from, to]);
    }
  }

  // Each open edge as its triangle runs it: from -> to.
  const next = new Map<number, number[]>();
  let openEdges = 0;
  for (const [key, count] of uses) {
    if (count > 2) return unchanged(0);
    if (count !== 1) continue;
    const [from, to] = direction.get(key)!;
    const list = next.get(from);
    if (list) list.push(to);
    else next.set(from, [to]);
    openEdges += 1;
  }
  if (openEdges === 0) return unchanged(0);

  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const [x, y, z] of vertices) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
  }
  const maxRim = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) * maxRimShare;
  const distance = (a: number, b: number) => {
    const [ax, ay, az] = vertices[a];
    const [bx, by, bz] = vertices[b];
    return Math.hypot(ax - bx, ay - by, az - bz);
  };

  // A corner two rims meet in cannot be told apart: its rims stay open.
  const pinched = new Set([...next].filter(([, list]) => list.length > 1).map(([from]) => from));
  const visited = new Set<number>();
  let closed = 0;
  let open = 0;
  for (const start of next.keys()) {
    if (visited.has(start)) continue;
    const rim: number[] = [];
    let current = start;
    let broken = false;
    while (!visited.has(current)) {
      visited.add(current);
      rim.push(current);
      if (pinched.has(current)) broken = true;
      const following = next.get(current);
      if (!following) { broken = true; break; }
      current = following[0];
    }
    if (current !== start) broken = true;
    if (broken || rim.length < 3) { open += 1; continue; }
    const points = rim.map((index) => vertices[index]);
    const centre: Vec3 = [0, 0, 0];
    for (const [x, y, z] of points) {
      centre[0] += x / rim.length;
      centre[1] += y / rim.length;
      centre[2] += z / rim.length;
    }
    // The rim's plane (Newell's normal) faces the way the triangles beside it run the rim round.
    const normal: Vec3 = [0, 0, 0];
    let length = 0;
    points.forEach((point, i) => {
      const following = points[(i + 1) % points.length];
      normal[0] += (point[1] - following[1]) * (point[2] + following[2]);
      normal[1] += (point[2] - following[2]) * (point[0] + following[0]);
      normal[2] += (point[0] - following[0]) * (point[1] + following[1]);
      length += distance(rim[i], rim[(i + 1) % rim.length]);
    });
    const normalLength = Math.hypot(normal[0], normal[1], normal[2]);
    if (normalLength === 0) { open += 1; continue; }
    const warp = Math.max(...points.map(([x, y, z]) => Math.abs((x - centre[0]) * normal[0] + (y - centre[1]) * normal[1] + (z - centre[2]) * normal[2]))) / normalLength;
    const flat = warp <= HOLE_FILL_MAX_WARP * (length / (2 * Math.PI));
    if (length > maxRim && !flat) { open += 1; continue; }
    // The triangles beside the rim run it forwards, so the cap runs it backwards: every fan triangle faces against the rim's normal.
    const folds = points.some((point, i) => {
      const before = points[(i + 1) % points.length];
      const ux = before[0] - centre[0], uy = before[1] - centre[1], uz = before[2] - centre[2];
      const vx = point[0] - centre[0], vy = point[1] - centre[1], vz = point[2] - centre[2];
      return (uy * vz - uz * vy) * normal[0] + (uz * vx - ux * vz) * normal[1] + (ux * vy - uy * vx) * normal[2] > 0;
    });
    if (folds) { open += 1; continue; }
    if (rim.length === 3) {
      faces.push([rim[2], rim[1], rim[0]]);
    } else {
      const middle = vertices.length;
      vertices.push(centre);
      for (let i = 0; i < rim.length; i += 1) faces.push([rim[(i + 1) % rim.length], rim[i], middle]);
    }
    closed += 1;
  }
  return closed === 0 ? unchanged(open) : { mesh: { name: mesh.name, vertices, faces }, closed, open };
}
