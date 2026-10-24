import { buildsDiffer, BUILD_ID, isBuildMessage, reportWorkerBuild } from "@/lib/buildStamp";
import { buildGroupedShapeFromSelection, exportSolidVolume, splitShapeIfCrossed, splitShapesByPlane, type ExportSolidVolume, type GroupBuildResult, type SplitShapesOutcome } from "@/lib/editorBooleans";
import { packValue, packedTransfer, unpackValue } from "@/lib/geometryTransfer";
import { resultMeshes, type GeometryTask, type GeometryWorkerRequest, type GeometryWorkerResponse } from "@/lib/geometryWorkerTypes";
import { rememberPreparedDisplay } from "@/lib/importedMeshDisplay";
import { getLanguage, t } from "@/lib/i18n";
import type { ModelSplitPlane } from "@/lib/modelSplit";
import { simplifyTrianglePositions, type SimplifiedMesh } from "@/lib/meshSimplify";
import { importedShapesFromObj, type ObjImportResult } from "@/lib/objImport";
import { importedShapeFromStl } from "@/lib/stlImport";
import type { WorkplaneShape } from "@/types/layerling";

/**
 * Grouping, cutting and splitting in workers/geometry.worker.ts, so the editor does not freeze
 * for the seconds a big cut takes (measured in docs/PERFORMANCE_MAIN_THREAD.md). The answer is the
 * one the page would have worked out itself: the same functions run there, and the shapes cross
 * as Float64Arrays (lib/geometryTransfer.ts).
 *
 * Whenever the worker cannot help, the work runs on the page as before: no Worker in this
 * browser, a worker file that will not load (an old offline copy), one from another build, or a
 * worker that dies on the way. Text stays on the page as well, its fonts live there.
 */

/** A worker that has not said hello by then is not coming. */
const GEOMETRY_WORKER_START_TIMEOUT_MS = 15_000;
/** Far longer than any cut the measurement took (4 s for a 300,000-triangle split); past it the worker is stuck. */
export const GEOMETRY_WORKER_TIMEOUT_MS = 180_000;
/** After this many crashes in one visit the page stops trying. */
const GEOMETRY_WORKER_MAX_CRASHES = 2;

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  fallback: () => Promise<unknown>;
  timer: ReturnType<typeof setTimeout>;
  sharedLists: unknown[][];
  /** Not shown as "calculating": the warm-up. */
  quiet: boolean;
  task: GeometryTask;
};

let worker: Worker | null = null;
let workerReady: Promise<Worker | null> | null = null;
let disabled = false;
let crashes = 0;
let requestCounter = 0;
const pending = new Map<number, Pending>();
const busyListeners = new Set<(busy: boolean) => void>();

function notifyBusy() {
  const busy = Array.from(pending.values()).some((entry) => !entry.quiet);
  busyListeners.forEach((listener) => listener(busy));
}

/** Told true while the worker is working on something, false when it is done. */
export function subscribeGeometryBusy(listener: (busy: boolean) => void) {
  busyListeners.add(listener);
  return () => {
    busyListeners.delete(listener);
  };
}

function settle(requestId: number) {
  const entry = pending.get(requestId);
  if (!entry) return null;
  clearTimeout(entry.timer);
  pending.delete(requestId);
  notifyBusy();
  return entry;
}

/** The worker is gone: what it still had to do runs on the page. */
function dropWorker(crashed: boolean) {
  worker?.terminate();
  worker = null;
  workerReady = null;
  if (crashed) {
    crashes += 1;
    if (crashes >= GEOMETRY_WORKER_MAX_CRASHES) disabled = true;
  }
  const orphans = Array.from(pending.keys());
  orphans.forEach((requestId) => {
    const entry = settle(requestId);
    entry?.fallback().then(entry.resolve, entry.reject);
  });
}

