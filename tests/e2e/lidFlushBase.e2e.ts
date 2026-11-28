import { describe, expect, it } from "vitest";
import Module from "manifold-3d";
import { lidForSolid, normalizeLidOptions } from "@/lib/lidTool";

type Solid = { delete?: () => void };

function dispose(values: Solid[]) {
  Array.from(new Set(values)).forEach((value) => value?.delete?.());
}

async function runtime() {
  const manifold = await Module();
  manifold.setup();
  return manifold;
}

type Kernel = Awaited<ReturnType<typeof runtime>>;
type Body = ReturnType<Kernel["Manifold"]["cube"]>;

/**
 * A round pot `diameter` across and `height` high (y, the scene's up), with a wall `wall` thick and a floor 10 mm
 * thicker, open at the top, standing on y = 0 round the y axis: 60 across, 50 high, 2 mm wall. With a `foot` it narrows
 * over its lowest 10 mm to that diameter at the bottom, as a pot with a chamfered foot does.
 */
function openPot(kernel: Kernel, created: Solid[], foot: number | null = null, diameter = 60, height = 50, wall = 2, sides = 192) {
  const straight = kernel.Manifold.cylinder(height, diameter / 2, diameter / 2, sides);
  const cone = foot === null ? null : kernel.Manifold.cylinder(10, foot / 2, diameter / 2, sides);
  const upper = foot === null ? null : kernel.Manifold.cylinder(height - 10, diameter / 2, diameter / 2, sides).translate([0, 0, 10]);
  const outside = cone && upper ? cone.add(upper) : straight;
  const outer = outside.rotate([-90, 0, 0]);
  const cavity = kernel.Manifold.cylinder(height, diameter / 2 - wall, diameter / 2 - wall, sides).rotate([-90, 0, 0]).translate([0, 10 + wall, 0]);
  const pot = outer.subtract(cavity);
  created.push(straight, outside, outer, cavity, pot);
  if (cone) created.push(cone);
  if (upper) created.push(upper);
  return pot;
}

/** The cap turned back over and set on the body as it closes it: its plate on the rim, on the body's axis (the y axis). */
function closing(body: Body, lid: Body, thickness: number, created: Solid[]) {
  const turned = lid.rotate([180, 0, 0]);
  const box = turned.boundingBox();
  const placed = turned.translate([-(box.min[0] + box.max[0]) / 2, body.boundingBox().max[1] + thickness - box.max[1], -(box.min[2] + box.max[2]) / 2]);
  created.push(turned, placed);
  return placed;
}

/** How far the solid reaches from the y axis at the height `y`, measured on a thin slab round that height. */
function reachAt(kernel: Kernel, solid: Body, y: number, created: Solid[]) {
  const slab = kernel.Manifold.cube([400, 0.02, 400], true).translate([0, y, 0]);
  const cut = solid.intersect(slab);
  created.push(slab, cut);
  const box = cut.boundingBox();
  return Math.max(-box.min[0], box.max[0], -box.min[2], box.max[2]);
}

const SCREW = { type: "screw", thickness: 2, gap: 0.2, wall: 1.6, threadPitch: 3, threadTurns: 2 };

