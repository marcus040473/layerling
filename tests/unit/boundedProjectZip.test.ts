import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AsyncZipDeflate, Zip, strToU8, unzipSync } from "fflate";
import { boundedProjectZip } from "@/lib/boundedProjectZip";

afterEach(() => vi.restoreAllMocks());

function largeEntries(count: number) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => {
    const bytes = new Uint8Array(160_000 + index);
    for (let offset = 0; offset < bytes.length; offset++) bytes[offset] = (offset * 17 + index) % 251;
    return [`meshes/${index}.bin`, bytes];
  }));
}

function expectSameFiles(actual: Record<string, Uint8Array>, expected: Record<string, Uint8Array>) {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const [name, bytes] of Object.entries(expected)) {
    expect(Buffer.compare(actual[name], bytes), name).toBe(0);
  }
}

describe("bounded project ZIP", () => {
  it.each([0, 1, 6, 9] as const)("preserves all entries at compression level %s", async (level) => {
    const files = { "project.json": strToU8('{"name":"synthetic"}'), "empty.bin": new Uint8Array(), ...largeEntries(5) };
    const original = Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, bytes.slice()]));
    expectSameFiles(unzipSync(await boundedProjectZip(files, level)), original);
    expectSameFiles(files, original);
  });

  it("writes a valid empty archive", async () => {
    expect(unzipSync(await boundedProjectZip({}))).toEqual({});
  });

  it("bounds simultaneous large-entry compression jobs", async () => {
    let active = 0;
    let maximum = 0;
    let started = 0;
    const push = AsyncZipDeflate.prototype.push;
    vi.spyOn(AsyncZipDeflate.prototype, "push").mockImplementation(function (this: AsyncZipDeflate, bytes, final) {
      started++;
      maximum = Math.max(maximum, ++active);
      const forward = this.ondata;
      this.ondata = (error, data, done) => {
        if (error || done) active--;
        forward(error, data, done);
      };
      push.call(this, bytes, final);
    });
    const files = largeEntries(12);
    const expected = largeEntries(12);
    expectSameFiles(unzipSync(await boundedProjectZip(files, 1)), expected);
    expect(started).toBe(12);
    expect(maximum).toBe(2);
    expect(active).toBe(0);
  });

  it("rejects worker errors and terminates the archive", async () => {
    const failure = new Error("synthetic worker failure");
    const terminate = vi.spyOn(Zip.prototype, "terminate");
    vi.spyOn(AsyncZipDeflate.prototype, "push").mockImplementationOnce(function (this: AsyncZipDeflate) {
      queueMicrotask(() => this.ondata(failure, new Uint8Array(), false));
    });
    await expect(boundedProjectZip(largeEntries(5), 1)).rejects.toBe(failure);
    expect(terminate).toHaveBeenCalled();
  });

  it("rejects synchronous compression failures", async () => {
    const failure = new Error("synthetic push failure");
    const terminate = vi.spyOn(Zip.prototype, "terminate");
    vi.spyOn(AsyncZipDeflate.prototype, "push").mockImplementationOnce(() => { throw failure; });
    await expect(boundedProjectZip(largeEntries(3))).rejects.toBe(failure);
    expect(terminate).toHaveBeenCalled();
  });

  it("rejects archive finalization failures", async () => {
    const failure = new Error("synthetic finalization failure");
    vi.spyOn(Zip.prototype, "end").mockImplementationOnce(() => { throw failure; });
    await expect(boundedProjectZip({ "small.bin": new Uint8Array(5) })).rejects.toBe(failure);
  });

  it("rejects entry registration failures and terminates the new worker", async () => {
    const failure = new Error("synthetic add failure");
    let workerTerminated = false;
    vi.spyOn(Zip.prototype, "add").mockImplementationOnce((stream) => {
      if (stream instanceof AsyncZipDeflate) {
        const terminate = stream.terminate;
        stream.terminate = () => { workerTerminated = true; terminate(); };
      }
      throw failure;
    });
    await expect(boundedProjectZip(largeEntries(3))).rejects.toBe(failure);
    expect(workerTerminated).toBe(true);
  });
});
