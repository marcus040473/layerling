import type { CrossSection, ManifoldToplevel } from "manifold-3d";
import { orderedCadSketchPaths, silhouetteSketchProfile } from "@/lib/sketchCadProfile";
import { sampledPath, strokedSketchProfile, type Keep } from "@/lib/sketchStroke";
import { freeKeyringCenter, freeKeyringExtent, freeKeyringStrip, isFreeKeyring, KEYRING_HOLE_EDGE_DISTANCE, keyringAlongLimit, keyringEarRadius, MAX_KEYRING_DIAMETER, MIN_KEYRING_DIAMETER, normalizeFreeKeyring, TEXT_KEYRING_SIDES } from "@/lib/textGeometry";
import type { FreeKeyring, SketchKeyring, SketchProfile, TextKeyringSide } from "@/types/layerling";

/**
 * A key ring hole in an extruded sketch, as the name tag has one (#391): used by the icon tag, whose
 * layers are sketch bodies. The hole belongs to the sketch, in its own coordinates; the body is built
 * from the outline the sketch fills (with its "Wider" line and its silhouette), a tab - the ear - on
 * the bottom layer, and the hole cut through every layer.
 */

const HOLE_SEGMENTS = 64;

/** A key ring hole as stored: a known side, a diameter within range, a middle (in the sketch's mm) and the ear switch. */
export function normalizeSketchKeyring(value: unknown): SketchKeyring | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<SketchKeyring>;
  const diameter = Number(candidate.diameter);
  const x = Number(candidate.x);
  const z = Number(candidate.z);
  const along = Number(candidate.along ?? 0);
  if (![diameter, x, z].every(Number.isFinite) || diameter <= 0) return undefined;
  const free = normalizeFreeKeyring(candidate.free);
  return {
    side: TEXT_KEYRING_SIDES.includes(candidate.side as TextKeyringSide) ? (candidate.side as TextKeyringSide) : "left",
    diameter: Math.min(MAX_KEYRING_DIAMETER, Math.max(MIN_KEYRING_DIAMETER, diameter)),
    x,
    z,
    ...(Number.isFinite(along) && along !== 0 ? { along } : {}),
    ...(candidate.ear ? { ear: true } : {}),
    ...(free ? { free } : {}),
  };
}

export function isSketchKeyring(value: unknown): value is SketchKeyring {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const finite = (entry: unknown): entry is number => typeof entry === "number" && Number.isFinite(entry);
  return TEXT_KEYRING_SIDES.includes(candidate.side as TextKeyringSide)
    && finite(candidate.diameter) && candidate.diameter >= MIN_KEYRING_DIAMETER && candidate.diameter <= MAX_KEYRING_DIAMETER
    && finite(candidate.x) && finite(candidate.z)
    && (candidate.along === undefined || finite(candidate.along))
    && (candidate.ear === undefined || typeof candidate.ear === "boolean")
    && (candidate.free === undefined || isFreeKeyring(candidate.free));
}

type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

/** The extent of a sketch's closed outlines, curves sampled; null when it has none. */
export function sketchOutlineBounds(profile: SketchProfile): Bounds | null {
  let bounds: Bounds | null = null;
  orderedCadSketchPaths(profile).filter((path) => path.closed).forEach((path) => {
    sampledPath(path).forEach(({ x, z }) => {
      bounds = bounds
        ? { minX: Math.min(bounds.minX, x), maxX: Math.max(bounds.maxX, x), minZ: Math.min(bounds.minZ, z), maxZ: Math.max(bounds.maxZ, z) }
        : { minX: x, maxX: x, minZ: z, maxZ: z };
    });
  });
  return bounds;
}

/**
 * The key ring hole of an icon tag whose icon fills `area`, in the area's coordinates: its edge
 * KEYRING_HOLE_EDGE_DISTANCE beyond the bottom layer, which reaches `reach` mm beyond the icon, in the
 * middle of its side, or `along` mm off it (#671: up on the left and right, to the right on top),
 * kept within the side of a bottom layer `bottomGrow` mm wider than the icon. Null when the area has no outline.
 */
