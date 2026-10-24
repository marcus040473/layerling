import type { MeshData } from "@/lib/editorMeshCore";
import { weldOnGrid } from "@/lib/gridWeld";

/**
 * How many separate parts a mesh is made of: faces that share a corner - two corners count as
 * one when they round to the same point on a `tolerance` grid - belong to one part. The same
 * count as the parts "Separate parts" makes (meshFaceComponents in LayerlingEditor.tsx), worked
 * out without a text key per corner: the editor asks it whenever a large import is selected, and
 * the text keys took a quarter of a second for 200,000 triangles.
 */
export function meshPartCount(mesh: MeshData, tolerance: number): number {
  const { faces, vertices } = mesh;
  if (faces.length === 0) return 0;
  const { ids, count: cornerCount } = weldOnGrid(vertices, tolerance);

  // Faces sharing a corner are joined (union-find with path halving).
  const parent = new Int32Array(cornerCount);
  for (let corner = 0; corner < cornerCount; corner += 1) parent[corner] = corner;
  const find = (start: number) => {
    let current = start;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };
  for (let index = 0; index < faces.length; index += 1) {
    const face = faces[index];
    const a = find(ids[face[0]]);
    const b = find(ids[face[1]]);
    if (a !== b) parent[b] = a;
    const c = find(ids[face[2]]);
    if (c !== a) parent[c] = a;
  }

  let count = 0;
  const counted = new Uint8Array(cornerCount);
  for (let index = 0; index < faces.length; index += 1) {
    const root = find(ids[faces[index][0]]);
    if (!counted[root]) {
      counted[root] = 1;
      count += 1;
    }
  }
  return count;
}
