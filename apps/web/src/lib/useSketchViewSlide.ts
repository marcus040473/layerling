import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { prefersReducedMotion, turnEase, VIEW_CUBE_TURN_MS } from "@/lib/viewCubeTransition";
import type { SketchView } from "@/lib/sketchPointerControls";

/** How far a double click may be let go from where its second press began, in screen pixels, as in the 3D view. */
export const SKETCH_DOUBLE_CLICK_PIXELS = 5;

/**
 * A double click on the empty sketch plate slides the view so that the spot comes to the middle,
 * eased out over the same time as the 3D view's slide; with less motion asked for, it cuts there.
 * Only the pan moves, so a zoom during the slide is kept; `stop` leaves the view where it is.
 */
export function useSketchViewSlide(setView: Dispatch<SetStateAction<SketchView>>) {
  const frameRef = useRef<number | null>(null);
  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);
  const slideTo = useCallback((from: SketchView["pan"], to: SketchView["pan"]) => {
    stop();
    if (prefersReducedMotion()) {
      setView((current) => ({ ...current, pan: to }));
      return;
    }
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / VIEW_CUBE_TURN_MS);
      const eased = turnEase(progress);
      const pan = progress >= 1 ? to : { x: from.x + (to.x - from.x) * eased, z: from.z + (to.z - from.z) * eased };
      setView((current) => ({ ...current, pan }));
      frameRef.current = progress >= 1 ? null : requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
  }, [setView, stop]);
  useEffect(() => stop, [stop]);
  return { slideTo, stop };
}
