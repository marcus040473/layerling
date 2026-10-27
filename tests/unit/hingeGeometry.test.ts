import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { hingeWorldParts } from "@/lib/hingeParts";
import { hingeSections, hingeConeRadius, hingeKnucklesForWidth, hingeHasExactParts, normalizeHingeStyle, hingeLocalParts, hingePlan, hingeTriangles, normalizeHingeKnuckleWidth, normalizeHingeKnuckles, normalizeHingeLeafThickness, normalizeHingePinDiameter } from "@/lib/hingeGeometry";

type V = [number, number, number];

function weld(triangles: V[][]) {
  const ids = new Map<string, number>();
  const id = (v: V) => {
    const key = v.map((n) => Math.round(n * 1e5)).join(",");
    if (!ids.has(key)) ids.set(key, ids.size);
    return ids.get(key)!;
  };
  return triangles.map((t) => t.map(id) as [number, number, number]);
}

/** Every directed edge appears once and its reverse once: closed, consistently wound, two-manifold. */
function edgeProblems(triangles: V[][]) {
  const faces = weld(triangles);
  const directed = new Map<string, number>();
  faces.forEach(([a, b, c]) => {
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      if (p === q) continue;
      const key = `${p}>${q}`;
      directed.set(key, (directed.get(key) ?? 0) + 1);
    }
  });
  let problems = 0;
  directed.forEach((count, key) => {
    const [p, q] = key.split(">");
    if (count !== 1 || directed.get(`${q}>${p}`) !== 1) problems += 1;
  });
  return problems;
}

function signedVolume(triangles: V[][]) {
  return triangles.reduce((sum, [a, b, c]) => sum + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6, 0);
}

function components(triangles: V[][]) {
  const faces = weld(triangles);
  const parent = new Map<number, number>();
  const find = (x: number): number => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  faces.forEach(([a, b, c]) => { parent.set(find(b), find(a)); parent.set(find(c), find(a)); });
  return new Set(faces.map(([a]) => find(a))).size;
}

const shape = { width: 40, depth: 40, height: 8 };

