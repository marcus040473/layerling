import * as THREE from "three";

/**
 * Whether this is a Mac (or an iPad with a trackpad, which reports itself as one). There a click with
 * Control held is the system's right click, so Control and drag is a right-button drag.
 */
export function isMacPointer() {
  return typeof navigator !== "undefined" && /Macintosh|Mac OS X/.test(navigator.userAgent);
}

/**
 * What the left button does in OrbitControls for a press with Ctrl or Cmd held. OrbitControls swaps rotate
 * and pan by itself while Ctrl, Cmd or Shift is down, so asking for ROTATE here is what makes it pan, and
 * asking for PAN makes it turn.
 *
 * - Ctrl or Cmd and drag moves the view (#654): a MacBook without a middle button had no other way to.
 * - On a Mac, Control alone turns it instead (#860): Control-click is the Mac's right click, and a right
 *   drag turns the view. Mac people turned the view that way until 1.95.0, and Cmd still moves it there.
 *
 * Any other left press belongs to the editor (null).
 */
export function leftButtonCameraAction(event: Pick<PointerEvent, "button" | "ctrlKey" | "metaKey">, mac = isMacPointer()): THREE.MOUSE | null {
  if (event.button !== 0 || !(event.ctrlKey || event.metaKey)) return null;
  return mac && event.ctrlKey && !event.metaKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
}