describe("a screw lid's flush base (real Manifold kernel, Discussion #2148)", () => {
  it("widens the body below the cap to the cap's width, up to the gap under the cap's rim, and the cap still screws on freely", async () => {
    const kernel = await runtime();
    const created: Solid[] = [];
    try {
      const body = openPot(kernel, created);
      const plain = lidForSolid(kernel, body, normalizeLidOptions(SCREW));
      const flush = lidForSolid(kernel, body, normalizeLidOptions({ ...SCREW, flushBase: true }));
      if ("error" in plain || "error" in flush) throw new Error(JSON.stringify([plain, flush]));
      created.push(plain.lid, plain.screw!.thread!, flush.lid, flush.screw!.thread!);
      expect(plain.screw!.flushBase).toBe(false);
      expect(flush.screw!.flushBase).toBe(true);
      // The cap is the same with and without: only the body changes.
      expect(flush.screw!.diameter).toBeCloseTo(plain.screw!.diameter, 9);
      expect(flush.lid.volume()).toBeCloseTo(plain.lid.volume(), 3);
      const capRadius = flush.screw!.diameter / 2;
      expect(capRadius).toBeGreaterThan(30 + 0.2 + 1.6);
      const whole = body.add(flush.screw!.thread!);
      const before = body.add(plain.screw!.thread!);
      created.push(whole, before);
      expect(whole.status()).toBe("NoError");
      // One piece with the body: the ring shares the wall with it.
      expect(whole.decompose().map((piece) => created.push(piece)).length).toBe(1);
      // The cap's rim reaches 6 mm down from the rim at 50 (two turns of 3 mm): its mouth is at 44, the shoulder the gap below.
      for (const y of [0.5, 10, 25, 43.7]) {
        expect([y, Math.round(reachAt(kernel, whole, y, created) * 100) / 100]).toEqual([y, Math.round(capRadius * 100) / 100]);
        expect(reachAt(kernel, before, y, created)).toBeCloseTo(30, 2);
      }
      expect(reachAt(kernel, whole, 43.9, created)).toBeLessThan(capRadius - 1);
      // Screwed on, the cap touches neither the thread nor the shoulder, and its outside continues the body's.
      const cap = closing(body, flush.lid, 2, created);
      const common = cap.intersect(whole);
      created.push(common);
      expect(common.volume()).toBeLessThan(1e-6);
      expect(cap.boundingBox().min[1]).toBeCloseTo(44, 6);
      expect(reachAt(kernel, cap, 45, created)).toBeCloseTo(capRadius, 2);
      // Lifted by less than the gap it is still free; pushed down by more than the gap it meets the shoulder.
      const down = cap.translate([0, -0.3, 0]);
      const met = down.intersect(whole);
      created.push(down, met);
      expect(met.volume()).toBeGreaterThan(1);
    } finally {
      dispose(created);
    }
  });

  it("fills out a foot that narrows to the ring's straight face, in one piece with the body and without closing its opening", async () => {
    const kernel = await runtime();
    const created: Solid[] = [];
    try {
      const body = openPot(kernel, created, 40);
      const result = lidForSolid(kernel, body, normalizeLidOptions({ ...SCREW, flushBase: true }));
      if ("error" in result) throw new Error(JSON.stringify(result.error));
      created.push(result.lid, result.screw!.thread!);
      const capRadius = result.screw!.diameter / 2;
      const whole = body.add(result.screw!.thread!);
      created.push(whole);
      expect(whole.decompose().map((piece) => created.push(piece)).length).toBe(1);
      for (const y of [0.5, 5, 9.5, 30]) expect(reachAt(kernel, whole, y, created)).toBeCloseTo(capRadius, 2);
      // No hollow is left between the ring and the cone of the foot, and the opening keeps its room.
      expect(whole.genus()).toBe(0);
      const cavity = kernel.Manifold.cylinder(30, 27.9, 27.9, 96).rotate([-90, 0, 0]).translate([0, 12.1, 0]);
      const inside = cavity.intersect(whole);
      created.push(cavity, inside);
      expect(inside.volume()).toBeLessThan(1e-6);
    } finally {
      dispose(created);
    }
  });

  it("goes only with a screw lid, not with a tether, and leaves the body alone under a standard's cap made alone", async () => {
    const kernel = await runtime();
    const created: Solid[] = [];
    try {
      const body = openPot(kernel, created);
      expect(lidForSolid(kernel, body, normalizeLidOptions({ type: "cap", flushBase: true }))).toEqual({ error: { code: "flushBaseType" } });
      expect(lidForSolid(kernel, body, normalizeLidOptions({ type: "bayonet", flushBase: true }))).toEqual({ error: { code: "flushBaseType" } });
      expect(lidForSolid(kernel, body, normalizeLidOptions({ ...SCREW, flushBase: true, tether: true }))).toEqual({ error: { code: "flushBaseTether" } });
      const alone = lidForSolid(kernel, body, normalizeLidOptions({ ...SCREW, threadStandard: "pco1881", flushBase: true }));
      if ("error" in alone) throw new Error(JSON.stringify(alone.error));
      created.push(alone.lid);
      expect(alone.screw!.thread).toBeNull();
      expect(alone.screw!.flushBase).toBe(false);
    } finally {
      dispose(created);
    }
  });
});
