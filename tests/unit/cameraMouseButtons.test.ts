import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { leftButtonCameraAction } from "@/lib/cameraMouseButtons";

const press = (button: number, ctrlKey = false, metaKey = false) => ({ button, ctrlKey, metaKey });

describe("Ctrl or Cmd with the left button moves the view (#654)", () => {
  it("asks OrbitControls for ROTATE with Ctrl or Cmd held, and leaves every other left press to the editor", () => {
    expect(leftButtonCameraAction(press(0, true), false)).toBe(THREE.MOUSE.ROTATE);
    expect(leftButtonCameraAction(press(0, false, true), false)).toBe(THREE.MOUSE.ROTATE);
    expect(leftButtonCameraAction(press(0), false)).toBeNull();
    expect(leftButtonCameraAction(press(1, true), false)).toBeNull();
    expect(leftButtonCameraAction(press(2, false, true), false)).toBeNull();
  });

  it("relies on OrbitControls swapping rotate and pan while Ctrl or Cmd is down", () => {
    // If three.js ever drops this swap, Ctrl or Cmd + drag would do the opposite of what is asked here.
    const require = createRequire(import.meta.url);
    const source = readFileSync(require.resolve("three/examples/jsm/controls/OrbitControls.js"), "utf8");
    const rotateCase = source.slice(source.indexOf("case MOUSE.ROTATE:"), source.indexOf("case MOUSE.PAN:"));
    expect(rotateCase).toMatch(/if \( event\.ctrlKey \|\| event\.metaKey \|\| event\.shiftKey \) \{[\s\S]*?_handleMouseDownPan/);
    const panStart = source.indexOf("case MOUSE.PAN:");
    const panCase = source.slice(panStart, source.indexOf("default:", panStart));
    expect(panCase).toMatch(/if \( event\.ctrlKey \|\| event\.metaKey \|\| event\.shiftKey \) \{[\s\S]*?_handleMouseDownRotate/);
  });
});

describe("On a Mac, Control and drag turns the view (#860)", () => {
  it("asks for PAN with Control alone, which the swap makes a turn, as Control-click is the Mac's right click", () => {
    expect(leftButtonCameraAction(press(0, true), true)).toBe(THREE.MOUSE.PAN);
  });

  it("still moves the view with Cmd, also with Control and Cmd together", () => {
    expect(leftButtonCameraAction(press(0, false, true), true)).toBe(THREE.MOUSE.ROTATE);
    expect(leftButtonCameraAction(press(0, true, true), true)).toBe(THREE.MOUSE.ROTATE);
    expect(leftButtonCameraAction(press(0), true)).toBeNull();
  });
});
