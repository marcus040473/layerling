/**
 * A surface texture on a shape (see surfaceTexture.ts): the body's mesh goes
 * in, and a mesh body with the relief takes its place, remembering the
 * settings it was made with. Like wrapping around a cylinder, it is a step
 * one takes; undo takes it back.
 *
 * The texture is computed on a worker of its own: a large body takes a few
 * seconds, and the editor stays usable meanwhile.
 */

import { isBuildMessage, reportWorkerBuild } from "@/lib/buildStamp";
import { MIN_SHAPE_DIMENSION, cleanModelDimension, meshForShape } from "@/lib/editorMeshCore";
import { t, type MessageKey } from "@/lib/i18n";
import {
  applySurfaceTexture,
  normalizeSurfaceTexture,
  surfaceTexturePositions,
  type SurfaceTextureDetail,
  type SurfaceTextureDirection,
  type SurfaceTexturePattern,
  type SurfaceTextureProfile,
  type SurfaceTextureProjection,
  type SurfaceTextureSettings,
  type SurfaceTextureStats,
} from "@/lib/surfaceTexture";
import { canonicalizeShape, cleanNearZero, isNonSolidShapeKind } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/layerling";

export type SurfaceTextureWorkerRequest = {
  requestId: number;
  /** The body's triangles, nine numbers each, in the editor's inside frame. */
  positions: Float64Array;
  settings: SurfaceTextureSettings;
  maxTriangles?: number;
};

export type SurfaceTextureWorkerResponse =
  | { requestId: number; positions: Float64Array; stats: SurfaceTextureStats }
  | { requestId: number; error: string };

export type SurfaceTextureOutcome = { positions: Float64Array; stats: SurfaceTextureStats };

/** The words for every choice, as the panel and the status line show them. */
export const SURFACE_TEXTURE_LABELS: {
  pattern: Record<SurfaceTexturePattern, MessageKey>;
  profile: Record<SurfaceTextureProfile, MessageKey>;
  direction: Record<SurfaceTextureDirection, MessageKey>;
  projection: Record<SurfaceTextureProjection, MessageKey>;
  projectionHint: Record<SurfaceTextureProjection, MessageKey>;
  detail: Record<SurfaceTextureDetail, MessageKey>;
} = {
  pattern: { grooves: "surfaceTexture.grooves", knurl: "surfaceTexture.knurl", honeycomb: "surfaceTexture.honeycomb", bumps: "surfaceTexture.bumps" },
  profile: { round: "surfaceTexture.round", pointed: "surfaceTexture.pointed", flat: "surfaceTexture.flat" },
  direction: { inward: "surfaceTexture.inward", outward: "surfaceTexture.outward", both: "surfaceTexture.both" },
  projection: { cylinder: "surfaceTexture.cylinder", allRound: "surfaceTexture.allRound", flat: "surfaceTexture.flatProjection" },
  projectionHint: { cylinder: "surfaceTexture.cylinderHint", allRound: "surfaceTexture.allRoundHint", flat: "surfaceTexture.flatHint" },
  detail: { coarse: "surfaceTexture.coarse", medium: "surfaceTexture.medium", fine: "surfaceTexture.fine" },
};

/** The pattern's name in the current language. */
export function surfacePatternLabel(pattern: SurfaceTexturePattern) {
  return t(SURFACE_TEXTURE_LABELS.pattern[pattern] ?? "surfaceTexture.knurl");
}

/** Whether a texture can go on this shape: one solid body, not locked, and not textured already (undo takes a texture back). */
export function canTextureSurface(shape: WorkplaneShape | null | undefined) {
  return Boolean(shape && !shape.locked && !shape.surfaceTexture && shape.groupOperation !== "bundle" && !isNonSolidShapeKind(shape.kind));
}

/** Whether the panel shows the texture card for this shape: for every solid body, textured ones say what they carry. */
export function offersSurfaceTexture(shape: WorkplaneShape | null | undefined) {
  return Boolean(shape && shape.groupOperation !== "bundle" && !isNonSolidShapeKind(shape.kind));
}

/** The body's triangles as the texture takes them: nine numbers each, where they stand in the design (inside frame). */
export function surfaceTextureInput(shape: WorkplaneShape) {
  const mesh = meshForShape(shape);
  const out = new Float64Array(mesh.faces.length * 9);
  mesh.faces.forEach((face, index) => {
    for (let k = 0; k < 3; k += 1) {
      const [x, y, z] = mesh.vertices[face[k]];
      out[index * 9 + k * 3] = x;
      out[index * 9 + k * 3 + 1] = y;
      out[index * 9 + k * 3 + 2] = z;
    }
  });
  return out;
}

