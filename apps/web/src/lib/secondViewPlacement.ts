/**
 * Where the second view's window stood and how big it was, so it opens there again. An app
 * preference of this browser, not part of a design.
 */

export const SECOND_VIEW_PLACEMENT_KEY = "layerling.secondView.window";

export type SecondViewPlacement = { left: number; top: number; width: number; height: number };

const DEFAULT_SIZE = { width: 960, height: 720 };
/** Smaller than this the view is of no use; a stored size below it is a mistake. */
const MIN_SIZE = 200;

export function readSecondViewPlacement(storage: Pick<Storage, "getItem"> | null): SecondViewPlacement | null {
  try {
    const raw = storage?.getItem(SECOND_VIEW_PLACEMENT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SecondViewPlacement>;
    const numbers = [value.left, value.top, value.width, value.height];
    if (!numbers.every((number) => typeof number === "number" && Number.isFinite(number))) return null;
    if ((value.width as number) < MIN_SIZE || (value.height as number) < MIN_SIZE) return null;
    return {
      left: Math.round(value.left as number),
      top: Math.round(value.top as number),
      width: Math.round(value.width as number),
      height: Math.round(value.height as number),
    };
  } catch {
    return null;
  }
}

export function writeSecondViewPlacement(storage: Pick<Storage, "setItem"> | null, placement: SecondViewPlacement) {
  if (placement.width < MIN_SIZE || placement.height < MIN_SIZE) return;
  try {
    storage?.setItem(SECOND_VIEW_PLACEMENT_KEY, JSON.stringify(placement));
  } catch {
    // Storage full or blocked: the window opens in the default place next time.
  }
}

/** The features for window.open: the stored place and size, or the default size where the browser puts it. */
export function secondViewWindowFeatures(placement: SecondViewPlacement | null) {
  if (!placement) return `popup,width=${DEFAULT_SIZE.width},height=${DEFAULT_SIZE.height}`;
  return `popup,left=${placement.left},top=${placement.top},width=${placement.width},height=${placement.height}`;
}

/** A window's place on the screen and the size of its page, as window.open takes them. */
export function placementOf(win: Pick<Window, "screenX" | "screenY" | "innerWidth" | "innerHeight">): SecondViewPlacement {
  return { left: win.screenX, top: win.screenY, width: win.innerWidth, height: win.innerHeight };
}

/**
 * Phones and tablets get no second view: they have no windows side by side, and a popup opens
 * there as a tab of its own. A finger as the main pointer says so; so does a browser that calls
 * itself mobile, or names Android, an iPhone, an iPad or an iPod - a tablet with a mouse or a
 * trackpad on it reports a fine pointer. An iPad that calls itself a Mac gives itself away by its
 * touch points. A laptop with a touch screen keeps it: its main pointer is the mouse or the trackpad.
 */
export function secondViewSupported(env: { coarsePointer: boolean; platform: string; maxTouchPoints: number; userAgent: string; mobile?: boolean }) {
  if (env.coarsePointer || env.mobile) return false;
  if (/Android|iPhone|iPad|iPod/i.test(env.userAgent) || /^(iPhone|iPad|iPod)/i.test(env.platform)) return false;
  if (/^Mac/i.test(env.platform) && env.maxTouchPoints > 1) return false;
  return true;
}
