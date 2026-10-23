
import { t } from "@/lib/i18n";
import { isBuildMessage, reportWorkerBuild } from "@/lib/buildStamp";
import { cloneSketchProfile } from "@/lib/sketchSmoothHandles";
import { canonicalizeShape, cleanNearZero } from "@/lib/workplaneShapes";
import { SKETCH_CAD_DEFLECTION } from "@/lib/cadModifierRuntime";
import { createLocalId } from "@/lib/localIds";
import { revolveProfileFitsAxis } from "@/lib/cadSketchRevolve";
import { buildSketchRevolveMesh, normalizeSketchRevolveSettings } from "@/lib/sketchRevolve";
import { placementWorkplaneCoordinates, type PlacementWorkplane } from "@/lib/placementWorkplane";
import { silhouetteSketchProfile } from "@/lib/sketchCadProfile";
import { sweepPlan } from "@/lib/cadSketchSweep";
import { filledGrowPockets, strokedSketchProfile } from "@/lib/sketchStroke";
import { keyringSketchProfile } from "@/lib/sketchKeyring";
import type { ManifoldToplevel } from "manifold-3d";
import type { CadModifierDeflection } from "@/lib/cadModifierTypes";
import { SKETCH_INSET_UNSUPPORTED, SKETCH_STROKE_UNSUPPORTED, type SketchCadBuildResponse } from "@/lib/sketchCadTypes";
import { insetSketchProfile } from "@/lib/faceTool";
import type { SketchInset, SketchOperation, SketchProfile, SketchRevolveSettings, SketchStroke, WorkplaneShape } from "@/types/layerling";
import { MIN_SHAPE_DIMENSION, cleanModelDimension, getManifoldRuntime, meshForShape } from "@/lib/editorMeshCore";

export function emptySketchProfile(): SketchProfile {
  return { points: [], segments: [], images: [] };
}

let sketchCadWorker: Worker | null = null;

let sketchCadRequestId = 0;

const sketchCadPending = new Map<number, {
  resolve: (response: SketchCadBuildResponse) => void;
  reject: (error: Error) => void;
  timer: number;
}>();

