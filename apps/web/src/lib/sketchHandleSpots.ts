/**
 * Where the turning arrows and the lock badge stand on the sketch plate. The lock badge is kept inside
 * the part of the picture that is on screen, so a locked picture can still be unlocked zoomed in.
 */

export type PlateSpot = { x: number; z: number };
export type PlateRect = { minX: number; minZ: number; maxX: number; maxZ: number };
export type RotateHandleSpot = PlateSpot & { outward: PlateSpot; corner: number };

function clamp(value: number, min: number, max: number) {
  return min > max ? (min + max) / 2 : Math.min(max, Math.max(min, value));
}

/** A turning arrow at `spot`, bowing away from the centre; `fallback` when the spot is the centre itself. */
function arrowAt(spot: PlateSpot, centre: PlateSpot, fallback: PlateSpot, corner: number): RotateHandleSpot {
  const ox = spot.x - centre.x;
  const oz = spot.z - centre.z;
  const reach = Math.hypot(ox, oz);
  return { x: spot.x, z: spot.z, outward: reach > 1e-9 ? { x: ox / reach, z: oz / reach } : fallback, corner };
}

/**
 * One turning arrow beyond each corner, `gap` out along the line from the centre. While one is dragged
 * (`grabbed`), only that one is shown, under the pointer, still bowing away from the centre.
 */
export function rotateHandleSpots(corners: PlateSpot[], centre: PlateSpot, gap: number, grabbed?: { corner: number; at: PlateSpot }): RotateHandleSpot[] {
  return corners.flatMap((corner, index) => {
    if (grabbed && grabbed.corner !== index) return [];
    const dx = corner.x - centre.x;
    const dz = corner.z - centre.z;
    const length = Math.hypot(dx, dz) || 1;
    const outward = { x: dx / length, z: dz / length };
    if (grabbed) return [arrowAt(grabbed.at, centre, outward, index)];
    return [{ x: corner.x + outward.x * gap, z: corner.z + outward.z * gap, outward, corner: index }];
  });
}

/**
 * The lock badge of a locked picture: at its top-left corner, moved inside the part of the picture
 * that is on screen. Null when none of the picture is.
 */
export function lockBadgeSpot(corner: PlateSpot, corners: PlateSpot[], view: PlateRect, inset: number): PlateSpot | null {
  const minX = Math.max(view.minX, Math.min(...corners.map((entry) => entry.x)));
  const maxX = Math.min(view.maxX, Math.max(...corners.map((entry) => entry.x)));
  const minZ = Math.max(view.minZ, Math.min(...corners.map((entry) => entry.z)));
  const maxZ = Math.min(view.maxZ, Math.max(...corners.map((entry) => entry.z)));
  if (minX >= maxX || minZ >= maxZ) return null;
  return { x: clamp(corner.x + inset, minX + inset, maxX - inset), z: clamp(corner.z + inset, minZ + inset, maxZ - inset) };
}
