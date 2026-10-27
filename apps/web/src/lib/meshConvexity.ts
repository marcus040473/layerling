/** Above this many triangles a mesh is not checked and counts as not convex: the check compares every plane with every point. */
export const CONVEXITY_TRIANGLE_LIMIT = 5000;
/** How far, in mm, a point may stand on the wrong side of a face; a fillet's facets are not exactly on one curve. */
const CONVEXITY_TOLERANCE = 0.01;

const convexByPositions = new WeakMap<readonly number[], boolean>();

/**
 * Whether a triangle soup (nine numbers a triangle) bulges nowhere inwards: every point lies on one side of
 * every face's plane. A box with a fillet or chamfer, a cylinder or a cone does; an L, a ring or a cup does not.
 * Scaled round the middle of its box, such a body moves every wall outwards, which is what lets a hole made of it
 * be widened by a hair (#928). The answer is kept per positions array, which a shape keeps while it is moved.
 */
export function meshIsConvex(positions: readonly number[]): boolean {
  const known = convexByPositions.get(positions);
  if (known !== undefined) return known;
  const result = computeConvex(positions);
  convexByPositions.set(positions, result);
  return result;
}

function computeConvex(positions: readonly number[]): boolean {
  const triangleCount = Math.floor(positions.length / 9);
  if (triangleCount < 4 || triangleCount > CONVEXITY_TRIANGLE_LIMIT) return false;
  const points: Array<[number, number, number]> = [];
  const seen = new Set<string>();
  for (let index = 0; index + 2 < positions.length; index += 3) {
    const key = `${positions[index].toFixed(4)},${positions[index + 1].toFixed(4)},${positions[index + 2].toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push([positions[index], positions[index + 1], positions[index + 2]]);
  }
  const planes = new Set<string>();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const at = triangle * 9;
    const ux = positions[at + 3] - positions[at], uy = positions[at + 4] - positions[at + 1], uz = positions[at + 5] - positions[at + 2];
    const vx = positions[at + 6] - positions[at], vy = positions[at + 7] - positions[at + 1], vz = positions[at + 8] - positions[at + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-9) continue;
    nx /= length; ny /= length; nz /= length;
    const offset = nx * positions[at] + ny * positions[at + 1] + nz * positions[at + 2];
    const planeKey = `${nx.toFixed(5)},${ny.toFixed(5)},${nz.toFixed(5)},${offset.toFixed(3)}`;
    if (planes.has(planeKey)) continue;
    planes.add(planeKey);
    let above = false;
    let below = false;
    for (const [x, y, z] of points) {
      const distance = nx * x + ny * y + nz * z - offset;
      if (distance > CONVEXITY_TOLERANCE) above = true;
      else if (distance < -CONVEXITY_TOLERANCE) below = true;
      if (above && below) return false;
    }
  }
  return true;
}
