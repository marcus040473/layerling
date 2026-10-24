/**
 * What a turn of the mouse wheel adds to a number field that has the keyboard focus (#226): one step of the
 * field, ten times as much with Shift, a tenth with Ctrl and a hundredth with Alt - coarse with no key, finer
 * towards the keys that sit next to each other at the corner of the keyboard.
 */
export function wheelValueFactor(keys: { shift?: boolean; ctrl?: boolean; alt?: boolean }): number {
  if (keys.alt) return 0.01;
  if (keys.ctrl) return 0.1;
  if (keys.shift) return 10;
  return 1;
}

/**
 * How far the wheel turned, as the browser reports it. With Shift held, macOS turns a vertical wheel into a
 * sideways one and reports the turn as deltaX with deltaY at 0, so the notch has to be read from deltaX then
 * (#226: Shift did nothing on a Mac while Ctrl and Alt worked).
 */
export function wheelTurn(event: { deltaX: number; deltaY: number; shiftKey?: boolean }): number {
  if (event.deltaY !== 0) return event.deltaY;
  return event.shiftKey ? event.deltaX : 0;
}

/**
 * The step of one wheel notch for a field whose slider runs from `min` to `max` in steps of `sliderStep`, in the
 * units the field shows: a whole unit on a long range (millimetres, degrees), a tenth on a short one, never finer
 * than the field's own step. An inch field steps in sixteenths. A range of 8 or more is a long one: the wall of a
 * hollowed box of 40 mm runs to 19.6, and a notch of a tenth there was ten times less than anywhere else (#536, prmod3d).
 */
export function wheelBaseStep(min: number, max: number, sliderStep: number, inches = false): number {
  if (inches) return 1 / 16;
  const span = Math.abs(max - min);
  const natural = span >= 8 ? 1 : span >= 2 ? 0.1 : 0.01;
  return Math.max(Number.isFinite(sliderStep) && sliderStep > 0 ? sliderStep : 0, natural);
}

/**
 * The value after `notches` wheel notches (positive up), without the float noise of repeated addition. A `shiftStep`
 * replaces the tenfold step of Shift: a size or position field passes the snap grid, as ten millimetres was too big a
 * jump for a fine grid (#749, MartinShake).
 */
export function wheelNextValue(current: number, notches: number, baseStep: number, keys: { shift?: boolean; ctrl?: boolean; alt?: boolean }, shiftStep?: number): number {
  const coarse = keys.shift && !keys.ctrl && !keys.alt && shiftStep !== undefined && Number.isFinite(shiftStep) && shiftStep > 0;
  const next = current + notches * (coarse ? shiftStep : baseStep * wheelValueFactor(keys));
  return Math.round(next * 1e6) / 1e6;
}
