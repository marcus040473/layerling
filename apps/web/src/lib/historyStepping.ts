/**
 * Stepping through the history view without the slider (#688): Page Up and
 * Page Down jump ten states, Home goes to the oldest and End to the state the
 * design is at; the mouse wheel over the bar goes one state per notch, up to
 * an earlier one.
 */

export const HISTORY_PAGE_STEPS = 10;

/** The state a key takes the history view to, or null when the key is not one of these. */
export function historyKeyTarget(key: string, index: number, max: number, liveIndex: number): number | null {
  const clampIndex = (value: number) => Math.min(max, Math.max(0, value));
  switch (key) {
    case "PageUp":
      return clampIndex(index - HISTORY_PAGE_STEPS);
    case "PageDown":
      return clampIndex(index + HISTORY_PAGE_STEPS);
    case "Home":
      return 0;
    case "End":
      return clampIndex(liveIndex);
    default:
      return null;
  }
}

/**
 * Wheel travel in pixels that makes one step on a touchpad, which sends many small
 * deltas. A mouse notch (about 100 px, or lines or pages) is one step on its own.
 */
const WHEEL_STEP_PIXELS = 50;

/**
 * Adds one wheel event to what is left over from the last ones and says how many
 * states to go: negative is earlier (wheel up), positive later.
 */
export function historyWheelSteps(carry: number, deltaY: number, deltaMode: number): { steps: number; carry: number } {
  if (deltaY === 0) return { steps: 0, carry };
  if (deltaMode !== 0 || Math.abs(deltaY) >= WHEEL_STEP_PIXELS) return { steps: Math.sign(deltaY), carry: 0 };
  const total = carry + deltaY;
  const steps = Math.trunc(total / WHEEL_STEP_PIXELS);
  return { steps, carry: total - steps * WHEEL_STEP_PIXELS };
}