function ensureSketchCadWorker() {
  if (sketchCadWorker) return sketchCadWorker;
  const worker = new Worker(new URL("../workers/sketchCad.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<SketchCadBuildResponse>) => {
    if (isBuildMessage(event.data)) {
      reportWorkerBuild(event.data);
      return;
    }
    const pending = sketchCadPending.get(event.data.requestId);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    sketchCadPending.delete(event.data.requestId);
    pending.resolve(event.data);
  };
  worker.onerror = () => {
    sketchCadPending.forEach((pending) => {
      window.clearTimeout(pending.timer);
      // Most often the page outlived an update and its worker file is gone.
      pending.reject(new Error(t("edge.errorWorkerFailed")));
    });
    sketchCadPending.clear();
    worker.terminate();
    sketchCadWorker = null;
  };
  sketchCadWorker = worker;
  return worker;
}

export async function cadShapeFromSketchProfile(profile: SketchProfile, height: number, existing?: WorkplaneShape | null) {
  const safeHeight = Math.max(MIN_SHAPE_DIMENSION, height);
  // A silhouette leaves its holes out first, so its outer line runs round the outside only (#197).
  const buildProfile = profile.silhouette ? silhouetteSketchProfile(profile) : profile;
  const buildOnWorker = (build: SketchProfile, stroke?: SketchStroke, inset?: SketchInset) => {
    const worker = ensureSketchCadWorker();
    const requestId = ++sketchCadRequestId;
    return new Promise<SketchCadBuildResponse>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        sketchCadPending.delete(requestId);
        reject(new Error("OpenCascade timed out while building the sketch"));
      }, 30_000);
      sketchCadPending.set(requestId, { resolve, reject, timer });
      worker.postMessage({ type: "build", requestId, profile: cloneSketchProfile(build), height: safeHeight, ...(stroke ? { stroke } : {}), ...(inset ? { inset } : {}) });
    });
  };
  let response: SketchCadBuildResponse;
  // A key ring hole (#391): the outline the sketch fills with its ear and its hole is worked out here and built as an area.
  const withKeyring = profile.keyring ? keyringSketchProfile(await getManifoldRuntime(), profile) : null;
  // With No holes and a "Wider" line, parts that touch once wider can close a pocket between
  // them; without holes means without those too, as for a text (#215). Only then is the outline
  // worked out here, as the polygon stroke with its outer rings only, and built as an area.
  const pocketsFilled = profile.stroke?.align === "grow" && profile.silhouette && !profile.inset ? filledGrowPockets(await getManifoldRuntime(), buildProfile) : null;
  // A face tool body given a stroke: the stroke runs along the outline set in, built as straight lines.
  const strokedInset = profile.stroke && profile.inset ? insetSketchProfile(await getManifoldRuntime(), buildProfile, profile.inset) : null;
  if (profile.stroke && profile.inset && !strokedInset) throw new Error(t("faceTool.empty"));
  if (withKeyring) {
    response = await buildOnWorker(withKeyring);
  } else if (pocketsFilled) {
    response = await buildOnWorker(pocketsFilled);
  } else if (strokedInset && profile.stroke) {
    const stroked = strokedSketchProfile(await getManifoldRuntime(), { ...strokedInset, stroke: profile.stroke });
    if (!stroked) throw new Error(t("sketch.strokeEmpty"));
    response = await buildOnWorker(stroked);
  } else if (profile.stroke) {
    // The kernel moves the outlines of a stroked sketch itself, so its walls stay planes, arcs and
    // single curves (#154); where it cannot (open lines, bevelled corners ...), a stroked outline of
    // straight lines is worked out here and the usual extrusion builds that. The body keeps the drawn line.
    response = await buildOnWorker(buildProfile, profile.stroke);
    if (response.type === "error" && response.message === SKETCH_STROKE_UNSUPPORTED) {
      const stroked = strokedSketchProfile(await getManifoldRuntime(), buildProfile);
      if (!stroked) throw new Error(t("sketch.strokeEmpty"));
      response = await buildOnWorker(stroked);
    }
  } else if (profile.inset) {
    // The face tool's outline set in (cadSketchInset.ts): the kernel moves the lines and arcs
    // itself; where it cannot, the polygon inset of the outline is built as an area.
    response = await buildOnWorker(buildProfile, undefined, profile.inset);
    if (response.type === "error" && response.message === SKETCH_INSET_UNSUPPORTED) {
      const inset = insetSketchProfile(await getManifoldRuntime(), buildProfile, profile.inset);
      if (!inset) throw new Error(t("faceTool.empty"));
      response = await buildOnWorker(inset);
    }
  } else {
    response = await buildOnWorker(buildProfile);
  }
  if (response.type === "error") throw new Error(response.message);
  const source = canonicalizeShape({
    ...(existing ?? {
      id: createLocalId("sketch-extrusion"),
      name: "Sketch extrusion",
      kind: "mesh" as const,
      color: "#d41721",
      x: 0,
      z: 0,
      size: 1,
      width: 1,
      depth: 1,
      height: safeHeight,
      rotation: 0,
    }),
    sketchProfile: cloneSketchProfile(profile),
    sketchOperation: "extrude",
    edgeTreatments: undefined,
    edgeTreatmentHistory: undefined,
    cadDisplayEdges: undefined,
    cadDisplayEdgesVersion: undefined,
  });
  const shape = shapeFromCadMesh(source, response.positions, response.normals, response.indices, response.brep, response.deflection ?? SKETCH_CAD_DEFLECTION);
  if (!shape) throw new Error("OpenCascade returned an empty sketch solid");
  return { ...shape, sketchProfile: cloneSketchProfile(profile), sketchOperation: "extrude" as const };
}

/**
 * A sketch swept along its path (#400): the closed outlines are the cross-section, the construction
 * line the path. An exact CAD body like an extruded one, so Fillet, Chamfer and the STEP export work.
 * Throws with a sentence for what is missing or what the kernel cannot sweep.
 */
