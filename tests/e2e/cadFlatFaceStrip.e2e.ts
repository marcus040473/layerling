import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OcctKernel, type ShapeHandle } from "occt-wasm";
import { cadFlatFaceMeshStraysFromOutline } from "@/lib/cadFaceOutline";

/**
 * A fillet round the top of an imported disc with a bay (#740): at 0.8 mm the kernel hands back a body it
 * calls valid whose top face is meshed across the bay, a strip outside the disc. The face has one straight,
 * simple outline of 250 corners, so the check against that outline has to say so exactly where the strip is.
 */
let cad: OcctKernel;
const POSITIONS: number[] = [];
const cells = new Map<string, number[][]>();

beforeAll(async () => {
  const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
  cad = await OcctKernel.init({ wasm });
  const file = readFileSync(join(__dirname, "..", "fixtures", "disc-with-bay-740.stl"));
  const triangles = file.readUInt32LE(80);
  for (let index = 0; index < triangles; index += 1) {
    const at = 84 + index * 50 + 12;
    for (let corner = 0; corner < 9; corner += 1) POSITIONS.push(file.readFloatLE(at + corner * 4));
  }
  // The footprint of the disc: its triangles seen from above, hashed by 2 mm cells.
  for (let at = 0; at + 8 < POSITIONS.length; at += 9) {
    const corners = [POSITIONS.slice(at, at + 2), POSITIONS.slice(at + 3, at + 5), POSITIONS.slice(at + 6, at + 8)];
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    for (let gx = Math.floor(Math.min(...xs) / 2) - 1; gx <= Math.floor(Math.max(...xs) / 2) + 1; gx += 1) {
      for (let gy = Math.floor(Math.min(...ys) / 2) - 1; gy <= Math.floor(Math.max(...ys) / 2) + 1; gy += 1) {
        const key = `${gx},${gy}`;
        cells.set(key, [...(cells.get(key) ?? []), corners.flat()]);
      }
    }
  }
});

function insideFootprint(x: number, y: number) {
  return (cells.get(`${Math.floor(x / 2)},${Math.floor(y / 2)}`) ?? []).some(([x1, y1, x2, y2, x3, y3]) => {
    const d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
    if (Math.abs(d) < 1e-12) return false;
    const a = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / d;
    const b = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / d;
    return a >= -1e-3 && b >= -1e-3 && 1 - a - b >= -1e-3;
  });
}

function asciiStl() {
  const lines = ["solid disc"];
  for (let at = 0; at + 8 < POSITIONS.length; at += 9) {
    lines.push("facet normal 0 0 0", "outer loop");
    for (let corner = 0; corner < 3; corner += 1) lines.push(`vertex ${POSITIONS[at + corner * 3]} ${POSITIONS[at + corner * 3 + 1]} ${POSITIONS[at + corner * 3 + 2]}`);
    lines.push("endloop", "endfacet");
  }
  lines.push("endsolid disc");
  return lines.join(String.fromCharCode(10));
}

function discSolid() {
  const imported = cad.importStl(asciiStl());
  let solid = cad.sewAndSolidify(cad.getSubShapes(imported, "face"), 1e-5);
  solid = cad.healSolid(cad.fixShape(solid), 1e-5);
  solid = cad.fixFaceOrientations(solid);
  return cad.unifySameDomain(cad.removeDegenerateEdges(solid));
}

function topEdges(solid: ShapeHandle) {
  return cad.getSubShapes(solid, "edge").filter((edge) => {
    const box = cad.getBoundingBox(edge);
    return Math.abs(box.zmin - 2) < 1e-3 && Math.abs(box.zmax - 2) < 1e-3;
  });
}

/** The triangles of the whole body that lie where the disc is not: the strip, counted from the mesh. */
function trianglesOutsideDisc(shape: ShapeHandle) {
  const mesh = cad.tessellate(shape, { linearDeflection: 0.05, angularDeflection: 0.5 });
  let outside = 0;
  for (let triangle = 0; triangle < mesh.triangleCount; triangle += 1) {
    const [a, b, c] = [0, 1, 2].map((corner) => mesh.indices[triangle * 3 + corner] * 3);
    const x = (mesh.positions[a] + mesh.positions[b] + mesh.positions[c]) / 3;
    const y = (mesh.positions[a + 1] + mesh.positions[b + 1] + mesh.positions[c + 1]) / 3;
    if (!insideFootprint(x, y)) outside += 1;
  }
  return outside;
}

describe("a flat face meshed outside its outline (#740)", () => {
  it("leaves the disc as it is at sizes the kernel takes", () => {
    const solid = discSolid();
    expect(cad.isSolid(solid)).toBe(true);
    const edges = topEdges(solid);
    expect(edges).toHaveLength(250);
    for (const size of [0.3, 0.6, 0.7]) {
      const filleted = cad.fillet(solid, edges, size);
      expect(trianglesOutsideDisc(filleted), `${size} mm`).toBe(0);
      expect(cadFlatFaceMeshStraysFromOutline(cad, filleted), `${size} mm`).toBe(false);
    }
  });

  it("says so for every size where the mesh has triangles outside the disc, and only then", () => {
    const solid = discSolid();
    const edges = topEdges(solid);
    for (const size of [0.3, 0.7, 0.79, 0.8, 0.85, 0.9]) {
      const filleted = cad.fillet(solid, edges, size);
      expect(cadFlatFaceMeshStraysFromOutline(cad, filleted), `${size} mm`).toBe(trianglesOutsideDisc(filleted) > 0);
    }
  });
});
