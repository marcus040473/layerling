// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { SurfacePatternPicker } from "@/components/workplane/SurfacePatternPicker";
import { ToolStepper, hintParts } from "@/components/workplane/ToolPanelParts";
import { setLanguage } from "@/lib/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("a hint under a setting", () => {
  it("shows its first sentence and keeps the rest for More", () => {
    expect(hintParts("Der Spalt rund um jedes Gelenk. 0,4 mm passen für die meisten Drucker; nimm mehr, wenn die Glieder zusammenkleben."))
      .toEqual(["Der Spalt rund um jedes Gelenk.", "0,4 mm passen für die meisten Drucker; nimm mehr, wenn die Glieder zusammenkleben."]);
  });

  it("does not end a sentence after an abbreviation", () => {
    const [first] = hintParts("Setze einen Körper darauf, z. B. eine Platte, und verteile die Reihe gleichmäßig. Dann folgt der Abstand der Anzahl der Kopien.");
    expect(first).toBe("Setze einen Körper darauf, z. B. eine Platte, und verteile die Reihe gleichmäßig.");
  });

  it("keeps a short hint whole, and cuts one long sentence after a word", () => {
    expect(hintParts("Mehrere Seiten lassen sich kombinieren.")).toEqual(["Mehrere Seiten lassen sich kombinieren.", ""]);
    const long = "Sucht selbst aus, um eine Achse bei runden Körpern wie einem Becher und bei eckigen die aufrecht stehen wie ein Quader sonst rundum";
    const [first, rest] = hintParts(long);
    expect(first.endsWith(" …")).toBe(true);
    expect(`${first.slice(0, -2)} ${rest}`).toBe(long);
  });
});

describe("the tool column's parts", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  const mount = (element: ReturnType<typeof createElement>) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(element));
  };
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
  });

  it("steps a count with − and + and keeps it within its range", () => {
    setLanguage("en");
    const values: number[] = [];
    mount(createElement(ToolStepper, { label: "Joints", value: 1, min: 1, max: 3, onChange: (value: number) => values.push(value) }));
    const [minus, plus] = container!.querySelectorAll("button");
    expect(minus.disabled).toBe(true);
    act(() => plus.click());
    expect(values).toEqual([2]);
  });

  it("finds a pattern by its name and takes it with Enter", () => {
    setLanguage("de");
    const chosen: string[] = [];
    mount(createElement(SurfacePatternPicker, { value: "grooves", onChange: (value: string) => chosen.push(value) }));
    act(() => container!.querySelector<HTMLButtonElement>(".pattern-picker-trigger")!.click());
    const search = container!.querySelector<HTMLInputElement>(".pattern-picker-search input")!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setValue.call(search, "ziegel");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const options = [...container!.querySelectorAll("[role=option]")].map((option) => option.textContent);
    expect(options).toEqual(["Ziegel"]);
    act(() => { search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(chosen).toEqual(["bricks"]);
    expect(container!.querySelector(".pattern-picker-popover")).toBeNull();
  });

  it("closes the tool open in the column when another one opens there", () => {
    setLanguage("en");
    const closed: string[] = [];
    const panel = (name: string) => createElement(MovableToolPanel, { key: name, className: "edge-modifier-panel", ariaLabel: name, dock: "withObject", onClose: () => closed.push(name), children: () => null });
    mount(createElement("div", null, panel("Hollow")));
    act(() => root!.render(createElement("div", null, panel("Hollow"), panel("Lid"))));
    expect(closed).toEqual(["Hollow"]);
  });
});
