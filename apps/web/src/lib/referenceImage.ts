import * as THREE from "three";
import { canonicalizeShape, shapeDepth, shapeWidth } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/layerling";

/**
 * A reference image (#680): a picture laid on the plate or on the face the workplane stands on,
 * to line parts up on - a photo of a circuit board under its case, say. It is the old picture
 * plate (`imagePlate`), a thin box with the picture on top, so designs that have one open as
 * before. It is a guide, not a body: never exported, cut, grouped, printed or counted in the print
 * estimate (see isNonSolidShape), and the picture is kept once in the .lyl file as a project asset.
 */

/** How thick the plate is: thin enough to sit under the parts, thick enough not to flicker with the grid. */
export const REFERENCE_IMAGE_HEIGHT = 0.2;
export const DEFAULT_REFERENCE_IMAGE_OPACITY = 0.6;
export const MIN_REFERENCE_IMAGE_OPACITY = 0.1;
/** A picture larger than this (in bytes) is worth a word: the design file grows by as much. */
export const LARGE_REFERENCE_IMAGE_BYTES = 2 * 1024 * 1024;
const REFERENCE_IMAGE_COLOR = "#8a939c";
/** The longer side of a new image, in mm, before it is calibrated. */
const NEW_IMAGE_SIZE = 100;
const MIN_IMAGE_SIDE = 1;
const MAX_IMAGE_SIDE = 2000;

export type PreparedImage = { dataUrl: string; mimeType: string; pixelWidth: number; pixelHeight: number };

/** Whether a shape is a reference image. */
export function isReferenceImage(shape: Pick<WorkplaneShape, "imagePlate"> | null | undefined): shape is WorkplaneShape & { imagePlate: NonNullable<WorkplaneShape["imagePlate"]> } {
  return Boolean(shape?.imagePlate);
}

/** How opaque the picture is drawn, 0.1 to 1; an old picture plate without one is solid. */
export function referenceImageOpacity(shape: Pick<WorkplaneShape, "imagePlate">) {
  const value = shape.imagePlate?.opacity;
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(MIN_REFERENCE_IMAGE_OPACITY, value));
}

/** Whether a stored opacity is one layerling writes: a number from 0.1 to 1, or none. */
export function isReferenceImageOpacity(value: unknown) {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= MIN_REFERENCE_IMAGE_OPACITY && value <= 1);
}

/** The size in bytes of the picture a data URL holds. */
export function dataUrlByteLength(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  if (!dataUrl.slice(0, comma).includes(";base64")) return decodeURIComponent(body).length;
  const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding);
}

/**
 * A new reference image in the middle of its frame, `width` mm wide (or its longer side 100 mm),
 * with the picture's proportions, half see-through. It is put on the workplane by the caller.
 */
export function referenceImageShape(image: PreparedImage, name: string, id: string, width?: number): WorkplaneShape {
  const aspect = image.pixelWidth / Math.max(1, image.pixelHeight);
  const wide = width ?? (aspect >= 1 ? NEW_IMAGE_SIZE : NEW_IMAGE_SIZE * aspect);
  const side = (value: number) => Math.round(Math.min(MAX_IMAGE_SIDE, Math.max(MIN_IMAGE_SIDE, value)) * 1000) / 1000;
  const imageWidth = side(wide);
  const imageDepth = side(wide / aspect);
  return canonicalizeShape({
    id,
    name: name || "Reference image",
    kind: "box",
    color: REFERENCE_IMAGE_COLOR,
    hole: false,
    x: 0,
    z: 0,
    elevation: 0,
    rotation: 0,
    width: imageWidth,
    depth: imageDepth,
    height: REFERENCE_IMAGE_HEIGHT,
    size: Math.max(imageWidth, imageDepth),
    imagePlate: { ...image, opacity: DEFAULT_REFERENCE_IMAGE_OPACITY },
  });
}

/**
 * The image calibrated as in the sketch (#680): two points on it that lie `distance` mm apart in
 * reality, `measured` mm apart as it is now. Width and depth grow by the same factor, so the
 * picture keeps its proportions; its middle stays where it is. Null when the points coincide or
 * the distance is no length.
 */
export function calibratedReferenceImage(shape: WorkplaneShape, measured: number, distance: number): Pick<WorkplaneShape, "width" | "depth" | "size"> | null {
  if (!(measured > 1e-6) || !(distance > 0) || !Number.isFinite(measured) || !Number.isFinite(distance)) return null;
  const factor = distance / measured;
  const side = (value: number) => Math.round(Math.min(MAX_IMAGE_SIDE, Math.max(MIN_IMAGE_SIDE, value * factor)) * 1000) / 1000;
  const width = side(shapeWidth(shape));
  const depth = side(shapeDepth(shape));
  return { width, depth, size: Math.max(width, depth) };
}

/**
 * How far apart two points of the picture lie on the image as it is now, in mm: points given in
 * the picture's own pixels (0 at its left and top edge), as the AI bridge names them.
 */
export function referenceImagePixelDistance(shape: WorkplaneShape & { imagePlate: NonNullable<WorkplaneShape["imagePlate"]> }, from: { x: number; y: number }, to: { x: number; y: number }) {
  const perPixelX = shapeWidth(shape) / Math.max(1, shape.imagePlate.pixelWidth);
  const perPixelY = shapeDepth(shape) / Math.max(1, shape.imagePlate.pixelHeight);
  return Math.hypot((to.x - from.x) * perPixelX, (to.y - from.y) * perPixelY);
}

/**
 * The world axis the picture faces along (its plate's top, after its rotation): on the plate that
 * is "y", on a side face "x" or "z". Mirroring across this axis would turn the picture to the
 * back of its plate, so a reference image is not mirrored that way; across the other two it is.
 */
export function referenceImageFacingAxis(shape: Pick<WorkplaneShape, "rotation" | "rotationX" | "rotationZ">): "x" | "y" | "z" {
  const up = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(shape.rotationX ?? 0),
    THREE.MathUtils.degToRad(shape.rotation ?? 0),
    THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
  ));
  const x = Math.abs(up.x);
  const y = Math.abs(up.y);
  const z = Math.abs(up.z);
  return y >= x && y >= z ? "y" : x >= z ? "x" : "z";
}

/** Whether mirroring across `axis` would turn this shape's picture away: true only for a reference image facing along it. */
export function mirrorHidesReferenceImage(shape: WorkplaneShape, axis: "x" | "y" | "z") {
  return isReferenceImage(shape) && referenceImageFacingAxis(shape) === axis;
}
