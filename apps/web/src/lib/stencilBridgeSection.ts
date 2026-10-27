import type { CrossSection } from "manifold-3d";
import { stencilBridges, type StencilBridgeOptions } from "@/lib/stencilBridges";

/** The part of the Manifold runtime the bridges need: building a cross section and joining several. */
type SectionRuntime = {
  CrossSection: {
    new (polygons: Array<Array<[number, number]>>, fillRule?: "EvenOdd" | "NonZero" | "Positive" | "Negative"): CrossSection;
    union(sections: CrossSection[]): CrossSection;
  };
};

/**
 * The parts of a cut outline that would fall out, held by stencil bridges (stencilBridges.ts) joined into it: the
 * outline as it is when `bridges` is null. `created` collects what has to be disposed.
 */
export function withStencilBridges(runtime: SectionRuntime, section: CrossSection, bridges: StencilBridgeOptions | null, created: unknown[]) {
  if (!bridges) return { section, bridgeCount: 0, unheldCount: 0 };
  const loops = section.toPolygons().map((polygon) => polygon.map(([x, y]) => [x, y] as const));
  const { rects, unheld } = stencilBridges(loops, bridges);
  if (rects.length === 0) return { section, bridgeCount: 0, unheldCount: unheld };
  const extra = new runtime.CrossSection(rects, "NonZero");
  created.push(extra);
  const joined = runtime.CrossSection.union([section, extra]);
  created.push(joined);
  return { section: joined, bridgeCount: rects.length, unheldCount: unheld };
}
