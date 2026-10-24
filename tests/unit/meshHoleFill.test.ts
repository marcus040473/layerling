import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { manifoldFromMeshData, meshDataToManifoldMesh, takeHoleFillTally } from "@/lib/editorBooleans";
import type { MeshData } from "@/lib/editorMeshCore";
import { closeSmallMeshHoles } from "@/lib/meshHoleFill";

let runtime: ManifoldToplevel;

beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
});

/** A 10 mm cube cut into `segments` cells a side, every triangle with its own corners, as an OBJ brings it. */
function cubeMesh(segments: number): MeshData {
  const geometry = new THREE.BoxGeometry(10, 10, 10, segments, segments, segments).toNonIndexed();
  const positions = geometry.getAttribute("position").array as Float32Array;
  const vertices: [number, number, number][] = [];
  const faces: [number, number, number][] = [];
  for (let i = 0; i < positions.length; i += 9) {
    const start = vertices.length;
    vertices.push([positions[i], positions[i + 1], positions[i + 2]], [positions[i + 3], positions[i + 4], positions[i + 5]], [positions[i + 6], positions[i + 7], positions[i + 8]]);
    faces.push([start, start + 1, start + 2]);
  }
  return { name: "cube", vertices, faces };
}

/** The mesh without the faces `drop` picks. */
function without(mesh: MeshData, drop: (index: number) => boolean): MeshData {
  return { ...mesh, faces: mesh.faces.filter((_, index) => !drop(index)) };
}

function solidVolume(mesh: MeshData) {
  const solid = runtime.Manifold.ofMesh(meshDataToManifoldMesh(runtime, mesh));
  try {
    return { status: solid.status(), volume: solid.volume() };
  } finally {
    solid.delete();
  }
}

describe("closing small holes of an open mesh (#791)", () => {
  it("caps a small opening so the kernel takes the mesh, turned the right way", () => {
    const open = without(cubeMesh(30), (index) => index < 2);
    expect(() => solidVolume(open)).toThrow();
    const repair = closeSmallMeshHoles(open);
    expect(repair).toMatchObject({ closed: 1, open: 0 });
    const solid = solidVolume(repair.mesh);
    expect(solid.status).toBe("NoError");
    expect(solid.volume).toBeCloseTo(1000, 0);
  });

  it("closes each of several openings, and leaves a closed mesh as it is", () => {
    const closedMesh = cubeMesh(30);
    expect(closeSmallMeshHoles(closedMesh)).toEqual({ mesh: closedMesh, closed: 0, open: 0 });
    const twoHoles = without(closedMesh, (index) => index < 2 || index === 500 || index === 501);
    const repair = closeSmallMeshHoles(twoHoles);
    expect(repair.closed).toBe(2);
    expect(solidVolume(repair.mesh).volume).toBeCloseTo(1000, 0);
  });

  it("caps a flat opening of any size, such as a missing side", () => {
    const repair = closeSmallMeshHoles(without(cubeMesh(1), (index) => index < 2));
    expect(repair).toMatchObject({ closed: 1, open: 0 });
    expect(solidVolume(repair.mesh).volume).toBeCloseTo(1000, 3);
  });

  it("leaves a large opening whose rim bends open", () => {
    // Two sides of the cube that meet in an edge are missing: the rim runs round a corner.
    const missingCorner = without(cubeMesh(1), (index) => index < 2 || index === 4 || index === 5);
    const repair = closeSmallMeshHoles(missingCorner);
    expect(repair).toMatchObject({ closed: 0, open: 1 });
    expect(repair.mesh).toBe(missingCorner);
  });

  it("builds the solid of an open mesh through the kernel and says how many holes it closed", () => {
    takeHoleFillTally();
    const solid = manifoldFromMeshData(runtime, without(cubeMesh(30), (index) => index < 2));
    try {
      expect(solid.status()).toBe("NoError");
      expect(solid.volume()).toBeCloseTo(1000, 0);
    } finally {
      solid.delete();
    }
    expect(takeHoleFillTally()).toEqual({ closed: 1, open: 0 });
    expect(() => manifoldFromMeshData(runtime, without(cubeMesh(1), (index) => index < 2 || index === 4 || index === 5))).toThrow();
    expect(takeHoleFillTally()).toEqual({ closed: 0, open: 1 });
  });
});
