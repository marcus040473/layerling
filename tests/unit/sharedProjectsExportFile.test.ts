import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE, GET, POST } from "@/app/api/shared-projects/route";

/*
 * An export file - STL, 3MF, STEP, SVG ... - goes into a folder of the server store (#779), so a slicer
 * that shares the folder can open it. It is no project: the list does not show it, and a file of the same
 * name is replaced only when the request says so.
 */

const SHARED_PROJECTS_ENV = "LAYERLING_SHARED_PROJECTS_DIR";

let sharedProjectsRoot = "";
let previousSharedProjectsRoot: string | undefined;

function exportRequest(fileName: string, bytes: string, options: { folder?: string; overwrite?: boolean; origin?: string } = {}) {
  const query = new URLSearchParams({ exportFile: fileName });
  if (options.folder) query.set("path", options.folder);
  if (options.overwrite) query.set("overwrite", "1");
  return new Request(`http://localhost/api/shared-projects?${query.toString()}`, {
    method: "POST",
    headers: { Origin: options.origin ?? "http://localhost" },
    body: bytes,
  });
}

describe("saving an export file on the server", () => {
  beforeEach(async () => {
    previousSharedProjectsRoot = process.env[SHARED_PROJECTS_ENV];
    sharedProjectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "layerling-shared-export-"));
    process.env[SHARED_PROJECTS_ENV] = sharedProjectsRoot;
  });

  afterEach(async () => {
    if (previousSharedProjectsRoot === undefined) delete process.env[SHARED_PROJECTS_ENV];
    else process.env[SHARED_PROJECTS_ENV] = previousSharedProjectsRoot;
    await fs.rm(sharedProjectsRoot, { recursive: true, force: true });
  });

  it("writes the file into the folder and says where", async () => {
    await fs.mkdir(path.join(sharedProjectsRoot, "Prints"));

    const response = await POST(exportRequest("Bracket.3mf", "3mf bytes", { folder: "Prints" }));

    expect(response.status).toBe(201);
    const payload = await response.json() as { file: { fileName: string; path: string; size: number } };
    expect(payload.file).toEqual({ fileName: "Bracket.3mf", path: "Prints", size: 9 });
    expect(await fs.readFile(path.join(sharedProjectsRoot, "Prints", "Bracket.3mf"), "utf8")).toBe("3mf bytes");
  });

  it("leaves a file of the same name alone until the request asks to replace it", async () => {
    await POST(exportRequest("Part.stl", "first"));

    const refused = await POST(exportRequest("Part.stl", "second"));
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ exists: true, fileName: "Part.stl" });
    expect(await fs.readFile(path.join(sharedProjectsRoot, "Part.stl"), "utf8")).toBe("first");

    const replaced = await POST(exportRequest("Part.stl", "second", { overwrite: true }));
    expect(replaced.status).toBe(200);
    expect(await fs.readFile(path.join(sharedProjectsRoot, "Part.stl"), "utf8")).toBe("second");
  });

  it("does not show the file in the list of designs", async () => {
    await POST(exportRequest("Part.step", "step bytes"));

    const listing = await (await GET(new Request("http://localhost/api/shared-projects"))).json() as { projects: unknown[] };

    expect(listing.projects).toEqual([]);
  });

  it("refuses types that are no export, names that climb out, and other origins", async () => {
    expect((await POST(exportRequest("run.php", "<?php"))).status).toBe(400);
    expect((await POST(exportRequest("notes.lyl", "x"))).status).toBe(400);
    expect((await POST(exportRequest("Part.stl", "x", { folder: "../outside" }))).status).toBe(400);
    expect((await POST(exportRequest("Part.stl", "x", { origin: "http://elsewhere.example" }))).status).toBe(403);

    const climbing = await POST(exportRequest("../../escape.stl", "x"));
    expect(climbing.status).toBe(201);
    expect(await fs.readdir(sharedProjectsRoot)).toEqual(["escape.stl"]);
  });

  it("does not let a folder with export files go without being asked", async () => {
    await fs.mkdir(path.join(sharedProjectsRoot, "Prints"));
    await POST(exportRequest("Part.stl", "x", { folder: "Prints" }));

    const refused = await DELETE(new Request("http://localhost/api/shared-projects?path=Prints&deleteFolder=1", { method: "DELETE", headers: { Origin: "http://localhost" } }));

    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ files: 1 });
    expect(await fs.readdir(path.join(sharedProjectsRoot, "Prints"))).toContain("Part.stl");
  });
});
