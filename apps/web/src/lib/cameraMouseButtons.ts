import * as THREE from "three";

/**
 * What the left button does in OrbitControls for a press with Ctrl or Cmd held: it moves the view
 * (#654). OrbitControls swaps rotate and pan by itself while Ctrl, Cmd or Shift is down, so asking
 * for ROTATE here is what makes it pan - asking for PAN turned the view instead, and a MacBook
 * without a middle button had no way to move it. Any other left press belongs to the editor (null).
 */
export function leftButtonCameraAction(event: Pick<PointerEvent, "button" | "ctrlKey" | "metaKey">): THREE.MOUSE | null {
  return event.button === 0 && (event.ctrlKey || event.metaKey) ? THREE.MOUSE.ROTATE : null;
}
