// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ShortcutsModal } from "@/components/workplane/ShortcutsModal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The search box of the shortcuts window keeps only the rows that match and gives the whole list back when it is empty.
describe("the shortcuts window's search", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
  });

  const mount = (sketchMode = false) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(ShortcutsModal, { sketchMode, onClose: () => {} })));
    return container.querySelector<HTMLInputElement>(".shortcuts-search-input")!;
  };
  const type = (input: HTMLInputElement, text: string) => {
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const rows = () => [...container!.querySelectorAll(".shortcuts-modal-body .shortcuts-row dt")].map((row) => row.textContent);
  const clearButton = () => container!.querySelector<HTMLButtonElement>(".shortcuts-search-clear");

  it("shows every shortcut and no clear button while the box is empty", () => {
    const input = mount();
    expect(document.activeElement).toBe(input);
    expect(rows().length).toBeGreaterThan(50);
    expect(clearButton()).toBeNull();
  });

  it("keeps only the rows whose sentence matches every word, whatever the case", () => {
    const input = mount();
    type(input, "FILLET TOOL");
    expect(rows()).toEqual(["Fillet tool for the selected body (again: close it)"]);
    type(input, "selected body");
    expect(rows().every((row) => /selected body/i.test(row ?? ""))).toBe(true);
    expect(rows().length).toBeGreaterThan(1);
  });

  it("finds a combination by its keys", () => {
    const input = mount();
    type(input, "ctrl+z");
    expect(rows()).toEqual(["Undo"]);
    type(input, "ctrl+shift+z");
    expect(rows()).toEqual(["Redo"]);
  });

  it("takes a single character as a key or the start of a word", () => {
    const input = mount();
    type(input, "m");
    expect(rows()).toContain("Mirror mode");
    expect(rows().some((row) => row?.startsWith("Multicolor"))).toBe(true);
    expect(rows()).not.toContain("Undo");
  });

  it("drops the groups left empty and says when nothing matches", () => {
    const input = mount();
    type(input, "undo");
    expect(container!.querySelectorAll(".shortcuts-modal-body .shortcuts-group")).toHaveLength(1);
    type(input, "nothing like this");
    expect(rows()).toEqual([]);
    expect(container!.querySelector(".shortcuts-no-matches")?.textContent).toBe("No shortcut matches the search.");
  });

  it("brings the whole list back with the X", () => {
    const input = mount();
    const all = rows().length;
    type(input, "fillet");
    act(() => clearButton()!.click());
    expect(input.value).toBe("");
    expect(rows()).toHaveLength(all);
    expect(clearButton()).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("searches the sketch list in sketch mode", () => {
    const input = mount(true);
    type(input, "fillet");
    expect(rows()).toEqual([]);
    type(input, "angle");
    expect(rows().length).toBeGreaterThan(0);
  });
});
