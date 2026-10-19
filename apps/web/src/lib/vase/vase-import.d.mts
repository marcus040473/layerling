// Types for vase-import.mjs: a vase's body form taken off a mesh (a model vase).
export function meshToProfile(
  soup: ArrayLike<number>,
  options?: { stations?: number; tolerance?: number },
): { ok: true; profilePoints: number[][]; height: number; diameter: number; notes: string[] } | { ok: false; notes: string[] };
