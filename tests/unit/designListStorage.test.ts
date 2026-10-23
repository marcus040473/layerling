import { describe, expect, it } from "vitest";
import { designsToRecover, hiddenCopiesOf, isInlineThumbnail, orphanedProjectIds, projectListForLocalStorage, withStoredThumbnails, writeProjectList } from "@/lib/designListStorage";

const picture = "data:image/png;base64,AAAA";

describe("the list of designs in localStorage (#656)", () => {
  it("keeps the card pictures out of the list", () => {
    const list = projectListForLocalStorage([
      { id: "a", thumbnailUrl: picture },
      { id: "b", thumbnailUrl: "/api/project-thumbnail?projectId=b&v=2" },
      { id: "c", thumbnailUrl: null },
    ]);
    expect(list.map((project) => project.thumbnailUrl)).toEqual([null, "/api/project-thumbnail?projectId=b&v=2", null]);
    expect(isInlineThumbnail(picture)).toBe(true);
    expect(isInlineThumbnail("/api/project-thumbnail")).toBe(false);
  });

  it("gives the pictures back to cards that have none", () => {
    const projects = [{ id: "a", thumbnailUrl: null }, { id: "b", thumbnailUrl: "/other.png" }];
    const next = withStoredThumbnails(projects, new Map([["a", picture], ["b", picture]]));
    expect(next.map((project) => project.thumbnailUrl)).toEqual([picture, "/other.png"]);
    expect(next[1]).toBe(projects[1]);
    expect(withStoredThumbnails(projects, new Map())).toBe(projects);
  });

  it("leaves the old list in place when the new one does not fit", () => {
    const stored = new Map<string, string>([["layerling.projects", "[old]"]]);
    const full = {
      setItem(key: string, value: string) {
        if (value.length > 10) throw new DOMException("exceeded the quota", "QuotaExceededError");
        stored.set(key, value);
      },
      removeItem(key: string) {
        stored.delete(key);
      },
    };
    expect(writeProjectList(full, "layerling.projects", "[a much longer list]")).toBe(false);
    expect(stored.get("layerling.projects")).toBe("[old]");
    expect(writeProjectList(full, "layerling.projects", "[new]")).toBe(true);
    expect(stored.get("layerling.projects")).toBe("[new]");
  });

  it("brings a design back once, the newest, and not when a backup already brought it", () => {
    const listed = [{ name: "Bin", createdAt: 1 }];
    const candidates = [
      { id: "old-bin", name: "Bin", createdAt: 1, revision: 9 },
      { id: "first", name: "Box", createdAt: 2, revision: 5 },
      { id: "second", name: "Box", createdAt: 2, revision: 7 },
      { id: "other", name: "Box", createdAt: 3, revision: 1 },
    ];
    expect(designsToRecover(listed, candidates).map((design) => design.id)).toEqual(["second", "other"]);
  });

  it("finds the designs whose card was lost", () => {
    expect(orphanedProjectIds(["a", "b"], ["a", "c", "b", "d", "c"])).toEqual(["c", "d"]);
    expect(orphanedProjectIds([], [])).toEqual([]);
  });

  it("finds the copies a restore left behind of a design that is deleted", () => {
    const candidates = [
      { id: "old", name: "Tankpas", createdAt: 4, revision: 3 },
      { id: "older", name: "Tankpas", createdAt: 4, revision: 1 },
      { id: "renamed", name: "Tankpas 2", createdAt: 4, revision: 2 },
      { id: "later", name: "Tankpas", createdAt: 5, revision: 2 },
    ];
    expect(hiddenCopiesOf({ name: "Tankpas", createdAt: 4 }, candidates)).toEqual(["old", "older"]);
    expect(hiddenCopiesOf({ name: "Box", createdAt: 4 }, candidates)).toEqual([]);
  });
});
