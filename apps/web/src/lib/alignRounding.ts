/**
 * A position after Align or Mirror (#917). It used to be rounded to four decimals, which cleans a sum such as
 * 0.1 + 0.2 for a body that stands square to the axes. For a body that is turned, the exact place is a long
 * number, and rounding it moved the body by up to 0.00005 mm off the one it was aligned to: two boxes that met
 * in a corner then stood a hair apart, and the CAD kernel could not fillet, chamfer or hollow the group they
 * made. A value is therefore only rounded when it already is a four-decimal number up to floating-point noise.
 */
export function roundedAlignedValue(value: number): number {
  const rounded = Number(value.toFixed(4));
  return Math.abs(value - rounded) <= 1e-9 ? rounded : value;
}