export async function cadShapeFromSketchSweep(profile: SketchProfile, existing?: WorkplaneShape | null) {
  const planned = sweepPlan(profile);
  if ("problem" in planned) {
    throw new Error(t(planned.problem === "no-profile" ? "sketch.sweepNoProfile" : planned.problem === "no-path" ? "sketch.sweepNoPath" : "sketch.sweepManyPaths"));
  }
  const worker = ensureSketchCadWorker();
  const requestId = ++sketchCadRequestId;
  const response = await new Promise<SketchCadBuildResponse>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      sketchCadPending.delete(requestId);
      reject(new Error("OpenCascade timed out while building the sketch"));
    }, 30_000);
    sketchCadPending.set(requestId, { resolve, reject, timer });
    worker.postMessage({ type: "build", requestId, profile: cloneSketchProfile(profile), height: MIN_SHAPE_DIMENSION, sweep: true });
  });
  if (response.type === "error") throw new Error(t("sketch.sweepFailed"));
  const source = canonicalizeShape({
    ...(existing ?? {
      id: createLocalId("sketch-sweep"),
      name: "Sketch sweep",
      kind: "mesh" as const,
      color: "#3d8fb5",
      x: 0,
      z: 0,
      size: 1,
      width: 1,
      depth: 1,
      height: MIN_SHAPE_DIMENSION,
      rotation: 0,
    }),
    sketchProfile: cloneSketchProfile(profile),
    sketchOperation: "sweep",
    edgeTreatments: undefined,
    edgeTreatmentHistory: undefined,
    cadDisplayEdges: undefined,
    cadDisplayEdgesVersion: undefined,
  });
  const shape = shapeFromCadMesh(source, response.positions, response.normals, response.indices, response.brep, response.deflection ?? SKETCH_CAD_DEFLECTION);
  if (!shape) throw new Error(t("sketch.sweepFailed"));
  return { ...shape, sketchProfile: cloneSketchProfile(profile), sketchOperation: "sweep" as const };
}

/**
 * A revolved sketch as an exact CAD body, like an extruded one: the profile is turned about the
 * axis by OpenCascade, so Hollow, Fillet and Chamfer work on it and it has a few hundred
 * triangles, not tens of thousands (#167). Null when the profile cannot be built that way (it
 * crosses the axis) or the kernel refuses; the mesh revolve takes over then.
 */
/**
 * What a revolve turns: the sketch as drawn, or, with a stroke, the band the line makes - an open
 * line of a width turns into a thin wall, as a vase is drawn in Tinkercad (#347). The band is
 * cut off at the axis. The body keeps the drawn line, as an extruded stroke does.
 */
export function revolveBuildProfile(runtime: ManifoldToplevel, profile: SketchProfile): SketchProfile {
  if (!profile.stroke) return profile;
  const stroked = strokedSketchProfile(runtime, profile, { clipToRevolveSide: true });
  if (!stroked) throw new Error(t("sketch.strokeEmpty"));
  return stroked;
}

async function cadShapeFromSketchRevolve(
  profile: SketchProfile,
  settings: SketchRevolveSettings,
  existing?: WorkplaneShape | null,
  drawn: SketchProfile = profile,
): Promise<WorkplaneShape | null> {
  // A helix has no exact body yet; the mesh revolve winds it.
  if (!revolveProfileFitsAxis(profile) || settings.pitch) return null;
  try {
    const worker = ensureSketchCadWorker();
    const requestId = ++sketchCadRequestId;
    const response = await new Promise<SketchCadBuildResponse>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        sketchCadPending.delete(requestId);
        reject(new Error("OpenCascade timed out while building the sketch"));
      }, 30_000);
      sketchCadPending.set(requestId, { resolve, reject, timer });
      worker.postMessage({
        type: "build",
        requestId,
        profile: cloneSketchProfile(profile),
        height: MIN_SHAPE_DIMENSION,
        revolve: { startAngle: settings.startAngle, sweepAngle: settings.sweepAngle },
      });
    });
    if (response.type === "error") return null;
    const source = canonicalizeShape({
      id: existing?.id ?? createLocalId("sketch-revolve"),
      name: existing?.name ?? "Sketch revolve",
      kind: "mesh",
      color: existing?.color ?? "#78b96b",
      hole: existing?.hole,
      x: 0,
      z: 0,
      elevation: 0,
      size: 1,
      width: 1,
      depth: 1,
      height: MIN_SHAPE_DIMENSION,
      rotation: 0,
      sketchProfile: cloneSketchProfile(drawn),
      sketchOperation: "revolve",
      sketchRevolve: settings,
      locked: existing?.locked ?? false,
      hidden: existing?.hidden ?? false,
    } satisfies WorkplaneShape);
    const shape = shapeFromCadMesh(source, response.positions, response.normals, response.indices, response.brep, response.deflection ?? SKETCH_CAD_DEFLECTION);
    if (!shape) return null;
    // Like the mesh revolve: the body stands at the origin (or where the edited one stood); the
    // exact body keeps its own frame, so it follows the move.
    return canonicalizeShape({
      ...shape,
      x: existing?.x ?? 0,
      z: existing?.z ?? 0,
      elevation: existing?.elevation ?? 0,
      sketchProfile: cloneSketchProfile(drawn),
      sketchOperation: "revolve",
      sketchRevolve: settings,
    });
  } catch {
    return null;
  }
}

