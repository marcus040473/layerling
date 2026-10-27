import { describe, expect, it } from "vitest";
import { keepShownSelection, localDesignKey, selectionHasStale, serverDesignKey, toggleDesignSelection } from "@/lib/designSelection";

describe("choosing several designs on the start page", () => {
  it("keeps the designs of this browser and of the server apart, even with the same name", () => {
    expect(localDesignKey("a")).not.toBe(serverDesignKey("a"));
  });

  it("takes a design in and out, without touching the set it was given", () => {
    const empty = new Set<string>();
    const one = toggleDesignSelection(empty, "l:a");
    expect([...empty]).toEqual([]);
    expect([...one]).toEqual(["l:a"]);
    const two = toggleDesignSelection(one, "l:b");
    expect([...two].sort()).toEqual(["l:a", "l:b"]);
    expect([...toggleDesignSelection(two, "l:a")]).toEqual(["l:b"]);
  });

  it("drops a design that is no longer shown, and says when there is one to drop", () => {
    const selected = new Set(["l:a", "l:b", "s:c"]);
    expect(selectionHasStale(selected, ["l:a", "l:b", "s:c", "l:d"])).toBe(false);
    expect(selectionHasStale(selected, ["l:a", "s:c"])).toBe(true);
    expect([...keepShownSelection(selected, ["l:a", "s:c"])].sort()).toEqual(["l:a", "s:c"]);
    expect([...keepShownSelection(selected, [])]).toEqual([]);
  });
});
