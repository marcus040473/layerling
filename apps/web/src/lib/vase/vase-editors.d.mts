// Types for vase-editors.mjs: the vase tool's drawing boards, in Layerling's version (texts by key).
import type { VaseSettings } from "./vase-geometry.mjs";

export type VaseDrawingOptions = {
  /** The vase's settings as the board shows them: height and widest diameter in real millimetres. */
  get: () => VaseSettings;
  /** Takes a change; `draft` while a point is dragged, a rough preview is enough then. */
  set: (patch: Partial<VaseSettings>, options?: { draft?: boolean }) => void;
  notify?: (message: string) => void;
  /** The board's texts, by their vaseDraw.* keys. */
  tr: (key: string, params?: Record<string, string | number>) => string;
  /** A note from the import modules (in German) in the current language. */
  note?: (text: string) => string;
  /** Number format, e.g. "en" or "de-DE". */
  locale?: string;
  /** Reads a mesh file into triangles (9 numbers each, z up); without it there is no button for it. */
  readMesh?: (name: string, bytes: Uint8Array) => Promise<ArrayLike<number>>;
};

export type VaseDrawingBoard = { el: HTMLElement; render: () => void; fit: () => void; select: (index: number | null) => void };

export function sectionEditor(options: VaseDrawingOptions): VaseDrawingBoard;
export function profileEditor(options: VaseDrawingOptions): VaseDrawingBoard;
export function twistEditor(options: VaseDrawingOptions): VaseDrawingBoard;