/** Texture a body's triangles here and now (tests, and where no worker can run). */
export function textureSurfacePositions(positions: Float64Array, settings: SurfaceTextureSettings, maxTriangles?: number): SurfaceTextureOutcome {
  const result = applySurfaceTexture(positions, settings, maxTriangles ? { maxTriangles } : {});
  return { positions: Float64Array.from(surfaceTexturePositions(result)), stats: result.stats };
}

/**
 * The shape the texture makes: a mesh body in place of the old one, standing where it stood
 * (its box centred on the old box, its bottom on the old bottom), with the settings it got.
 * Turns and mirroring are in the mesh already; the new body starts upright. Null when the
 * texture left nothing.
 */
export function surfaceTexturedShape(shape: WorkplaneShape, positions: ArrayLike<number>, settings: SurfaceTextureSettings): WorkplaneShape | null {
  if (positions.length < 9) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const local = new Array<number>(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    local[i] = positions[i] - centerX;
    local[i + 1] = positions[i + 1] - minY;
    local[i + 2] = positions[i + 2] - centerZ;
  }
  const rawWidth = Math.max(MIN_SHAPE_DIMENSION, maxX - minX);
  const rawDepth = Math.max(MIN_SHAPE_DIMENSION, maxZ - minZ);
  const rawHeight = Math.max(MIN_SHAPE_DIMENSION, maxY - minY);
  const width = cleanModelDimension(rawWidth);
  const depth = cleanModelDimension(rawDepth);
  return canonicalizeShape({
    id: shape.id,
    name: shape.name,
    kind: "mesh",
    color: shape.color,
    hole: shape.hole || undefined,
    x: cleanNearZero(centerX, 0.0005),
    z: cleanNearZero(centerZ, 0.0005),
    elevation: cleanNearZero(minY, 0.0005),
    size: Math.max(width, depth),
    width,
    depth,
    height: cleanModelDimension(rawHeight),
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    importedMesh: {
      positions: local,
      baseWidth: rawWidth,
      baseDepth: rawDepth,
      baseHeight: rawHeight,
      triangleCount: Math.floor(local.length / 9),
      sourceFormat: "json",
    },
    surfaceTexture: normalizeSurfaceTexture(settings),
    locked: false,
    hidden: shape.hidden,
  });
}

let worker: Worker | null = null;
let requestCounter = 0;
const pending = new Map<number, { resolve: (outcome: SurfaceTextureOutcome) => void; reject: (error: Error) => void; timer: number }>();

/** How long a texture may take before the editor gives up on it. */
const SURFACE_TEXTURE_TIMEOUT_MS = 120_000;

function ensureWorker() {
  if (worker) return worker;
  const next = new Worker(new URL("../workers/surfaceTexture.worker.ts", import.meta.url), { type: "module" });
  next.onmessage = (event: MessageEvent<SurfaceTextureWorkerResponse>) => {
    if (isBuildMessage(event.data)) {
      reportWorkerBuild(event.data);
      return;
    }
    const entry = pending.get(event.data.requestId);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    pending.delete(event.data.requestId);
    if ("error" in event.data) entry.reject(new Error(event.data.error));
    else entry.resolve({ positions: event.data.positions, stats: event.data.stats });
  };
  next.onerror = () => {
    pending.forEach((entry) => {
      window.clearTimeout(entry.timer);
      entry.reject(new Error("The surface texture worker stopped"));
    });
    pending.clear();
    next.terminate();
    worker = null;
  };
  worker = next;
  return next;
}

/** Texture a body's triangles on the worker; where none can run, right here. */
export function textureSurfaceOffThread(positions: Float64Array, settings: SurfaceTextureSettings, maxTriangles?: number): Promise<SurfaceTextureOutcome> {
  if (typeof Worker === "undefined" || typeof window === "undefined") {
    try {
      return Promise.resolve(textureSurfacePositions(positions, settings, maxTriangles));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
  const target = ensureWorker();
  const requestId = ++requestCounter;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("The surface texture took too long"));
    }, SURFACE_TEXTURE_TIMEOUT_MS);
    pending.set(requestId, { resolve, reject, timer });
    const request: SurfaceTextureWorkerRequest = { requestId, positions, settings, ...(maxTriangles ? { maxTriangles } : {}) };
    target.postMessage(request, [positions.buffer]);
  });
}
