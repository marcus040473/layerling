import { cadSketchRegions, silhouetteSketchProfile } from "@/lib/sketchCadProfile";
import { isConstructionSegment } from "@/lib/sketchConstruction";
import { sketchBodyStretch } from "@/lib/sketchResize";
import type { SketchProfile, WorkplaneShape } from "@/types/layerling";

/**
 * A sketch taken apart by its outlines (#669): one sketch for every outer outline, with the holes
 * that lie in it, largest first. Outlines that only overlap become parts of their own, which the
 * extrusion would have joined. Every part keeps the construction lines, so each can still be lined
 * up when its sketch is edited; the template pictures go with the first part only. A sketch built
 * as a line, with a key ring hole or set in by the face tool is one piece and gives no parts, nor
 * does a sketch with a single outline.
 */
export function sketchOutlineParts(profile: SketchProfile): SketchProfile[] {
  if (profile.stroke || profile.keyring || profile.inset) return [];
  let regions;
  try {
    regions = cadSketchRegions(profile.silhouette ? silhouetteSketchProfile(profile) : profile);
  } catch {
    return [];
  }
  if (regions.length < 2) return [];
  const construction = profile.segments.filter(isConstructionSegment);
  return regions.map((region, index) => {
    const own = new Set([region.outer, ...region.holes].flatMap((path) => path.steps.map((step) => step.segment.id)));
    const segments = [...profile.segments.filter((segment) => own.has(segment.id)), ...construction];
    const used = new Set(segments.flatMap((segment) => [segment.startId, segment.endId]));
    const part: SketchProfile = {
      ...profile,
      points: profile.points.filter((point) => used.has(point.id)),
      segments,
    };
    if (index > 0 || !profile.images?.length) delete part.images;
    return part;
  });
}

/**
 * Whether an extruded sketch body comes apart by its sketch rather than by its triangles: its
 * outlines are rebuilt one by one, so every part stays an exact body with its own sketch. A body
 * stretched since, or with rounded or chamfered edges, would lose that in the rebuild and is
 * taken apart as a mesh.
 */
export function separatesBySketch(shape: WorkplaneShape) {
  if (!shape.sketchProfile || (shape.sketchOperation ?? (shape.sketchRevolve ? "revolve" : "extrude")) !== "extrude") return false;
  if (shape.locked || shape.hole || shape.groupedShapes?.length || shape.edgeTreatments?.length || sketchBodyStretch(shape)) return false;
  return sketchOutlineParts(shape.sketchProfile).length > 1;
}