function startWorker(): Promise<Worker | null> {
  if (workerReady) return workerReady;
  workerReady = new Promise<Worker | null>((resolve) => {
    let created: Worker;
    try {
      created = new Worker(new URL("../workers/geometry.worker.ts", import.meta.url), { type: "module" });
    } catch {
      disabled = true;
      resolve(null);
      return;
    }
    let started = false;
    const giveUp = () => {
      if (started) return;
      started = true;
      created.terminate();
      disabled = true;
      workerReady = null;
      resolve(null);
    };
    const startTimer = setTimeout(giveUp, GEOMETRY_WORKER_START_TIMEOUT_MS);
    created.onmessage = (event: MessageEvent<GeometryWorkerResponse>) => {
      if (isBuildMessage(event.data)) {
        if (started) return;
        clearTimeout(startTimer);
        reportWorkerBuild(event.data);
        // A worker from another build may not understand this page; the page does the work itself.
        if (buildsDiffer(BUILD_ID, event.data.build)) {
          giveUp();
          return;
        }
        started = true;
        worker = created;
        resolve(created);
        return;
      }
      const response = event.data;
      const entry = settle(response.requestId);
      if (!entry) return;
      if (response.ok) {
        try {
          const result = unpackValue(response.payload, response.buffers, entry.sharedLists);
          // The view takes the geometry the worker prepared for the meshes it made.
          resultMeshes(entry.task, result).forEach((mesh, index) => {
            const display = response.displays?.[index];
            if (mesh && display) rememberPreparedDisplay(mesh, display);
          });
          entry.resolve(result);
        } catch (error) {
          entry.reject(error instanceof Error ? error : new Error(String(error)));
        }
        return;
      }
      const error = new Error(response.message);
      error.name = response.name;
      entry.reject(error);
    };
    const crash = () => {
      if (!started) {
        clearTimeout(startTimer);
        giveUp();
        return;
      }
      if (worker === created) dropWorker(true);
    };
    created.onerror = (event) => {
      event.preventDefault();
      crash();
    };
    created.onmessageerror = crash;
  });
  return workerReady;
}

/**
 * Runs a task in the worker, or `fallback` on the page when the worker cannot. A request the
 * signal calls off never answers: whoever called it off has moved on. A worker that takes longer
 * than GEOMETRY_WORKER_TIMEOUT_MS is stopped and the request answers `timedOut()`.
 */
async function runGeometryTask<T>(task: GeometryTask, args: unknown, fallback: () => Promise<T>, timedOut: () => T, signal?: AbortSignal, quiet = false): Promise<T> {
  if (disabled || typeof Worker === "undefined" || typeof window === "undefined") return fallback();
  const ready = await startWorker();
  if (!ready) return fallback();
  if (signal?.aborted) return new Promise<T>(() => {});
  const requestId = ++requestCounter;
  const packed = packValue(args);
  const request: GeometryWorkerRequest = {
    requestId,
    task,
    language: getLanguage(),
    assetBase: new URL(".", window.location.href).href,
    payload: packed.value,
    buffers: packed.buffers,
  };
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const entry = settle(requestId);
      if (!entry) return;
      // A stuck worker cannot be talked to; it goes, and the next request starts a fresh one.
      dropWorker(false);
      try {
        resolve(timedOut());
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }, GEOMETRY_WORKER_TIMEOUT_MS);
    pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject, fallback, timer, sharedLists: packed.lists, quiet, task });
    notifyBusy();
    signal?.addEventListener("abort", () => {
      if (!settle(requestId)) return;
      // Nothing else waits on it: stop the work instead of letting it run on.
      if (pending.size === 0) dropWorker(false);
    }, { once: true });
    try {
      ready.postMessage(request, packedTransfer(packed));
    } catch {
      // The arguments cannot cross (should not happen with editor shapes): the page does it.
      const entry = settle(requestId);
      entry?.fallback().then(entry.resolve, entry.reject);
    }
  });
}

/**
 * Starts the worker and loads Manifold in it while the editor is idle, as the page does for
 * itself, so the first cut does not wait for both.
 */
export function warmGeometryWorker() {
  void runGeometryTask("warm", null, async () => undefined, () => undefined, undefined, true).catch(() => undefined);
}

function containsText(shapes: readonly WorkplaneShape[]): boolean {
  return shapes.some((shape) => shape.kind === "text" || (shape.groupedShapes ? containsText(shape.groupedShapes) : false));
}

function containsKernelWork(shapes: readonly WorkplaneShape[]): boolean {
  return shapes.some((shape) => shape.hole || Boolean(shape.importedMesh) || (shape.groupedShapes ? containsKernelWork(shape.groupedShapes) : false));
}