describe("hinge geometry", () => {
  it("is closed, wound outwards and in two separate parts", () => {
    const triangles = hingeTriangles(shape);
    expect(edgeProblems(triangles)).toBe(0);
    expect(signedVolume(triangles)).toBeGreaterThan(0);
    expect(components(triangles)).toBe(2);
  });

  it("stays closed for other sizes, counts and settings", () => {
    for (const fields of [
      { width: 25, depth: 30, height: 6, hingeKnuckles: 3 },
      { width: 80, depth: 60, height: 12, hingeKnuckles: 9, hingePinDiameter: 5, hingeLeafThickness: 3, hingeClearance: 0.25 },
      { width: 40, depth: 40, height: 8, hingeClearance: 1, sides: 24 },
    ]) {
      const triangles = hingeTriangles(fields);
      expect(edgeProblems(triangles)).toBe(0);
      expect(signedVolume(triangles)).toBeGreaterThan(0);
      expect(components(triangles)).toBe(2);
    }
  });

  it("without the pin the bore runs through every knuckle: closed, two parts, less material, tubes instead of the pin", () => {
    for (const fields of [{ width: 40, depth: 40, height: 8 }, { width: 80, depth: 60, height: 12, hingeKnuckles: 9, hingePinDiameter: 5, hingeLeafThickness: 3 }]) {
      const pinless = hingeTriangles({ ...fields, hingePinless: true });
      expect(edgeProblems(pinless)).toBe(0);
      expect(signedVolume(pinless)).toBeGreaterThan(0);
      expect(components(pinless)).toBe(2);
      expect(signedVolume(pinless)).toBeLessThan(signedVolume(hingeTriangles(fields)));
      const parts = hingeLocalParts({ ...fields, hingePinless: true });
      const plan = hingePlan({ ...fields, hingePinless: true });
      // no pin cylinder along the whole width, and A's knuckles are tubes like B's
      expect(parts.filter((part) => part.kind === "cylinder")).toHaveLength(0);
      expect(parts.filter((part) => part.kind === "tube")).toHaveLength(plan.knuckles);
    }
  });

  it("fills its frame: width along the axis, both leaves across, the knuckle as height", () => {
    const points = hingeTriangles(shape).flat();
    const range = (i: number) => [Math.min(...points.map((p) => p[i])), Math.max(...points.map((p) => p[i]))];
    expect(range(0)).toEqual([-20, 20]);
    expect(range(1)[0]).toBeCloseTo(0, 6);
    expect(range(1)[1]).toBeCloseTo(8, 1);
    expect(range(2)).toEqual([-20, 20]);
  });

  it("keeps the clearance between the parts", () => {
    const plan = hingePlan(shape);
    // B's bore is wider than the pin by the clearance, the knuckles keep a gap of it.
    expect(plan.boreRadius - plan.pinRadius).toBeCloseTo(0.4, 9);
    plan.segments.slice(1).forEach((segment, i) => expect(segment.x0 - plan.segments[i].x1).toBeCloseTo(0.4, 9));
    // A leaf's top corner, its closest point to the other part's round knuckle, keeps the clearance.
    expect(Math.hypot(plan.leafStart, plan.radius - plan.leaf) - plan.radius).toBeCloseTo(0.4, 9);
    // So does every point of the display mesh's knuckles: the nearest leaf corner is that far away.
    const corner = { u: -plan.leafStart, v: plan.leaf };
    const bKnuckle = hingeTriangles(shape).flat().filter(([x, y, z]) => Math.abs(x - plan.segments[1].x0) < 1e-6 && z < 0 && y > 0);
    expect(bKnuckle.length).toBeGreaterThan(10);
    const closest = Math.min(...bKnuckle.map(([, y, z]) => Math.hypot(z - corner.u, y - corner.v)));
    expect(closest).toBeGreaterThanOrEqual(0.4 - 1e-6);
    // And stays below B's bore.
    expect(plan.leaf).toBeLessThanOrEqual(plan.radius - plan.boreRadius + 1e-9);
    expect(plan.segments.map((segment) => segment.owner)).toEqual(["a", "b", "a", "b", "a"]);
  });

  it("keeps the settings printable", () => {
    expect(normalizeHingeKnuckles(4)).toBe(5);
    expect(normalizeHingeKnuckles(15, 10, 0.4)).toBeLessThan(15);
    expect(normalizeHingePinDiameter(20, 8)).toBeLessThan(8);
    expect(normalizeHingeLeafThickness(10, 8, 3, 0.4)).toBeCloseTo(4 - 1.5 - 0.4, 9);
  });

  it("splits into parts the CAD kernel knows, covering the frame", () => {
    const parts = hingeLocalParts(shape);
    expect(new Set(parts.map((part) => part.kind))).toEqual(new Set(["box", "cylinder", "tube"]));
    expect(parts.filter((part) => part.kind === "tube")).toHaveLength(2);
    expect(parts.filter((part) => part.kind === "cylinder")).toHaveLength(4);
  });

  it.each([30, 90, 180])("folds part B up by %i degrees about the pin without changing the bodies (#699)", (hingeAngle) => {
    const flat = hingeTriangles(shape);
    const folded = hingeTriangles({ ...shape, hingeAngle });
    expect(edgeProblems(folded)).toBe(0);
    expect(components(folded)).toBe(2);
    expect(signedVolume(folded)).toBeCloseTo(signedVolume(flat), 6);
    const plan = hingePlan(shape);
    const top = Math.max(...folded.flat().map(([, y]) => y));
    expect(top).toBeGreaterThanOrEqual(plan.height - 1e-6);
    if (hingeAngle === 90) expect(top).toBeCloseTo(plan.radius + plan.depth / 2, 6);
  });

  it("places B's exact boxes where the folded display mesh has its leaf (#699)", () => {
    for (const hingeAngle of [0, 45, 90, 135, 180]) {
      const fields = { ...shape, hingeAngle };
      const mesh = hingeTriangles(fields).flat();
      const corners: V[] = [];
      hingeLocalParts(fields).filter((part) => part.kind === "box").forEach((part) => {
        const turn = ((part.rotationX ?? 0) * Math.PI) / 180;
        const cy = (part.elevation ?? 0) + part.height / 2;
        for (const dx of [-0.5, 0.5]) for (const dy of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) {
          const y = dy * part.height;
          const z = dz * (part.depth ?? 0);
          // Three's rotation about x by `turn`: y' = y cos - z sin, z' = y sin + z cos.
          corners.push([(part.x) + dx * part.width, cy + y * Math.cos(turn) - z * Math.sin(turn), (part.z ?? 0) + y * Math.sin(turn) + z * Math.cos(turn)]);
        }
      });
      // The knuckles' square, which the round tubes and the pin stay inside.
      for (const y of [0, shape.height]) for (const z of [-shape.height / 2, shape.height / 2]) corners.push([0, y, z]);
      for (const axis of [1, 2]) {
        expect(Math.max(...corners.map((c) => c[axis]))).toBeCloseTo(Math.max(...mesh.map((v) => v[axis])), 3);
        expect(Math.min(...corners.map((c) => c[axis]))).toBeCloseTo(Math.min(...mesh.map((v) => v[axis])), 3);
      }
    }
  });

  it("keeps the folded boxes in the world where the turned hinge's display mesh is (#699)", () => {
    const hinge = { id: "h", name: "H", kind: "hinge", color: "#fff", x: 12, z: -7, elevation: 3, size: 40, ...shape, rotation: 30, rotationX: 20, rotationZ: 15, hingeAngle: 70 } as never as Parameters<typeof hingeWorldParts>[0];
    const centerY = shape.height / 2;
    const turn = new THREE.Euler(THREE.MathUtils.degToRad(20), THREE.MathUtils.degToRad(30), THREE.MathUtils.degToRad(15), "XYZ");
    const matrix = new THREE.Matrix4().makeTranslation(12, 3 + centerY, -7).multiply(new THREE.Matrix4().makeRotationFromEuler(turn)).multiply(new THREE.Matrix4().makeTranslation(0, -centerY, 0));
    const mesh = hingeTriangles({ ...shape, hingeAngle: 70 }).flat().map(([x, y, z]) => new THREE.Vector3(x, y, z).applyMatrix4(matrix));
    const corners: THREE.Vector3[] = [];
    hingeWorldParts(hinge).filter((part) => part.kind === "box").forEach((part) => {
      const box = new THREE.Matrix4()
        .makeTranslation(part.x, (part.elevation ?? 0) + part.height / 2, part.z)
        .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(part.rotationX ?? 0), THREE.MathUtils.degToRad(part.rotation), THREE.MathUtils.degToRad(part.rotationZ ?? 0), "XYZ")));
      for (const dx of [-0.5, 0.5]) for (const dy of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) corners.push(new THREE.Vector3(dx * part.width, dy * part.height, dz * (part.depth ?? 0)).applyMatrix4(box));
    });
    // The round knuckles, which the boxes do not cover.
    for (let k = 0; k < 720; k += 1) for (const x of [-shape.width / 2, shape.width / 2]) corners.push(new THREE.Vector3(x, centerY + centerY * Math.sin((k * Math.PI) / 360), centerY * Math.cos((k * Math.PI) / 360)).applyMatrix4(matrix));
    const range = (points: THREE.Vector3[], axis: "x" | "y" | "z") => [Math.min(...points.map((p) => p[axis])), Math.max(...points.map((p) => p[axis]))];
    for (const axis of ["y", "z"] as const) {
      expect(range(corners, axis)[0]).toBeCloseTo(range(mesh, axis)[0], 1);
      expect(range(corners, axis)[1]).toBeCloseTo(range(mesh, axis)[1], 1);
    }
  });
});