export async function shapeFromRevolvedSketchProfile(
  profile: SketchProfile,
  settings: Partial<SketchRevolveSettings>,
  existing?: WorkplaneShape | null,
) {
  const runtime = await getManifoldRuntime();
  const buildProfile = revolveBuildProfile(runtime, profile);
  const exact = await cadShapeFromSketchRevolve(buildProfile, normalizeSketchRevolveSettings(settings), existing, profile);
  if (exact) return exact;
  const normalizedSettings = normalizeSketchRevolveSettings(settings);
  const mesh = buildSketchRevolveMesh(runtime, buildProfile, normalizedSettings);
  return canonicalizeShape({
    id: existing?.id ?? createLocalId("sketch-revolve"),
    name: existing?.name ?? "Sketch revolve",
    kind: "mesh",
    color: existing?.color ?? "#78b96b",
    hole: existing?.hole,
    x: existing?.x ?? 0,
    z: existing?.z ?? 0,
    elevation: existing?.elevation ?? 0,
    size: Math.max(mesh.width, mesh.depth),
    width: mesh.width,
    depth: mesh.depth,
    height: mesh.height,
    rotation: existing?.rotation ?? 0,
    rotationX: existing?.rotationX ?? 0,
    rotationZ: existing?.rotationZ ?? 0,
    mirrorX: existing?.mirrorX,
    mirrorY: existing?.mirrorY,
    mirrorZ: existing?.mirrorZ,
    importedMesh: {
      positions: mesh.positions,
      baseWidth: mesh.width,
      baseDepth: mesh.depth,
      baseHeight: mesh.height,
      triangleCount: mesh.triangleCount,
      sourceFormat: "json",
    },
    sketchProfile: cloneSketchProfile(profile),
    sketchOperation: "revolve",
    sketchRevolve: normalizedSettings,
    locked: existing?.locked ?? false,
    hidden: existing?.hidden ?? false,
  } satisfies WorkplaneShape);
}

