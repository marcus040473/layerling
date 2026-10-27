import { useCallback, useEffect, useRef, useState } from "react";
import { currentPointerType } from "@/lib/pointerReach";

/**
 * A value box beside a body opens a number field, and with it the on-screen keyboard. A finger aiming at the body or at
 * a handle lands on such a box now and then (#855, crazykay), so with a finger the first tap only marks the box and the
 * second tap on it, within `waitMs`, opens the field. A mouse or a pen opens it at once, as before.
 */
export function useTouchSecondTap(waitMs = 2500) {
  const [armed, setArmed] = useState<string | null>(null);
  const armedRef = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  /** True when the tap goes on (mouse, pen, or the second tap of a finger on the same box). */
  const accept = useCallback((key: string) => {
    window.clearTimeout(timer.current);
    if (currentPointerType() !== "touch" || armedRef.current === key) {
      armedRef.current = null;
      setArmed(null);
      return true;
    }
    armedRef.current = key;
    setArmed(key);
    timer.current = window.setTimeout(() => {
      armedRef.current = null;
      setArmed(null);
    }, waitMs);
    return false;
  }, [waitMs]);
  return { armed, accept };
}