describe("a knuckle width instead of a count (#907)", () => {
  it("takes the fewest odd knuckles that are not wider than asked", () => {
    // 40 mm with 0.4 mm gaps: 3 knuckles are 13.07 wide, 5 are 7.68, 7 are 5.37, 9 are 4.09.
    expect(hingeKnucklesForWidth(40, 14)).toBe(3);
    expect(hingeKnucklesForWidth(40, 8)).toBe(5);
    expect(hingeKnucklesForWidth(40, 5.4)).toBe(7);
    expect(hingeKnucklesForWidth(40, 5.3)).toBe(9);
  });

  it("follows the length of the hinge", () => {
    expect(hingeKnucklesForWidth(80, 8)).toBe(11);
    expect(hingePlan({ width: 80, height: 8, hingeKnuckleWidth: 8 }).knuckles).toBe(11);
    expect(hingePlan({ width: 40, height: 8, hingeKnuckleWidth: 8 }).knuckles).toBe(5);
  });

  it("reaches 31 knuckles and no further, and never one shorter than 1 mm", () => {
    expect(hingeKnucklesForWidth(300, 1)).toBe(31);
    expect(hingePlan({ width: 20, height: 8, hingeKnuckleWidth: 1 }).knuckleLength).toBeGreaterThanOrEqual(1);
  });

  it("leaves the count to hingeKnuckles without a width, and a width below 1 counts as 1", () => {
    expect(hingePlan({ width: 40, height: 8, hingeKnuckles: 7 }).knuckles).toBe(7);
    expect(hingePlan({ width: 40, height: 8, hingeKnuckles: 7, hingeKnuckleWidth: 0 }).knuckles).toBe(7);
    expect(normalizeHingeKnuckleWidth(0)).toBeUndefined();
    expect(normalizeHingeKnuckleWidth(-3)).toBeUndefined();
    expect(normalizeHingeKnuckleWidth(0.4)).toBe(1);
    expect(normalizeHingeKnuckleWidth(6)).toBe(6);
  });

  it("builds a closed body with the computed count", () => {
    const triangles = hingeTriangles({ width: 40, height: 8, hingeKnuckleWidth: 5.4 });
    expect(edgeProblems(triangles)).toBe(0);
    expect(hingePlan({ width: 40, height: 8, hingeKnuckleWidth: 5.4 }).knuckles).toBe(7);
  });
});