export function shapeFromCadMesh(
  source: WorkplaneShape,
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
  brep: string,
  deflection?: CadModifierDeflection,
): WorkplaneShape | null {
  if (positions.length < 9 || indices.length < 3) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]);
    minY = Math.min(minY, positions[index + 1]);
    minZ = Math.min(minZ, positions[index + 2]);
    maxX = Math.max(maxX, positions[index]);
    maxY = Math.max(maxY, positions[index + 1]);
    maxZ = Math.max(maxZ, positions[index + 2]);
  }
  if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) return null;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const rawWidth = Math.max(MIN_SHAPE_DIMENSION, maxX - minX);
  const rawHeight = Math.max(MIN_SHAPE_DIMENSION, maxY - minY);
  const rawDepth = Math.max(MIN_SHAPE_DIMENSION, maxZ - minZ);
  const flattenedPositions: number[] = [];
  const flattenedNormals: number[] = [];
  for (let index = 0; index < indices.length; index += 1) {
    const vertex = indices[index] * 3;
    flattenedPositions.push(positions[vertex] - centerX, positions[vertex + 1] - minY, positions[vertex + 2] - centerZ);
    if (normals.length >= vertex + 3) flattenedNormals.push(normals[vertex], normals[vertex + 1], normals[vertex + 2]);
  }
  const width = cleanModelDimension(rawWidth);
  const height = cleanModelDimension(rawHeight);
  const depth = cleanModelDimension(rawDepth);
  return canonicalizeShape({
    ...source,
    kind: "mesh",
    x: cleanNearZero(centerX, 0.0005),
    z: cleanNearZero(centerZ, 0.0005),
    elevation: cleanNearZero(minY, 0.0005),
    width,
    depth,
    height,
    size: Math.max(width, depth),
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    mirrorX: undefined,
    mirrorY: undefined,
    mirrorZ: undefined,
    radius: undefined,
    // The CAD result is already generated from the final tapered surface. Do
    // not carry the parametric taper fields onto this baked mesh or the viewport
    // and subsequent mesh exports will apply the deformation a second time.
    taperTopWidth: undefined,
    taperTopDepth: undefined,
    taperBottomWidth: undefined,
    taperBottomDepth: undefined,
    taperTopScale: undefined,
    taperBottomScale: undefined,
    // Twist and lean are in the mesh as well, so they go the way the taper does.
    extrudeTwist: undefined,
    extrudeTopOffsetX: undefined,
    extrudeTopOffsetZ: undefined,
    importedMesh: {
      positions: flattenedPositions,
      normals: flattenedNormals.length === flattenedPositions.length ? flattenedNormals : undefined,
      baseWidth: rawWidth,
      baseDepth: rawDepth,
      baseHeight: rawHeight,
      triangleCount: Math.floor(indices.length / 3),
      sourceFormat: "json",
    },
    imagePlate: undefined,
    cadBrep: brep,
    cadMeshDeflection: deflection ?? source.cadMeshDeflection,
    cadBrepFrame: {
      x: cleanNearZero(centerX, 0.0005),
      z: cleanNearZero(centerZ, 0.0005),
      elevation: cleanNearZero(minY, 0.0005),
      width,
      depth,
      height,
    },
    cadPrimitiveFrame: undefined,
  });
}

export function sketchReferenceShapeOnWorkplane(shape: WorkplaneShape, workplane: PlacementWorkplane): WorkplaneShape {
  const mesh = meshForShape(shape);
  const projectedVertices = mesh.vertices.map(([x, y, z]) => {
    const local = placementWorkplaneCoordinates(workplane, { x, y, z });
    return { x: local.x, y: -local.y, z: local.z };
  });
  // A loop, not Math.min(...list): a large imported mesh has more points than a call takes
  // arguments, and the spread overflowed the stack when the design was opened (#190).
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const vertex of projectedVertices) {
    if (vertex.x < minX) minX = vertex.x;
    if (vertex.x > maxX) maxX = vertex.x;
    if (vertex.y < minY) minY = vertex.y;
    if (vertex.y > maxY) maxY = vertex.y;
    if (vertex.z < minZ) minZ = vertex.z;
    if (vertex.z > maxZ) maxZ = vertex.z;
  }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const positions = mesh.faces.flatMap(([a, b, c]) => [a, b, c].flatMap((index) => {
    const vertex = projectedVertices[index];
    return [vertex.x - centerX, vertex.y - centerY, vertex.z - centerZ];
  }));
  const width = Math.max(0.01, maxX - minX);
  const depth = Math.max(0.01, maxZ - minZ);
  const height = Math.max(0.01, maxY - minY);

  return canonicalizeShape({
    ...shape,
    kind: "mesh",
    x: centerX,
    z: centerZ,
    elevation: 0,
    size: Math.max(width, depth),
    width,
    depth,
    height,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    mirrorX: undefined,
    mirrorY: undefined,
    mirrorZ: undefined,
    importedMesh: {
      positions,
      baseWidth: width,
      baseDepth: depth,
      baseHeight: height,
      triangleCount: mesh.faces.length,
      sourceFormat: "json",
    },
    groupedShapes: undefined,
    edgeTreatments: undefined,
    edgeTreatmentHistory: undefined,
    cadDisplayEdges: undefined,
    cadBrep: undefined,
    cadBrepFrame: undefined,
    cadPrimitiveFrame: undefined,
  });
}