export function iconKeyringFor(area: SketchProfile, reach: number, side: TextKeyringSide, diameter: number, ear: boolean, along = 0, bottomGrow = 0, free?: FreeKeyring): SketchKeyring | null {
  const bounds = sketchOutlineBounds(area);
  if (!bounds) return null;
  if (free) {
    // A free hole (#598) keeps to a corner of the icon's box, where it was put.
    const middle = freeKeyringCenter(free, { width: bounds.maxX - bounds.minX, depth: bounds.maxZ - bounds.minZ });
    const x = (bounds.minX + bounds.maxX) / 2 + middle.x;
    const z = (bounds.minZ + bounds.maxZ) / 2 + middle.z;
    return { side, diameter, x, z, ...(ear ? { ear: true } : {}), free };
  }
  const away = Math.max(0, reach) + KEYRING_HOLE_EDGE_DISTANCE + diameter / 2;
  const limit = iconKeyringAlongLimit(area, side, diameter, bottomGrow);
  const shift = Math.round(Math.min(limit, Math.max(-limit, along)) * 1000) / 1000;
  const middleX = (bounds.minX + bounds.maxX) / 2 + (side === "top" ? shift : 0);
  const middleZ = (bounds.minZ + bounds.maxZ) / 2 - (side === "top" ? 0 : shift);
  const center = side === "top"
    ? { x: middleX, z: bounds.minZ - away }
    : { x: side === "right" ? bounds.maxX + away : bounds.minX - away, z: middleZ };
  return { side, diameter, x: center.x, z: center.z, ...(shift ? { along: shift } : {}), ...(ear ? { ear: true } : {}) };
}

/**
 * How far an icon tag's tab can move along its side (#671): within the side of the bottom layer, `bottomGrow` mm wider than the icon.
 * With `width` the area is read as scaled to that width, as the card knows the icon only by its outline and its width.
 */
export function iconKeyringAlongLimit(area: SketchProfile, side: TextKeyringSide, diameter: number, bottomGrow: number, width?: number) {
  const bounds = sketchOutlineBounds(area);
  if (!bounds) return 0;
  const span = bounds.maxX - bounds.minX;
  const scale = width !== undefined && span > 1e-9 ? width / span : 1;
  const across = (side === "top" ? span : bounds.maxZ - bounds.minZ) * scale;
  return keyringAlongLimit(across + 2 * Math.max(0, bottomGrow), diameter);
}

/**
 * How far the middle of the bottom layer's extent moves with the ear, in the sketch's mm: a body is
 * positioned by the middle of its extent, so the layers stay lined up only when the bottom one is
 * moved back by this much. `bottomGrow` is how much wider than the icon the bottom layer is.
 */
export function iconEarOffset(area: SketchProfile, bottomGrow: number, keyring: SketchKeyring): { x: number; z: number } {
  const bounds = sketchOutlineBounds(area);
  if (!bounds || !keyring.ear) return { x: 0, z: 0 };
  const grow = Math.max(0, bottomGrow);
  const radius = keyringEarRadius(keyring.diameter);
  const plate = { minX: bounds.minX - grow, maxX: bounds.maxX + grow, minZ: bounds.minZ - grow, maxZ: bounds.maxZ + grow };
  // A free ear (#598) reaches as far as its strip and its disc; one on a side as far as its disc.
  const ear = keyring.free ? freeKeyringExtent(keyring.diameter, keyring.free) : { minX: -radius, maxX: radius, minZ: -radius, maxZ: radius };
  const full = {
    minX: Math.min(plate.minX, keyring.x + ear.minX),
    maxX: Math.max(plate.maxX, keyring.x + ear.maxX),
    minZ: Math.min(plate.minZ, keyring.z + ear.minZ),
    maxZ: Math.max(plate.maxZ, keyring.z + ear.maxZ),
  };
  return { x: (full.minX + full.maxX) / 2 - (plate.minX + plate.maxX) / 2, z: (full.minZ + full.maxZ) / 2 - (plate.minZ + plate.maxZ) / 2 };
}

/**
 * The outline of a sketch that has a key ring hole, as a sketch of straight lines the usual extrusion
 * builds: the area the sketch fills, the ear added on the bottom layer, the hole cut. Null when the
 * sketch has no hole, or when nothing is left.
 */
