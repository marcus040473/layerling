import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkplaneShape } from "@/types/layerling";

/**
 * The page's side of the geometry worker (lib/geometryWorker.ts): whatever goes wrong with the
 * worker, the work is done on the page instead, and the editor neither crashes nor waits forever.
 * A stand-in Worker plays each case; the page's own functions are stand-ins too.
 */
const page = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/editorBooleans", () => ({
  buildGroupedShapeFromSelection: async () => {
    page.calls += 1;
    return { group: { id: "made-on-the-page" }, consumed: false, failureNotice: "" };
  },
  splitShapeIfCrossed: async () => ({ parts: null, error: "page" }),
  splitShapesByPlane: async () => ({ status: "done", replacements: new Map(), splitCount: 0 }),
}));

class FakeWorker {
  static instances: FakeWorker[] = [];
  static failOnCreate = false;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { preventDefault: () => void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  posted: Array<{ requestId: number; task: string }> = [];
  terminated = false;
  constructor() {
    if (FakeWorker.failOnCreate) throw new Error("no workers here");
    FakeWorker.instances.push(this);
  }
  postMessage(message: { requestId: number; task: string }) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  hello(build = "") {
    this.onmessage?.({ data: { type: "build", build } });
  }
  answer(requestId: number, payload: unknown) {
    this.onmessage?.({ data: { requestId, ok: true, payload, buffers: [] } });
  }
  crash() {
    this.onerror?.({ preventDefault: () => undefined });
  }
}

const solidAndHole = [
  { id: "box", kind: "box" },
  { id: "hole", kind: "cylinder", hole: true },
] as unknown as WorkplaneShape[];

const flush = () => new Promise((resolve) => setImmediate(resolve));
const dispatched: string[] = [];

async function load(build = "") {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_BUILD_ID", build);
  return import("@/lib/geometryWorker");
}

beforeEach(() => {
  page.calls = 0;
  FakeWorker.instances = [];
  FakeWorker.failOnCreate = false;
  dispatched.length = 0;
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("window", {
    location: { href: "http://localhost/editor/" },
    dispatchEvent: (event: { type: string }) => dispatched.push(event.type),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("geometry worker on the page's side", () => {
  it("hands the work to the worker and returns its answer", async () => {
    const { buildGroupedShapeOffThread } = await load();
    const result = buildGroupedShapeOffThread(solidAndHole, 1000);
    const worker = FakeWorker.instances[0];
    worker.hello();
    await flush();
    expect(worker.posted[0].task).toBe("group");
    worker.answer(worker.posted[0].requestId, { group: { id: "made-in-the-worker" } });
    expect((await result).group?.id).toBe("made-in-the-worker");
    expect(page.calls).toBe(0);
  });

  it("keeps a plain grouping and text on the page", async () => {
    const { buildGroupedShapeOffThread } = await load();
    await buildGroupedShapeOffThread([{ id: "a", kind: "box" }, { id: "b", kind: "box" }] as unknown as WorkplaneShape[], 1000);
    await buildGroupedShapeOffThread([...solidAndHole, { id: "t", kind: "text" } as unknown as WorkplaneShape], 1000);
    expect(FakeWorker.instances).toHaveLength(0);
    expect(page.calls).toBe(2);
  });

  it("works on the page when no worker can be made", async () => {
    FakeWorker.failOnCreate = true;
    const { buildGroupedShapeOffThread } = await load();
    expect((await buildGroupedShapeOffThread(solidAndHole, 1000)).group?.id).toBe("made-on-the-page");
  });

  it("works on the page when the worker file does not load, and does not try again", async () => {
    const { buildGroupedShapeOffThread } = await load();
    const first = buildGroupedShapeOffThread(solidAndHole, 1000);
    FakeWorker.instances[0].crash();
    expect((await first).group?.id).toBe("made-on-the-page");
    expect(FakeWorker.instances[0].terminated).toBe(true);
    await buildGroupedShapeOffThread(solidAndHole, 1000);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(page.calls).toBe(2);
  });

  it("works on the page when the worker never says hello", async () => {
    vi.useFakeTimers();
    const { buildGroupedShapeOffThread } = await load();
    const result = buildGroupedShapeOffThread(solidAndHole, 1000);
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await result).group?.id).toBe("made-on-the-page");
  });

  it("does not use a worker from another build and offers the reload", async () => {
    const { buildGroupedShapeOffThread } = await load("page-build");
    const result = buildGroupedShapeOffThread(solidAndHole, 1000);
    FakeWorker.instances[0].hello("older-build");
    expect((await result).group?.id).toBe("made-on-the-page");
    expect(FakeWorker.instances[0].posted).toHaveLength(0);
    expect(dispatched).toEqual(["layerling:build-mismatch"]);
  });

  it("finishes on the page what a crashed worker had started", async () => {
    const { buildGroupedShapeOffThread } = await load();
    const result = buildGroupedShapeOffThread(solidAndHole, 1000);
    FakeWorker.instances[0].hello();
    await flush();
    FakeWorker.instances[0].crash();
    expect((await result).group?.id).toBe("made-on-the-page");
  });

  it("stops a stuck worker and says so", async () => {
    vi.useFakeTimers();
    const { buildGroupedShapeOffThread, GEOMETRY_WORKER_TIMEOUT_MS } = await load();
    const result = buildGroupedShapeOffThread(solidAndHole, 1000);
    FakeWorker.instances[0].hello();
    await vi.advanceTimersByTimeAsync(GEOMETRY_WORKER_TIMEOUT_MS);
    const answer = await result;
    expect(answer.group).toBeNull();
    expect(answer.failureNotice).toMatch(/too long/);
    expect(FakeWorker.instances[0].terminated).toBe(true);
    expect(page.calls).toBe(0);
  });

  it("calls off a request: no answer, and the worker stops working on it", async () => {
    const { buildGroupedShapeOffThread, subscribeGeometryBusy } = await load();
    const busy: boolean[] = [];
    subscribeGeometryBusy((value) => busy.push(value));
    const controller = new AbortController();
    let settled = false;
    void buildGroupedShapeOffThread(solidAndHole, 1000, controller.signal).then(() => { settled = true; });
    const worker = FakeWorker.instances[0];
    worker.hello();
    await flush();
    controller.abort();
    worker.answer(worker.posted[0].requestId, { group: { id: "late" } });
    await flush();
    expect(settled).toBe(false);
    expect(worker.terminated).toBe(true);
    expect(busy).toEqual([true, false]);
  });

  it("warms up without saying it is calculating", async () => {
    const { warmGeometryWorker, subscribeGeometryBusy } = await load();
    const busy: boolean[] = [];
    subscribeGeometryBusy((value) => busy.push(value));
    warmGeometryWorker();
    const worker = FakeWorker.instances[0];
    worker.hello();
    await flush();
    expect(worker.posted[0].task).toBe("warm");
    expect(busy).toEqual([false]);
  });
});
