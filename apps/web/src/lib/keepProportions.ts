import type { WorkplaneShape } from "@/types/layerling";

/**
 * Whether typing this measure with "Keep proportions" on scales the other two along. A text's height is the
 * thickness of its letters, not a size of its picture: scaling the width and depth by it would change the
 * letter size (#724).
 */
export function keepsProportionsOnAxis(shape: Pick<WorkplaneShape, "kind">, axis: "width" | "depth" | "height" | undefined) {
  if (!axis) return false;
  return !(shape.kind === "text" && axis === "height");
}