/**
 * buildGroupedShapeFromSelection off the page. A selection without a hole or an imported mesh
 * is only put together, which is quicker done here than sent away.
 */
export function buildGroupedShapeOffThread(selected: WorkplaneShape[], triangleLimit: number, signal?: AbortSignal): Promise<GroupBuildResult> {
  const onPage = () => buildGroupedShapeFromSelection(selected, triangleLimit);
  if (containsText(selected) || !containsKernelWork(selected)) return onPage();
  return runGeometryTask<GroupBuildResult>("group", { selected, triangleLimit }, onPage, () => ({
    group: null,
    booleanSelection: [],
    hasSolid: false,
    hasHole: false,
    hasImportedMesh: false,
    consumed: false,
    failureNotice: t("status.computeTimedOut"),
  }), signal);
}

type SplitPlane = Pick<ModelSplitPlane, "axis" | "normal" | "position">;

function splitShapeOffThread(shape: WorkplaneShape, plane: SplitPlane, signal?: AbortSignal) {
  const onPage = () => splitShapeIfCrossed(shape, plane);
  if (containsText([shape])) return onPage();
  return runGeometryTask<Awaited<ReturnType<typeof splitShapeIfCrossed>>>("split", { shape, plane }, onPage, () => ({ parts: null, error: t("status.computeTimedOut") }), signal);
}

/** splitShapesByPlane (lib/editorBooleans.ts) with each cut made off the page. */
export function splitShapesByPlaneOffThread(targets: readonly WorkplaneShape[], plane: SplitPlane, stillCurrent: () => boolean, signal?: AbortSignal): Promise<SplitShapesOutcome> {
  return splitShapesByPlane(targets, plane, stillCurrent, (shape, shapePlane) => splitShapeOffThread(shape, shapePlane, signal));
}

/**
 * An STL file read off the page (importedShapeFromStl in lib/stlImport.ts): reading a 300,000-triangle
 * file held the page for over a second. The import window shows its own progress, so this says
 * nothing of its own.
 */
export function importedShapeFromStlOffThread(fileName: string, buffer: ArrayBuffer): Promise<WorkplaneShape> {
  return runGeometryTask("stl", { fileName, buffer }, async () => importedShapeFromStl(fileName, buffer), () => {
    throw new Error(t("status.computeTimedOut"));
  }, undefined, true);
}

/** An OBJ file read off the page (importedShapesFromObj in lib/objImport.ts). */
export function importedShapesFromObjOffThread(fileName: string, text: string, mtlSources: readonly string[]): Promise<ObjImportResult> {
  return runGeometryTask("obj", { fileName, text, mtlSources: [...mtlSources] }, async () => importedShapesFromObj(fileName, text, mtlSources), () => {
    throw new Error(t("status.computeTimedOut"));
  }, undefined, true);
}

/**
 * The print estimate (exportSolidVolume in lib/editorBooleans.ts) worked out off the page: for a
 * 300,000-triangle import it held the page for close to a second. The export window shows its
 * own progress, so this says nothing of its own; text stays on the page.
 */
export function exportSolidVolumeOffThread(source: readonly WorkplaneShape[]): Promise<ExportSolidVolume> {
  const onPage = () => exportSolidVolume(source);
  if (containsText(source)) return onPage();
  return runGeometryTask("estimate", { source: [...source] }, onPage, () => {
    throw new Error(t("status.computeTimedOut"));
  }, undefined, true);
}

/**
 * A mesh simplified off the page (simplifyTrianglePositions in lib/meshSimplify.ts): 0.3 s of the
 * page for a 300,000-triangle import, at every rest of the slider. A new value calls off the one
 * before through `signal`. The panel shows its own progress.
 */
export function simplifyTrianglePositionsOffThread(positions: ArrayLike<number>, target: number, signal?: AbortSignal): Promise<SimplifiedMesh> {
  return runGeometryTask("simplify", { positions: Array.isArray(positions) ? positions : Array.from(positions), target }, () => simplifyTrianglePositions(positions, target), () => {
    throw new Error(t("status.computeTimedOut"));
  }, signal, true);
}
