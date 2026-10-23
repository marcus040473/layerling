/**
 * Wie weit ein mit der Maus gezogenes Teil kommt: eine Plattenbreite ueber den
 * Plattenrand hinaus (Discussion #80), und bei einem Entwurf, der groesser ist
 * als die Platte, eine Plattenbreite ueber alles hinaus, was im Entwurf liegt
 * (#673). Sonst blieb ein grosses Teil auf einer Seite stehen.
 *
 * Die Grenze liegt symmetrisch um die Plattenmitte, je Achse.
 */

export type ReachBox = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Wie weit ein gezogenes Teil ueber den Plattenrand hinaus darf, als Anteil der Plattengroesse je Seite. */
export const PLATE_DRAG_REACH = 1;

export function dragReach(plate: { width: number; depth: number }, boxes: readonly ReachBox[]) {
  let farX = plate.width / 2;
  let farZ = plate.depth / 2;
  boxes.forEach((box) => {
    farX = Math.max(farX, Math.abs(box.minX), Math.abs(box.maxX));
    farZ = Math.max(farZ, Math.abs(box.minZ), Math.abs(box.maxZ));
  });
  return {
    x: farX + plate.width * PLATE_DRAG_REACH,
    z: farZ + plate.depth * PLATE_DRAG_REACH,
  };
}