export function keyringSketchProfile(runtime: ManifoldToplevel, profile: SketchProfile): SketchProfile | null {
  const keyring = normalizeSketchKeyring(profile.keyring);
  if (!keyring) return null;
  const { keyring: _keyring, ...plain } = profile;
  const made: CrossSection[] = [];
  const keep: Keep = (section) => {
    made.push(section);
    return section;
  };
  let polygons: ReturnType<CrossSection["toPolygons"]>;
  try {
    // The outline as the sketch is built without a hole: its silhouette, its line or "Wider" widening.
    let outline: SketchProfile = plain.silhouette ? silhouetteSketchProfile(plain) : plain;
    if (plain.stroke) {
      const stroked = strokedSketchProfile(runtime, outline);
      if (!stroked) return null;
      outline = plain.silhouette ? silhouetteSketchProfile(stroked) : stroked;
    }
    const loops = orderedCadSketchPaths(outline).filter((path) => path.closed).map(sampledPath).filter((loop) => loop.length >= 3);
    if (!loops.length) return null;
    const filled = keep(new runtime.CrossSection(loops.map((loop) => loop.map(({ x, z }) => [x, z] as [number, number])), "EvenOdd"));
    const disc = (radius: number) => keep(keep(runtime.CrossSection.circle(radius, HOLE_SEGMENTS)).translate([keyring.x, keyring.z]));
    let region = filled;
    if (keyring.ear && keyring.free) {
      // A free ear (#598) is drawn as it was placed: the disc round the hole and the strip towards the tag.
      const strip = keep(new runtime.CrossSection([freeKeyringStrip(keyring, keyring.diameter, keyring.free)], "Positive"));
      region = keep(keep(filled.add(strip)).add(disc(keyringEarRadius(keyring.diameter))));
    } else if (keyring.ear && !filled.isEmpty()) {
      const radius = keyringEarRadius(keyring.diameter);
      const rectangle = (x0: number, z0: number, x1: number, z1: number) => keep(new runtime.CrossSection([[
        [Math.min(x0, x1), Math.min(z0, z1)], [Math.max(x0, x1), Math.min(z0, z1)], [Math.max(x0, x1), Math.max(z0, z1)], [Math.min(x0, x1), Math.max(z0, z1)],
      ]], "Positive"));
      const { min, max } = filled.bounds();
      const top = keyring.side === "top";
      // The band the tab runs in; where the outline reaches furthest towards the tab, the tab starts half its width further in.
      const band = top ? rectangle(keyring.x - radius, min[1], keyring.x + radius, max[1]) : rectangle(min[0], keyring.z - radius, max[0], keyring.z + radius);
      const near = keep(filled.intersect(band));
      let inner: number;
      if (near.isEmpty()) inner = top ? (min[1] + max[1]) / 2 : (min[0] + max[0]) / 2;
      else {
        const reach = near.bounds();
        inner = keyring.side === "right" ? reach.max[0] - radius : keyring.side === "left" ? reach.min[0] + radius : reach.min[1] + radius;
      }
      const tab = top ? rectangle(keyring.x - radius, inner, keyring.x + radius, keyring.z) : rectangle(inner, keyring.z - radius, keyring.x, keyring.z + radius);
      region = keep(keep(filled.add(tab)).add(disc(radius)));
    }
    const holed = keep(region.subtract(disc(keyring.diameter / 2)));
    if (holed.isEmpty() || holed.area() <= 1e-9) return null;
    polygons = holed.toPolygons();
  } finally {
    new Set(made).forEach((section) => section.delete());
  }
  const points: SketchProfile["points"] = [];
  const segments: SketchProfile["segments"] = [];
  polygons.forEach((polygon, loopIndex) => {
    const ids = polygon.map((_, index) => `keyring-${loopIndex}-${index}`);
    polygon.forEach(([x, z], index) => points.push({ id: ids[index], x, z }));
    ids.forEach((id, index) => segments.push({ id: `keyring-${loopIndex}-s${index}`, startId: id, endId: ids[(index + 1) % ids.length], kind: "line" }));
  });
  return { points, segments };
}
