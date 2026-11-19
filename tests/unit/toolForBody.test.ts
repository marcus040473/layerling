// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useToolForBody } from "@/lib/toolSidebar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
});

/** The editor's part of it: the one body selected (or none), and the tool as the hook keeps it. */
function mount() {
  const seen = {} as { tool: ReturnType<typeof useToolForBody>; select: (id: string | null) => void };
  function Editor() {
    const [selected, select] = useState<string | null>("box");
    seen.tool = useToolForBody(selected);
    seen.select = select;
    return null;
  }
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(Editor)));
  return seen;
}

describe("a tool in the right column for one body (#1113)", () => {
  it("is closed until it is started, and another body added or selected shows that body, not the tool", () => {
    const editor = mount();
    expect(editor.tool.open).toBe(false);

    act(() => editor.tool.setOpen(true));
    expect(editor.tool.open).toBe(true);

    // A new body comes in selected: its properties, no tool nobody started for it.
    act(() => editor.select("rounded box"));
    expect(editor.tool.open).toBe(false);
    // Nor does the tool come back on the body it was open for.
    act(() => editor.select("box"));
    expect(editor.tool.open).toBe(false);
  });

  it("closes with nothing selected and cannot be started without a body", () => {
    const editor = mount();
    act(() => editor.tool.setOpen(true));
    act(() => editor.select(null));
    expect(editor.tool.open).toBe(false);
    act(() => editor.tool.setOpen(true));
    expect(editor.tool.open).toBe(false);
  });

  it("stays open on the body its own Apply puts in place of the old one, and only on that one", () => {
    const editor = mount();
    act(() => editor.tool.setOpen(true));
    act(() => {
      editor.select("textured box");
      editor.tool.follow("box", "textured box");
    });
    expect(editor.tool.open).toBe(true);

    // A body the tool was not open for is not followed.
    act(() => {
      editor.select("other");
      editor.tool.follow("sphere", "other");
    });
    expect(editor.tool.open).toBe(false);
  });

  it("closes by its own button as by its header", () => {
    const editor = mount();
    act(() => editor.tool.setOpen(true));
    act(() => editor.tool.setOpen(false));
    expect(editor.tool.open).toBe(false);
  });
});
