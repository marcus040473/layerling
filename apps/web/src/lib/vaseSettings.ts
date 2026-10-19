import { DEFAULTS, normalizeParams, type VaseSettings } from "@/lib/vase/vase-geometry.mjs";

/**
 * The vase's settings, apart from its mesh (vaseShape.ts), so that the lists
 * of shapes can compare and store them without three.js.
 */

export type { VaseSettings };

export const DEFAULT_VASE_SIZE = { width: DEFAULTS.diameter, depth: DEFAULTS.diameter, height: DEFAULTS.height } as const;

/** Complete and limited settings; what the core does not know falls away. */
export function normalizeVaseSettings(input: unknown): VaseSettings {
  return normalizeParams(input ?? {});
}

/**
 * The settings a vase in this frame is built with: its height and widest diameter are the frame's.
 * Legs moulded on stand under the body, so the body is that much lower and the whole fills the frame.
 */
export function vaseSettingsInFrame(settings: unknown, width: number, depth: number, height: number): VaseSettings {
  const vase = normalizeVaseSettings(settings);
  const body = vase.legMode === "angeformt" ? Math.max(20, height - vase.legHeight) : height;
  return normalizeParams({ ...vase, height: body, diameter: Math.max(width, depth) });
}

/** The settings that differ from the defaults: what makes this vase this vase. */
export function vaseSettingsChanges(settings: unknown): Partial<VaseSettings> {
  const full = normalizeVaseSettings(settings);
  const changes: Record<string, unknown> = {};
  (Object.keys(full) as (keyof VaseSettings)[]).forEach((key) => {
    if (key === "height" || key === "diameter") return;
    if (JSON.stringify(full[key]) !== JSON.stringify(DEFAULTS[key])) changes[key] = full[key];
  });
  return changes as Partial<VaseSettings>;
}

/** Settings sent as an object or as the JSON text the scene reports; anything else is none. */
export function parseVaseSettingsInput(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

/** Whether two vase settings build the same vase. */
export function vaseSettingsEqual(a: unknown, b: unknown) {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
