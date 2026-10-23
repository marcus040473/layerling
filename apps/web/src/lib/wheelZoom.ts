/**
 * What one mouse-wheel notch counts for in the zoom (#331).
 *
 * OrbitControls scales the camera distance by how far the browser says the wheel has turned. That
 * number differs: Chrome on Windows sends 100 for a notch, Safari on a Mac with a plain mouse sent
 * 12, so a notch there zoomed an eighth as much, with the zoom speed at its top. A step that
 * arrives alone and is smaller than a notch is a notch of a mouse and counts as one. A trackpad or
 * a smooth wheel sends many small steps in a row; those stay as they come.
 */
export const WHEEL_NOTCH_DELTA = 100;

/**
 * A pinch on a trackpad arrives as Ctrl wheel steps far smaller than a notch. OrbitControls counts them ten times
 * over, but the count above replaces the step it reads, so the pinch has to be multiplied here, or it zooms a tenth
 * as far: Chrome on a Mac and on Linux (mail, 21.10.2026). Ctrl held with a mouse wheel sends a notch and stays as it is.
 */
export const PINCH_WHEEL_FACTOR = 10;

/**
 * A wheel counted in lines or pages sends 3 lines or 1 page for a notch, not pixels: Firefox, and Windows with
 * "scroll one screen at a time" (Edge, 22.10.2026: deltaY 1 in page mode, so a notch zoomed a hundredth of its
 * size, whatever the zoom speed). OrbitControls reads the number as pixels, so it is turned into them here.
 */
export const WHEEL_LINE_DELTA = WHEEL_NOTCH_DELTA / 3;
export const WHEEL_PAGE_DELTA = WHEEL_NOTCH_DELTA;

/** A step this long after the one before it stands alone: a notch, not a stream of a trackpad. */
export const WHEEL_ALONE_GAP_MS = 80;

/**
 * The wheel step that zooms as far as a pinch on a trackpad did (#439 forum): Safari on a Mac sends no wheel steps
 * for a pinch, only a gesture with a scale, so the scale it grew by since the last event is turned into the step
 * OrbitControls would have read, which scales the distance by 0.95 ^ (zoom speed * step / 100). Spreading
 * (a ratio above 1) comes closer, so its step is negative. It goes out as a Ctrl wheel step, which
 * wheelZoomDelta multiplies by PINCH_WHEEL_FACTOR, so it is that much smaller here.
 */
export function pinchWheelDelta(ratio: number, zoomSpeed: number): number | null {
  if (!Number.isFinite(ratio) || ratio <= 0 || !Number.isFinite(zoomSpeed) || zoomSpeed <= 0) return null;
  const step = (100 * Math.log(ratio)) / (zoomSpeed * -Math.log(0.95)) / PINCH_WHEEL_FACTOR;
  return Math.abs(step) < 1e-3 ? null : -step;
}

export function wheelZoomDelta(event: { deltaY: number; deltaMode: number; ctrlKey: boolean }, msSinceLastWheel: number): number {
  if (event.ctrlKey && event.deltaMode === 0 && Math.abs(event.deltaY) < WHEEL_NOTCH_DELTA) return event.deltaY * PINCH_WHEEL_FACTOR;
  if (event.deltaMode === 1) return event.deltaY * WHEEL_LINE_DELTA;
  if (event.deltaMode === 2) return event.deltaY * WHEEL_PAGE_DELTA;
  if (event.ctrlKey) return event.deltaY;
  const size = Math.abs(event.deltaY);
  if (size === 0 || size >= WHEEL_NOTCH_DELTA) return event.deltaY;
  if (!(msSinceLastWheel >= WHEEL_ALONE_GAP_MS)) return event.deltaY;
  return Math.sign(event.deltaY) * WHEEL_NOTCH_DELTA;
}
