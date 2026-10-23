import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { leftButtonCameraAction } from "@/lib/cameraMouseButtons";

const press = (button: number, ctrlKey = false, metaKey = false) => ({ button, ctrlKey, metaKey });

describe("Ctrl or Cmd with the left button moves the view (#654)", () => {
  it("asks OrbitControls for ROTATE with Ctrl or Cmd held, and leaves every other left press to the editor", () => {
    expect(leftButtonCameraAction(press(0, true))).toBe(THREE.MOUSE.ROTATE);
    expect(leftButtonCameraAction(press(0, false, true))).toBe(THREE.MOUSE.ROTATE);
    expect(leftButtonCameraAction(press(0))).toBeNull();
    expect(leftButtonCameraAction(press(1, true))).toBeNull();
    expect(leftButtonCameraAction(press(2, false, true))).toBeNull();
  });

  it("relies on OrbitControls turning ROTATE into a pan while Ctrl or Cmd is down", () => {
    // If three.js ever drops this swap, Ctrl or Cmd + drag would turn the view again.
    const require = createRequire(import.meta.url);
    const source = readFileSync(require.resolve("three/examples/jsm/controls/OrbitControls.js"), "utf8");
    const rotateCase = source.slice(source.indexOf("case MOUSE.ROTATE:"), source.indexOf("case MOUSE.PAN:"));
    expect(rotateCase).toMatch(/if \( event\.ctrlKey \|\| event\.metaKey \|\| event\.shiftKey \) \{[\s\S]*?_handleMouseDownPan/);
  });
});
