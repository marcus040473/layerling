import { afterEach, describe, expect, it, vi } from "vitest";
import { exportMeshesTo3mf, exportMeshesTo3mfAsync, type ThreeMfExportMesh } from "@/lib/threemfExport";

/** The 3MF packed by fflate's workers is the same file, byte for byte, as the one packed on the page. */
function sphere(name: string, rings: number): ThreeMfExportMesh {
  const vertices: Array<[number, number, number]> = [];
  const faces: Array<[number, number, number]> = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    for (let segment = 0; segment < rings * 2; segment += 1) {
      const theta = (ring / rings) * Math.PI;
      const phi = (segment / (rings * 2)) * Math.PI * 2;
      vertices.push([10 * Math.sin(theta) * Math.cos(phi), 10 * Math.cos(theta) + 10, 10 * Math.sin(theta) * Math.sin(phi)]);
    }
  }
  const at = (ring: number, segment: number) => ring * rings * 2 + (segment % (rings * 2));
  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < rings * 2; segment += 1) {
      faces.push([at(ring, segment), at(ring + 1, segment + 1), at(ring + 1, segment)]);
      faces.push([at(ring, segment), at(ring, segment + 1), at(ring + 1, segment + 1)]);
    }
  }
  return { name, vertices, faces, color: "#d97813" };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("3MF packed off the page", () => {
  it("is the same file as packed on the page", async () => {
    // The zip records the time it was packed; both are packed at the same moment.
    vi.useFakeTimers({ now: new Date(2026, 9, 23, 12, 0, 0), toFake: ["Date"] });
    const meshes = [sphere("Ball", 80), { ...sphere("Small", 12), color: "#2266aa" }];
    const onPage = exportMeshesTo3mf(meshes, { title: "Test" });
    const offPage = await exportMeshesTo3mfAsync(meshes, { title: "Test" });
    expect(offPage.length).toBe(onPage.length);
    expect(Buffer.from(offPage).equals(Buffer.from(onPage))).toBe(true);
  });
});
