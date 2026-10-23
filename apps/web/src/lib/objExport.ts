import { layerlingToZUp, type MeshPoint } from "@/lib/meshCoordinates";

export type ObjExportMesh = {
  name: string;
  /** "#rrggbb"; written as a vertex colour, anything else leaves the body without one. */
  color?: string;
  /** A colour per face, for a body whose parts keep their own colours (#153); wins over `color`. */
  faceColors?: readonly string[];
  vertices: readonly MeshPoint[];
  faces: readonly (readonly [number, number, number])[];
};

const OBJ_WELD_TOLERANCE = 0.00001;
// Points are looked up in cells much wider than the tolerance, so a point has a neighbour in the next
// cell only when it lies within the tolerance of that cell's edge: usually one lookup, not 27 (#734).
const OBJ_WELD_CELL = OBJ_WELD_TOLERANCE * 16;

/** A number for a cell. Two cells may share one; the candidates are checked against the tolerance anyway. */
function cellHash(x: number, y: number, z: number) {
  return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) | 0;
}

/** The cells to look in along one axis: its own, and the next one on a side the point is close to. */
function cellOffsets(value: number, cell: number) {
  const inside = value - cell * OBJ_WELD_CELL;
  const offsets: number[] = [];
  if (inside <= OBJ_WELD_TOLERANCE * 2) offsets.push(-1);
  offsets.push(0);
  if (OBJ_WELD_CELL - inside <= OBJ_WELD_TOLERANCE * 2) offsets.push(1);
  return offsets;
}

export function weldMeshVertices(mesh: ObjExportMesh) {
  const vertices: Array<[number, number, number]> = [];
  const buckets = new Map<number, number[]>();
  const remappedIndices: number[] = [];

  mesh.vertices.forEach((sourceVertex) => {
    // The points are welded in layerling's own coordinates; exportMeshesToObj turns them to Z up
    // when it writes them.
    const vertex: [number, number, number] = [sourceVertex[0], sourceVertex[1], sourceVertex[2]];
    const cellX = Math.floor(vertex[0] / OBJ_WELD_CELL);
    const cellY = Math.floor(vertex[1] / OBJ_WELD_CELL);
    const cellZ = Math.floor(vertex[2] / OBJ_WELD_CELL);
    const offsetsX = cellOffsets(vertex[0], cellX);
    const offsetsY = cellOffsets(vertex[1], cellY);
    const offsetsZ = cellOffsets(vertex[2], cellZ);
    let weldedIndex: number | undefined;

    for (let x = 0; x < offsetsX.length && weldedIndex === undefined; x += 1) {
      for (let y = 0; y < offsetsY.length && weldedIndex === undefined; y += 1) {
        for (let z = 0; z < offsetsZ.length && weldedIndex === undefined; z += 1) {
          const candidates = buckets.get(cellHash(cellX + offsetsX[x], cellY + offsetsY[y], cellZ + offsetsZ[z]));
          if (!candidates) continue;
          weldedIndex = candidates.find((candidateIndex) => {
            const candidate = vertices[candidateIndex];
            return (
              Math.abs(candidate[0] - vertex[0]) <= OBJ_WELD_TOLERANCE &&
              Math.abs(candidate[1] - vertex[1]) <= OBJ_WELD_TOLERANCE &&
              Math.abs(candidate[2] - vertex[2]) <= OBJ_WELD_TOLERANCE
            );
          });
        }
      }
    }

    if (weldedIndex === undefined) {
      weldedIndex = vertices.length;
      vertices.push(vertex);
      const key = cellHash(cellX, cellY, cellZ);
      const own = buckets.get(key);
      if (own) own.push(weldedIndex);
      else buckets.set(key, [weldedIndex]);
    }
    remappedIndices.push(weldedIndex);
  });

  const faces: Array<[number, number, number]> = [];
  // Which source face each kept face was, so per-face colours stay with their face.
  const kept: number[] = [];
  mesh.faces.forEach(([a, b, c], index) => {
    const face: [number, number, number] = [remappedIndices[a], remappedIndices[b], remappedIndices[c]];
    if (face[0] === face[1] || face[1] === face[2] || face[2] === face[0]) return;
    faces.push(face);
    kept.push(index);
  });

  return { vertices, faces, kept };
}

function objNumber(value: number) {
  return Math.abs(value) < 1e-12 ? "0" : String(value);
}

/**
 * Die Farbe steht als Vertexfarbe hinter jedem Punkt (`v x y z r g b`, 0 bis
 * 1). So bleibt die OBJ eine einzige Datei; Bambu Studio und OrcaSlicer lesen
 * genau das und bieten dann die Zuordnung auf Filamente an, andere Programme
 * nehmen die ersten drei Zahlen. Eine .mtl braeuchte eine zweite Datei, und
 * ein `mtllib` ohne sie laesst OrcaSlicer das Laden abbrechen (Discussion #79).
 */
function objVertexColor(color: string | undefined) {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return "";
  const channel = (start: number) => objNumber(Math.round((parseInt(color.slice(start, start + 2), 16) / 255) * 10000) / 10000);
  return ` ${channel(1)} ${channel(3)} ${channel(5)}`;
}

export function exportMeshesToObj(meshes: readonly ObjExportMesh[]) {
  // Z up, like STL and 3MF: slicers (Cura, Creality Print) read an OBJ as it is and stand a Y-up file
  // on its side (#541). layerling's own import knows the "Z-up" line and turns such a file back.
  const lines = ["# Layerling OBJ export", "# Z-up, millimetres"];
  let offset = 1;

  meshes.forEach((mesh) => {
    const welded = weldMeshVertices(mesh);
    const color = objVertexColor(mesh.color);
    // OBJ has colours per point only: with colours per face, a point takes the colour of the
    // first face that uses it, so the border between two colours runs along those faces.
    const pointColors: string[] = [];
    if (mesh.faceColors?.length) {
      welded.faces.forEach((face, index) => {
        const faceColor = objVertexColor(mesh.faceColors?.[welded.kept[index]]) || color;
        face.forEach((point) => { pointColors[point] ??= faceColor; });
      });
    }
    lines.push(`o ${mesh.name}`);
    welded.vertices.forEach((vertex, index) => {
      const [x, y, z] = layerlingToZUp(vertex);
      lines.push(`v ${objNumber(x)} ${objNumber(y)} ${objNumber(z)}${pointColors[index] ?? color}`);
    });
    welded.faces.forEach(([a, b, c]) => lines.push(`f ${a + offset} ${b + offset} ${c + offset}`));
    offset += welded.vertices.length;
  });

  return lines.join("\n");
}
