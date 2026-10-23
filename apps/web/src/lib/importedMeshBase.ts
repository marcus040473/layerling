import type { WorkplaneShape } from "@/types/layerling";

/** Below this an extent counts as none: a flat sheet reports 1 so nothing divides by zero, but nothing thicker than a hair is rounded up (#700). */
export const MIN_MESH_EXTENT = 0.001;

/** The extent an importer reports for a mesh span: the real one, or 1 for a sheet with no thickness. */
export function reportedMeshExtent(span: number) {
  return span >= MIN_MESH_EXTENT ? span : 1;
}

const spansOfPositions = new WeakMap<object, [number, number, number]>();

/** The real x/y/z extent of a point list, read once per list: shapes are canonicalised on every edit. */
function meshSpans(positions: number[]) {
  const known = spansOfPositions.get(positions);
  if (known) return known;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index + 2 < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  const spans: [number, number, number] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  spansOfPositions.set(positions, spans);
  return spans;
}

/**
 * Importers used to report every extent as at least 1 mm while the points kept their real size, so a part 0.76 mm thick showed
 * "1.00" and every height typed in came out 0.76 times too small (#700). Saved designs and shapes still carry that 1: when the
 * points are thinner than the base the shape claims, the base is set to the real extent and the shape's own size is scaled with
 * it, so the part keeps the size it has in the world and the fields tell the truth.
 */
export function repairClampedMeshBase(shape: WorkplaneShape): WorkplaneShape {
  const mesh = shape.importedMesh;
  if (!mesh || mesh.positions.length < 3) return shape;
  if (mesh.baseWidth !== 1 && mesh.baseHeight !== 1 && mesh.baseDepth !== 1) return shape;
  const [spanX, spanY, spanZ] = meshSpans(mesh.positions);
  const real = (span: number, base: number) => (base === 1 && Number.isFinite(span) && span >= MIN_MESH_EXTENT && span < 1 - 1e-6 ? span : base);
  const baseWidth = real(spanX, mesh.baseWidth);
  const baseHeight = real(spanY, mesh.baseHeight);
  const baseDepth = real(spanZ, mesh.baseDepth);
  if (baseWidth === mesh.baseWidth && baseHeight === mesh.baseHeight && baseDepth === mesh.baseDepth) return shape;
  const width = shape.width * (baseWidth / mesh.baseWidth);
  const depth = shape.depth * (baseDepth / mesh.baseDepth);
  return {
    ...shape,
    width,
    depth,
    height: shape.height * (baseHeight / mesh.baseHeight),
    size: shape.size * Math.max(width, depth) / Math.max(shape.width, shape.depth),
    importedMesh: { ...mesh, baseWidth, baseHeight, baseDepth },
  };
}
