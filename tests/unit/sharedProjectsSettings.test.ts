import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/shared-projects/route";

/*
 * "Make default" kept in the server store, for every browser that uses it: one JSON file in a hidden
 * folder that the start page never lists.
 */

const SHARED_PROJECTS_ENV = "LAYERLING_SHARED_PROJECTS_DIR";

let sharedProjectsRoot = "";
let previousSharedProjectsRoot: string | undefined;

function settingsRequest(method: "GET" | "POST", body?: string, options: { name?: string; origin?: string } = {}) {
  return new Request(`http://localhost/api/shared-projects?settings=${encodeURIComponent(options.name ?? "default")}`, {
    method,
    headers: { Origin: options.origin ?? "http://localhost", "Content-Type": "application/json" },
    body,
  });
}

describe("settings kept in the server store", () => {
  beforeEach(async () => {
    previousSharedProjectsRoot = process.env[SHARED_PROJECTS_ENV];
    sharedProjectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "layerling-shared-settings-"));
    process.env[SHARED_PROJECTS_ENV] = sharedProjectsRoot;
  });

  afterEach(async () => {
    if (previousSharedProjectsRoot === undefined) delete process.env[SHARED_PROJECTS_ENV];
    else process.env[SHARED_PROJECTS_ENV] = previousSharedProjectsRoot;
    await fs.rm(sharedProjectsRoot, { recursive: true, force: true });
  });

  it("has none until one is saved, then gives it back", async () => {
    const empty = await GET(settingsRequest("GET"));
    expect(await empty.json()).toEqual({ enabled: true, settings: null });

    const saved = await POST(settingsRequest("POST", JSON.stringify({ workspace: { showShadows: false }, snap: "0.5 mm" })));
    expect(saved.status).toBe(200);

    const read = await GET(settingsRequest("GET"));
    expect(await read.json()).toEqual({ enabled: true, settings: { workspace: { showShadows: false }, snap: "0.5 mm" } });
    expect(JSON.parse(await fs.readFile(path.join(sharedProjectsRoot, ".settings", "default.json"), "utf8"))).toEqual({ workspace: { showShadows: false }, snap: "0.5 mm" });
  });

  it("replaces the saved one", async () => {
    await POST(settingsRequest("POST", JSON.stringify({ workspace: { a: 1 } })));
    await POST(settingsRequest("POST", JSON.stringify({ workspace: { a: 2 } })));
    expect(await (await GET(settingsRequest("GET"))).json()).toMatchObject({ settings: { workspace: { a: 2 } } });
    expect((await fs.readdir(path.join(sharedProjectsRoot, ".settings"))).sort()).toEqual(["default.json"]);
  });

  it("keeps the folder out of the listing", async () => {
    await POST(settingsRequest("POST", JSON.stringify({ workspace: {} })));
    const listing = await (await GET(new Request("http://localhost/api/shared-projects"))).json() as { folders: Array<{ name: string }> };
    expect(listing.folders).toEqual([]);
  });

  it("refuses other names, other sites and anything that is not a JSON object", async () => {
    expect((await GET(settingsRequest("GET", undefined, { name: "../secret" }))).status).toBe(400);
    expect((await POST(settingsRequest("POST", "{}", { name: "other" }))).status).toBe(400);
    expect((await POST(settingsRequest("POST", "{}", { origin: "http://elsewhere.example" }))).status).toBe(403);
    expect((await POST(settingsRequest("POST", "not json"))).status).toBe(400);
    expect((await POST(settingsRequest("POST", "[1,2]"))).status).toBe(400);
    expect((await POST(settingsRequest("POST", JSON.stringify({ big: "x".repeat(300 * 1024) })))).status).toBe(413);
    await expect(fs.stat(path.join(sharedProjectsRoot, ".settings", "default.json"))).rejects.toThrow();
  });

  it("says the store is off when there is none", async () => {
    delete process.env[SHARED_PROJECTS_ENV];
    expect(await (await GET(settingsRequest("GET"))).json()).toMatchObject({ enabled: false });
    expect((await POST(settingsRequest("POST", "{}"))).status).toBe(404);
  });
});