export function defaultMcpSketchProfile(width: number, depth: number): SketchProfile {
  const halfWidth = Math.max(0.01, width) / 2;
  const halfDepth = Math.max(0.01, depth) / 2;
  const pointIds = ["mcp-sketch-a", "mcp-sketch-b", "mcp-sketch-c", "mcp-sketch-d"].map((prefix) => createLocalId(prefix));
  return {
    points: [
      { id: pointIds[0], x: -halfWidth, z: -halfDepth, mode: "corner" },
      { id: pointIds[1], x: halfWidth, z: -halfDepth, mode: "corner" },
      { id: pointIds[2], x: halfWidth, z: halfDepth, mode: "corner" },
      { id: pointIds[3], x: -halfWidth, z: halfDepth, mode: "corner" },
    ],
    segments: [
      { id: createLocalId("mcp-sketch-segment"), startId: pointIds[0], endId: pointIds[1], kind: "line" },
      { id: createLocalId("mcp-sketch-segment"), startId: pointIds[1], endId: pointIds[2], kind: "line" },
      { id: createLocalId("mcp-sketch-segment"), startId: pointIds[2], endId: pointIds[3], kind: "line" },
      { id: createLocalId("mcp-sketch-segment"), startId: pointIds[3], endId: pointIds[0], kind: "line" },
    ],
    images: [],
  };
}

/** The kind of body a sketch body was made as; bodies from before `sketchOperation` was kept tell it by their revolve settings. */
export function sketchBodyOperation(shape: WorkplaneShape): SketchOperation {
  return shape.sketchOperation ?? (shape.sketchRevolve ? "revolve" : "extrude");
}

/**
 * An outline moved left until its rightmost point lies on a revolve's axis, x = 0 (#655): an imported SVG
 * is centred on itself, so the half cross-section of a vase would reach across the axis. Pictures and a
 * key ring hole move with it; an outline already left of the axis stays where it is.
 */
export function sketchProfileLeftOfAxis(profile: SketchProfile): SketchProfile {
  if (!profile.points.length) return profile;
  const shift = Math.max(...profile.points.map((point) => point.x));
  if (shift <= 1e-6) return profile;
  const move = (point: { x: number; z: number }) => ({ x: point.x - shift, z: point.z });
  return {
    ...profile,
    points: profile.points.map((point) => ({
      ...point,
      x: point.x - shift,
      ...(point.handleIn ? { handleIn: move(point.handleIn) } : {}),
      ...(point.handleOut ? { handleOut: move(point.handleOut) } : {}),
    })),
    images: (profile.images ?? []).map((image) => ({ ...image, x: image.x - shift })),
    ...(profile.keyring ? { keyring: { ...profile.keyring, x: profile.keyring.x - shift } } : {}),
  };
}

/**
 * A sketch body made again from its outline as another kind of body (#655): an imported SVG comes in
 * extruded, revolved it gives a vase. The new body takes the old one's place, name and colour and stands
 * where it stood, its foot at the same height. A revolve takes the outline left of its axis; an extrusion
 * made from another kind is 10 mm high, as a new sketch is. Edge treatments go, as when a sketch is edited.
 */
export async function sketchBodyAsOperation(
  existing: WorkplaneShape,
  profile: SketchProfile,
  operation: SketchOperation,
  revolveSettings: Partial<SketchRevolveSettings> = existing.sketchRevolve ?? {},
) {
  const built = operation === "revolve"
    ? await shapeFromRevolvedSketchProfile(sketchProfileLeftOfAxis(profile), revolveSettings, null)
    : operation === "sweep"
      ? await cadShapeFromSketchSweep(profile, null)
      : await cadShapeFromSketchProfile(profile, 10, null);
  if (!built) return null;
  return canonicalizeShape({
    ...built,
    id: existing.id,
    name: existing.name,
    color: existing.color,
    hole: existing.hole,
    x: existing.x,
    z: existing.z,
    elevation: existing.elevation ?? 0,
    rotation: existing.rotation,
    locked: existing.locked,
    hidden: existing.hidden,
  });
}
