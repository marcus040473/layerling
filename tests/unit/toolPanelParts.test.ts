// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { SurfacePatternPicker } from "@/components/workplane/SurfacePatternPicker";
import { ToolApply, ToolCancel, ToolGroup, ToolStatus, ToolStepper, hintParts } from "@/components/workplane/ToolPanelParts";
import { setLanguage, t } from "@/lib/i18n";

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

  it("gives every state of the status line its own symbol", () => {
    setLanguage("en");
    mount(createElement("div", null,
      createElement(ToolStatus, { state: "needed", text: "Layer 2 has no faces yet" }),
      createElement(ToolStatus, { state: "working", text: "Computing the texture …" }),
      createElement(ToolStatus, { state: "ready", text: "Ready to apply" }),
    ));
    const icons = [...container!.querySelectorAll(".tool-status")].map((line) => line.querySelector("svg")?.getAttribute("class") ?? "");
    expect(icons[0]).toContain("triangle-alert");
    expect(icons[1]).toContain("loader-circle");
    expect(icons[1]).toContain("edge-modifier-spinner");
    expect(icons[2]).toContain("circle-check");
    expect(container!.querySelectorAll(".tool-status-dot")).toHaveLength(0);
  });

  it("marks the actions at a tool's foot with a symbol: a cross to leave, a tick to apply, a red bin to delete", () => {
    setLanguage("de");
    mount(createElement("div", null,
      createElement(ToolCancel, { onClick: () => undefined }),
      createElement(ToolCancel, { back: true, label: t("faceTool.repick"), onClick: () => undefined }),
      createElement(ToolApply, { label: t("lid.apply"), onClick: () => undefined }),
      createElement(ToolApply, { label: t("deleteFace.apply"), danger: true, onClick: () => undefined }),
      createElement(ToolApply, { label: t("lid.apply"), busy: true, busyLabel: t("lid.working"), disabled: true, onClick: () => undefined }),
    ));
    const buttons = [...container!.querySelectorAll("button")];
    const icon = (button: HTMLButtonElement) => button.querySelector("svg")?.getAttribute("class") ?? "";
    expect(buttons.map((button) => button.textContent)).toEqual(["Abbrechen", "Andere Fläche", "Anwenden", "Löschen", t("lid.working")]);
    expect(icon(buttons[0])).toContain("lucide-x");
    expect(icon(buttons[1])).toContain("arrow-left");
    expect(icon(buttons[2])).toContain("lucide-check");
    expect(buttons[3].className).toBe("primary danger");
    expect(icon(buttons[3])).toContain("trash");
    expect(icon(buttons[4])).toContain("loader-circle");
  });

  it("says Apply on the main button of every tool, in each language, and Delete only where it deletes", () => {
    const tools = ["array", "cookieCutter", "cutOut", "edge", "faceTool", "flexi", "holePattern", "lid", "mate", "offset", "scalePercent", "shell", "split"];
    for (const language of ["en", "de", "fr", "nl", "ru", "cs", "sl", "da"] as const) {
      setLanguage(language);
      const word = t("edge.apply");
      expect(tools.map((tool) => t(`${tool}.apply`))).toEqual(tools.map(() => word));
      expect(t("inspector.surfaceApply")).toBe(word);
      expect(t("inspector.surfaceChange")).toBe(word);
      expect(t("deleteFace.apply")).not.toBe(word);
    }
  });

  it("folds an optional part to one line that says what is set in it, and opens it when it is ticked on", () => {
    setLanguage("en");
    window.localStorage.removeItem("layerling.toolAdvanced.test-magnets");
    const checks: boolean[] = [];
    const group = (checked: boolean) => createElement(ToolGroup, {
      tool: "test-magnets",
      label: "Magnets in the corners",
      checked,
      summary: "6 × 2 mm",
      onCheck: (next: boolean) => checks.push(next),
      children: createElement("p", { className: "inside" }, "sizes"),
    });
    mount(group(false));
    expect(container!.querySelector(".tool-optional-toggle")).toBeNull();
    expect(container!.querySelector(".inside")).toBeNull();
    // Ticked on, it opens, and stays open for that tool.
    act(() => container!.querySelector<HTMLInputElement>("input[type=checkbox]")!.click());
    expect(checks).toEqual([true]);
    act(() => root!.render(group(true)));
    const toggle = container!.querySelector<HTMLButtonElement>(".tool-optional-toggle")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-label")).toBe("Magnets in the corners · 6 × 2 mm");
    expect(container!.querySelector(".inside")).not.toBeNull();
    // Folded, it shows only its line with the summary, and is folded again next time.
    act(() => toggle.click());
    expect(container!.querySelector(".inside")).toBeNull();
    expect(container!.querySelector(".tool-optional-summary")!.textContent).toBe("6 × 2 mm");
    expect(window.localStorage.getItem("layerling.toolAdvanced.test-magnets")).toBe("closed");
  });
});
