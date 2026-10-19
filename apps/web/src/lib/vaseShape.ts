import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildVase, type VaseMesh } from "@/lib/vase/vase-geometry.mjs";
import { vaseSettingsInFrame, type VaseSettings } from "@/lib/vaseSettings";

/**
 * The vase, a shape of its own: a body from a body form (a preset or drawn), a
 * cross-section (circle, polygon, wave or drawn), twist and sway, solid for the
 * slicer's vase mode or hollow with a wall, and a relief of grooves, stripes,
 * Voronoi cells or facets. The settings and the body come from the vase tool's
 * core (lib/vase, shared with the stand-alone vase tool), so both build the
 * same vase.
 *
 * The body fills the shape's frame: it is built as tall as the frame and as
 * wide as its larger side, then fitted exactly into width, depth and height -
 * resizing the shape resizes the vase, and a wall stays as thick as set
 * unless the frame is stretched unevenly.
 *
 * Frame as the knurl's: centred on x and z, from y = 0 to the height.
 */

const builtCache = new Map<string, VaseMesh>();

/** The core's mesh for these settings; the last few are kept (the frame and the fitted mesh both ask). */
function buildVaseCached(settings: VaseSettings): VaseMesh {
  const key = JSON.stringify(settings);
  const known = builtCache.get(key);
  if (known) {
    builtCache.delete(key);
    builtCache.set(key, known);
    return known;
  }
  const mesh = buildVase(settings);
  builtCache.set(key, mesh);
  while (builtCache.size > 3) builtCache.delete(builtCache.keys().next().value as string);
  return mesh;
}

type FittedVase = { positions: Float32Array; indices: Uint32Array; vertices: Float32Array; triangleCount: number; notes: string[] };

const CACHE_SIZE = 6;
const cache = new Map<string, FittedVase>();

/**
 * The vase's mesh in the shape's frame, from a small cache: the editor asks for the same body
 * for drawing, bounds, cuts and export, and building one takes a tenth of a second or more.
 * The arrays are shared; callers copy before they change them.
 */
export function fittedVaseMesh(shape: { width: number; depth: number; height: number; vase?: unknown }): FittedVase {
  const width = Math.max(0.1, shape.width);
  const depth = Math.max(0.1, shape.depth);
  const height = Math.max(0.1, shape.height);
  const settings = vaseSettingsInFrame(shape.vase, width, depth, height);
  const key = JSON.stringify([width, depth, height, settings]);
  const known = cache.get(key);
  if (known) {
    cache.delete(key);
    cache.set(key, known);
    return known;
  }
  const mesh = buildVaseCached(settings);
  const source = mesh.vertices;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < source.length; i += 3) {
    minX = Math.min(minX, source[i]); maxX = Math.max(maxX, source[i]);
    minY = Math.min(minY, source[i + 1]); maxY = Math.max(maxY, source[i + 1]);
    minZ = Math.min(minZ, source[i + 2]); maxZ = Math.max(maxZ, source[i + 2]);
  }
  // The core stands the vase on z = 0 with z up; the editor's y is up and its z points to the viewer.
  // (x, y, z) -> (x, z, -y) is a turn, not a mirror, so the triangles keep facing out.
  const sx = width / Math.max(1e-9, maxX - minX);
  const sy = height / Math.max(1e-9, maxZ - minZ);
  const sz = depth / Math.max(1e-9, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const vertices = new Float32Array(source.length);
  for (let i = 0; i < source.length; i += 3) {
    vertices[i] = (source[i] - cx) * sx;
    vertices[i + 1] = (source[i + 2] - minZ) * sy;
    vertices[i + 2] = -(source[i + 1] - cy) * sz;
  }
  const positions = new Float32Array(mesh.indices.length * 3);
  for (let t = 0; t < mesh.indices.length; t += 1) {
    const v = mesh.indices[t] * 3;
    positions[t * 3] = vertices[v];
    positions[t * 3 + 1] = vertices[v + 1];
    positions[t * 3 + 2] = vertices[v + 2];
  }
  const fitted: FittedVase = { positions, indices: mesh.indices, vertices, triangleCount: mesh.triangleCount, notes: mesh.notes ?? [] };
  cache.set(key, fitted);
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return fitted;
}

/** A new geometry of the vase (the editor disposes and moves its geometries, so each gets its own arrays). */
export function createVaseGeometry(shape: { width: number; depth: number; height: number; vase?: unknown }): THREE.BufferGeometry {
  const mesh = fittedVaseMesh(shape);
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute("position", new THREE.BufferAttribute(mesh.vertices.slice(), 3));
  indexed.setIndex(new THREE.BufferAttribute(mesh.indices.slice(), 1));
  // Smooth over the body, sharp at ribs, corners and rims - as the loft shades.
  const geometry = toCreasedNormals(indexed, THREE.MathUtils.degToRad(30));
  indexed.dispose();
  return geometry;
}

/**
 * The frame a vase with these settings fills without being stretched, as large as the given
 * frame's larger side: a hexagon is a little narrower across its flats than across its corners.
 */
export function vaseNaturalFrame(vase: unknown, width: number, depth: number, height: number) {
  const size = Math.max(width, depth);
  const settings = vaseSettingsInFrame(vase, size, size, height);
  const mesh = buildVaseCached(settings);
  const source = mesh.vertices;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < source.length; i += 3) {
    minX = Math.min(minX, source[i]); maxX = Math.max(maxX, source[i]);
    minY = Math.min(minY, source[i + 1]); maxY = Math.max(maxY, source[i + 1]);
  }
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const scale = size / Math.max(spanX, spanY);
  // The core's y is the editor's depth (z), see fittedVaseMesh.
  return { width: spanX * scale, depth: spanY * scale };
}

/** New settings for a vase, with the frame they fill unstretched (its larger side kept). */
export function vaseShapePatch(shape: { width: number; depth: number; height: number }, vase: VaseSettings) {
  const frame = vaseNaturalFrame(vase, shape.width, shape.depth, shape.height);
  return { vase, width: frame.width, depth: frame.depth, size: Math.max(frame.width, frame.depth) };
}
