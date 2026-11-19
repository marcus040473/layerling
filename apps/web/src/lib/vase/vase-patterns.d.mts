// Types for vase-patterns.mjs: the patterns worked out on the vase's own wall. Only what the editor uses is declared here.

import type { VaseSettings } from "./vase-geometry.mjs";

export const PATTERNS: Readonly<Record<string, string>>;
export const PATTERN_FLANKS: Readonly<Record<string, string>>;
export const PATTERN_WAYS: Readonly<Record<string, string>>;

/**
 * The settings a pattern starts with, as a change of the vase's settings: for the vase's own pattern (`slot` 0) or
 * the second one over it (1). Empty for anything that is not one of PATTERNS.
 */
export function patternStarter(pattern: string, slot?: 0 | 1): Partial<VaseSettings>;
