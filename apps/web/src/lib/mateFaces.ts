import * as THREE from "three";
import type { RoundFaceAxis } from "@/lib/roundFaceAxis";

type Vec = { x: number; y: number; z: number };

/**
 * A face clicked for "Align faces": the body, its outward normal and a point
 * on it, in world space. A round face (a hole, a pin) also brings its axis.
 */
export type FacePick = { shapeId: string; normal: Vec; point: Vec; axis?: RoundFaceAxis | null };

/**
 * How the moved face meets the other: "against" puts them face to face (back
 * to back, touching), "flush" lays them in one plane, side by side, and
 * "concentric" puts two round faces on one axis (#794).
 */
export type MateMode = "against" | "flush" | "concentric";

const vector = (value: Vec) => new THREE.Vector3(value.x, value.y, value.z);

/**
 * The shortest turn that points `from` along `to`. Opposite directions are
 * turned over about an axis across them.
 */
export function shortestTurn(from: Vec, to: Vec): THREE.Quaternion {
  const a = vector(from).normalize();
  const b = vector(to).normalize();
  if (a.dot(b) < -1 + 1e-9) {
    const helper = Math.abs(a.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    return new THREE.Quaternion().setFromAxisAngle(helper.cross(a).normalize(), Math.PI);
  }
  return new THREE.Quaternion().setFromUnitVectors(a, b);
}

/**
 * Moves the body of `source` so its face meets the face of `target`: first the
 * shortest turn about the clicked point that makes the faces parallel (none if
 * they already are), then a slide along the target face's normal only, so the
 * body keeps its place sideways. `gap` leaves that much room between the two
 * planes, measured out of the target face.
 */
export function mateMotion(source: Omit<FacePick, "shapeId">, target: Omit<FacePick, "shapeId">, mode: MateMode, gap = 0) {
  const targetNormal = vector(target.normal).normalize();
  const wanted = mode === "against" ? targetNormal.clone().negate() : targetNormal.clone();
  const rotation = shortestTurn(source.normal, wanted);
  const turned = Math.abs(rotation.w) < 1 - 1e-12;
  // The turn is about the clicked point, so that point stays where it is.
  const pivot = vector(source.point);
  const distance = vector(target.point).dot(targetNormal) + gap - pivot.dot(targetNormal);
  const translation = targetNormal.clone().multiplyScalar(distance);
  return { rotation: turned ? rotation : null, pivot, translation };
}

/**
 * Moves the body of `source` so its round face shares the axis of the round
 * face of `target` - a hole over a hole, a pin into a hole: the shortest turn
 * about the source axis's point that makes the axes parallel (either way
 * round, so a body never flips over), then a slide straight across onto the
 * target axis. The body keeps its depth along the axis.
 */
export function concentricMotion(source: Pick<RoundFaceAxis, "point" | "direction">, target: Pick<RoundFaceAxis, "point" | "direction">) {
  const targetDirection = vector(target.direction).normalize();
  const sourceDirection = vector(source.direction).normalize();
  const wanted = sourceDirection.dot(targetDirection) < 0 ? targetDirection.clone().negate() : targetDirection;
  const rotation = shortestTurn(sourceDirection, wanted);
  const turned = Math.abs(rotation.w) < 1 - 1e-12;
  const pivot = vector(source.point);
  const offset = vector(target.point).sub(pivot);
  const translation = offset.addScaledVector(targetDirection, -offset.dot(targetDirection));
  return { rotation: turned ? rotation : null, pivot, translation };
}
