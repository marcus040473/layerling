import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { disposeChildren, sharedOverlayLineMaterial, type ThreeState } from "@/components/workplane/ViewportOverlays";

/** Just what the overlay needs of the viewport: the canvas size. */
const state = { renderer: { domElement: { getBoundingClientRect: () => ({ width: 800, height: 600 }) } } } as unknown as ThreeState;

describe("overlay line materials", () => {
  it("are one material per look, so drawing the guides again compiles no shaders", () => {
    const look = { color: "#1f272e", linewidth: 1.15, opacity: 0.72, depthTest: true, dashSize: 0.625 };
    const first = sharedOverlayLineMaterial(state, look);
    expect(sharedOverlayLineMaterial(state, { ...look })).toBe(first);
    expect(sharedOverlayLineMaterial(state, { ...look, color: "#cfe1ea" })).not.toBe(first);
    expect(sharedOverlayLineMaterial(state, { ...look, dashSize: undefined })).not.toBe(first);
    expect(first.dashed).toBe(true);
    expect(first.resolution.x).toBe(800);
  });

  it("stay when a layer is cleared", () => {
    const material = sharedOverlayLineMaterial(state, { color: "#111a21", linewidth: 1.45, opacity: 1, depthTest: false });
    let disposed = false;
    material.addEventListener("dispose", () => { disposed = true; });
    const layer = new THREE.Group();
    layer.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
    disposeChildren(layer);
    expect(layer.children).toHaveLength(0);
    expect(disposed).toBe(false);
  });
});