describe("the cone hinge (#907)", () => {
  const cases = [
    { width: 40, height: 8, hingeStyle: "cone" },
    { width: 40, height: 8, hingeStyle: "cone", hingeAngle: 90 },
    { width: 60, depth: 50, height: 10, hingeStyle: "cone", hingeKnuckles: 7, hingeClearance: 0.3, sides: 24 },
    { width: 30, height: 6, hingeStyle: "cone", hingeKnuckleWidth: 5 },
    { width: 15, height: 12, hingeStyle: "cone", hingeKnuckles: 15 },
  ];

  it("is a closed, consistently wound body in every case", () => {
    cases.forEach((shape) => expect(edgeProblems(hingeTriangles(shape)), JSON.stringify(shape)).toBe(0));
  });

  it("has no pin and no bore, only cones and recesses", () => {
    const plain = JSON.stringify(hingeTriangles({ width: 40, height: 8 }));
    const coned = JSON.stringify(hingeTriangles({ width: 40, height: 8, hingeStyle: "cone" }));
    expect(coned).not.toBe(plain);
    const plan = hingePlan({ width: 40, height: 8, hingeStyle: "cone" });
    expect(plan.style).toBe("cone");
    expect(plan.coneRadius).toBeGreaterThan(0.7);
    expect(plan.recessRadius).toBeGreaterThan(plan.coneRadius - plan.clearance);
  });

  it("keeps a thin wall between the two recesses of a knuckle and the clearance to the cone", () => {
    cases.forEach((shape) => {
      const plan = hingePlan(shape);
      expect(plan.knuckleLength - 2 * plan.recessDepth, JSON.stringify(shape)).toBeGreaterThanOrEqual(0.39);
      // The cone's point stays short of the recess's by the radial gap.
      expect(plan.recessDepth + plan.clearance - plan.coneRadius).toBeGreaterThan(0);
    });
  });

  it("makes fewer knuckles when they are too short for a cone", () => {
    const plan = hingePlan({ width: 15, height: 12, hingeStyle: "cone", hingeKnuckles: 15 });
    expect(plan.knuckles).toBeLessThan(15);
    expect(hingeConeRadius(plan.knuckleLength, 12, plan.clearance)).toBeGreaterThanOrEqual(0.8);
  });

  it("is the pin hinge when the style is anything else", () => {
    expect(hingePlan({ width: 40, height: 8, hingeStyle: "other" }).style).toBe("pin");
    expect(hingeTriangles({ width: 40, height: 8, hingeStyle: "other" }).length).toBe(hingeTriangles({ width: 40, height: 8 }).length);
  });
});

