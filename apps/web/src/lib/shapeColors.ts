/**
 * Whether the pictures of the shape library wear the colour a new shape starts with (#717, #483). On is the
 * start; whoever likes the grey pictures switches it off in the settings, and the browser remembers. The choice is
 * a data attribute on <html>, and the stylesheet hides the colour layer when it says "off".
 */
export const SHAPE_COLORS_STORAGE_KEY = "layerling.shapeColors";

/** Runs in <head> before the page paints, so the pictures do not first show in colour and then lose it. */
export const SHAPE_COLORS_BOOT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(SHAPE_COLORS_STORAGE_KEY)})==="off")document.documentElement.dataset.shapeColors="off"}catch(e){}`;

export function normalizeShapeColors(value: unknown): boolean {
  return value !== "off";
}

export function applyShapeColors(on: boolean) {
  if (typeof document === "undefined") return;
  if (on) delete document.documentElement.dataset.shapeColors;
  else document.documentElement.dataset.shapeColors = "off";
}

function readStoredShapeColors(): boolean {
  try {
    return normalizeShapeColors(window.localStorage.getItem(SHAPE_COLORS_STORAGE_KEY));
  } catch {
    return true;
  }
}

const listeners = new Set<() => void>();
let currentShapeColors = typeof window !== "undefined" ? readStoredShapeColors() : true;

export function setShapeColors(on: boolean) {
  currentShapeColors = on;
  try {
    // Only "off" is stored: on is the start, so a browser that never chose keeps following it.
    if (on) window.localStorage.removeItem(SHAPE_COLORS_STORAGE_KEY);
    else window.localStorage.setItem(SHAPE_COLORS_STORAGE_KEY, "off");
  } catch {
    // The choice still holds for this session when storage is unavailable.
  }
  applyShapeColors(on);
  listeners.forEach((listener) => listener());
}

export function getShapeColors(): boolean {
  return currentShapeColors;
}

export function subscribeToShapeColors(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
