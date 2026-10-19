// Types for svg-import.mjs: a vase's cross-section or body form from an SVG drawing.
import type { VaseDrawPoint } from "./vase-geometry.mjs";

export function svgToSection(text: string): { ok: true; drawPoints: VaseDrawPoint[]; notes: string[] } | { ok: false; notes: string[] };
export function svgToProfile(
  text: string,
  options?: { tolerance?: number },
): { ok: true; profilePoints: number[][]; height: number; diameter: number; notes: string[] } | { ok: false; notes: string[] };