describe("the cone hinge, second round (#907)", () => {
  it("lets the leaf be as thick as the whole knuckle, and the body stays closed", () => {
    const flush = { width: 40, height: 6, hingeStyle: "cone", hingeLeafThickness: 6 };
    expect(hingePlan(flush).leaf).toBe(6);
    expect(edgeProblems(hingeTriangles(flush))).toBe(0);
    const thick = { width: 40, height: 6, hingeStyle: "cone", hingeLeafThickness: 4.5, hingeAngle: 60 };
    expect(hingePlan(thick).leaf).toBe(4.5);
    expect(edgeProblems(hingeTriangles(thick))).toBe(0);
    // The pin hinge keeps its limit: the leaf stays below the bore.
    expect(hingePlan({ width: 40, height: 6, hingeLeafThickness: 6 }).leaf).toBeLessThan(2);
  });

  it("keeps the clearance to the other part's knuckle with a thick leaf", () => {
    const plan = hingePlan({ width: 40, height: 6, hingeStyle: "cone", hingeLeafThickness: 6 });
    // A leaf thicker than the radius ends the clearance away from the knuckle's side, level with the axis.
    expect(plan.leafStart).toBeCloseTo(plan.radius + plan.clearance, 6);
  });

  it("takes a cone diameter, never larger than fits", () => {
    const largest = hingePlan({ width: 40, height: 8, hingeStyle: "cone" }).coneRadius;
    expect(hingePlan({ width: 40, height: 8, hingeStyle: "cone", hingeConeSize: 3 }).coneRadius).toBeCloseTo(1.5, 6);
    expect(hingePlan({ width: 40, height: 8, hingeStyle: "cone", hingeConeSize: 99 }).coneRadius).toBeCloseTo(largest, 6);
    expect(largest).toBeGreaterThan(2.4);
    expect(edgeProblems(hingeTriangles({ width: 40, height: 8, hingeStyle: "cone", hingeConeSize: 3 }))).toBe(0);
  });

  it("has the pin, the bore for a pin of one's own and the cones as one choice of style", () => {
    expect(normalizeHingeStyle(undefined)).toBe("pin");
    expect(normalizeHingeStyle("pinless")).toBe("pinless");
    expect(normalizeHingeStyle("cone")).toBe("cone");
    // A design saved with the old switch keeps its bore; an explicit style wins.
    expect(normalizeHingeStyle(undefined, true)).toBe("pinless");
    expect(normalizeHingeStyle("pin", true)).toBe("pin");
    expect(hingePlan({ width: 40, height: 8, hingePinless: true }).pinless).toBe(true);
    expect(hingePlan({ width: 40, height: 8, hingeStyle: "pinless" }).pinless).toBe(true);
    expect(hingePlan({ width: 40, height: 8, hingeStyle: "cone", hingePinless: true }).pinless).toBe(false);
    expect(hingeHasExactParts({ hingeStyle: "pinless" })).toBe(true);
    expect(hingeHasExactParts({ hingePinless: true })).toBe(true);
    expect(hingeHasExactParts({ hingeStyle: "cone" })).toBe(false);
  });
});

describe("the two parts keep the clearance apart in every section (#907)", () => {
  type Pt = { u: number; v: number };
  const segDist = (p: Pt, q: Pt, r: Pt, s: Pt) => {
    const pointToSeg = (a: Pt, b: Pt, c: Pt) => {
      const dx = c.u - b.u; const dy = c.v - b.v;
      const l = dx * dx + dy * dy;
      const k = l === 0 ? 0 : Math.max(0, Math.min(1, ((a.u - b.u) * dx + (a.v - b.v) * dy) / l));
      return Math.hypot(a.u - (b.u + k * dx), a.v - (b.v + k * dy));
    };
    return Math.min(pointToSeg(p, r, s), pointToSeg(q, r, s), pointToSeg(r, p, q), pointToSeg(s, p, q));
  };
  const gap = (a: Pt[], b: Pt[]) => {
    let best = Infinity;
    for (let i = 0; i < a.length; i += 1) for (let j = 0; j < b.length; j += 1) best = Math.min(best, segDist(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]));
    return best;
  };
  const cases = [
    { width: 40, height: 8 },
    { width: 40, height: 8, hingeLeafThickness: 3 },
    { width: 40, height: 6, hingeStyle: "cone", hingeLeafThickness: 3 },
    { width: 40, height: 6, hingeStyle: "cone", hingeLeafThickness: 4.5 },
    { width: 40, height: 6, hingeStyle: "cone", hingeLeafThickness: 6 },
    { width: 40, height: 2, hingeStyle: "cone", hingeLeafThickness: 2 },
    { width: 40, height: 12, hingeStyle: "cone", hingeLeafThickness: 12, hingeClearance: 0.6 },
  ];
  it("holds the clearance between A's and B's sections", () => {
    cases.forEach((shape) => {
      const plan = hingePlan(shape);
      const s = hingeSections(plan);
      const clearance = plan.clearance;
      // Where A's knuckle stands, B shows its leaf; where B's knuckle stands, A shows its leaf strip.
      expect(gap(s.aFull, s.bLeaf), JSON.stringify(shape)).toBeGreaterThanOrEqual(clearance - 1e-6);
      expect(gap(s.bFull, s.aLeaf), JSON.stringify(shape)).toBeGreaterThanOrEqual(clearance - 1e-6);
    });
  });
});
