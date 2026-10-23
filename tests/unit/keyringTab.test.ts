import { describe, expect, it } from "vitest";
import { keyringTabAt, keyringTabPlace, keyringTabShape, keyringTabTag, textFreeKeyring, textFreeKeyringPlace } from "@/lib/editorTextTags";
import { freeKeyringCenter, isTextKeyring, textKeyringReaches } from "@/lib/textGeometry";
import { layerTextKeyringArgument, placedKeyring, type KeyringArgument } from "@/lib/textLayers";
import { shapeBedFootprint } from "@/lib/printBed";
import { restoreGroupedChildren } from "@/lib/editorBooleans";
import type { WorkplaneShape } from "@/types/layerling";

// #598: "Free" puts a key ring tab of its own beside a tag, an ordinary group to move and turn.
const tag = (overrides: Partial<WorkplaneShape> = {}): WorkplaneShape => ({
  id: "tag", name: "Tag", kind: "cube", color: "#2b2b2b", x: 10, z: -4, elevation: 2, rotation: 0,
  width: 40, depth: 16, height: 5.4, size: 40, ...overrides,
});

describe("the key ring tab of its own (#598)", () => {
  it.each([3, 5])("has the side tab's measures round a %s mm hole, in the bottom layer's colour and height", (diameter) => {
    const tab = keyringTabShape(tag(), { color: "#123456", height: 3, elevation: 2 }, diameter, "Key ring tab");
    const radius = diameter / 2 + 1.75;
    expect(tab.name).toBe("Key ring tab");
    expect(tab.color).toBe("#123456");
    expect(tab.hole).toBe(false);
    expect(tab.elevation).toBeCloseTo(2, 6);
    expect(tab.height).toBeCloseTo(3, 6);
    const parts = restoreGroupedChildren(tab);
    const capsule = parts.find((part) => part.kind === "slot")!;
    const hole = parts.find((part) => part.kind === "cylinder")!;
    expect(capsule.hole).toBe(false);
    expect(hole.hole).toBe(true);
    // As wide as the hole and a 1.75 mm wall either side; the hole the size asked for.
    expect(capsule.depth).toBeCloseTo(2 * radius, 3);
    expect(hole.width).toBeCloseTo(diameter, 6);
    expect(hole.depth).toBeCloseTo(diameter, 6);
    const footprint = shapeBedFootprint(tag());
    // The hole's edge 2 mm beyond the tag's left side, level with its middle.
    expect(hole.x).toBeCloseTo(footprint.minX - 2 - diameter / 2, 3);
    expect(hole.z).toBeCloseTo((footprint.minZ + footprint.maxZ) / 2, 3);
    // The round end round the hole, the straight end half the tab's width on the tag.
    expect(capsule.x - capsule.width! / 2).toBeCloseTo(hole.x - radius, 3);
    expect(capsule.x + capsule.width! / 2).toBeCloseTo(footprint.minX + radius, 3);
  });

  it("is a group of its own that moves and turns like any shape", () => {
    const tab = keyringTabShape(tag({ rotation: 30 }), { color: "#2b2b2b", height: 3, elevation: 0 }, 3, "Key ring tab");
    expect(tab.groupedShapes).toHaveLength(2);
    expect(tab.groupOperation).toBeUndefined();
    expect(tab.rotation).toBe(0);
    expect(tab.id).not.toBe("tag");
    expect(tab.keyringTab).toBe(true);
  });

  it("is fixed to the nearest name tag or icon tag that is neither locked nor hidden", () => {
    const tab = keyringTabShape(tag(), { color: "#2b2b2b", height: 3, elevation: 0 }, 3, "Key ring tab");
    const bundle = (id: string, x: number, extra: Partial<WorkplaneShape> = {}) => tag({ id, x, groupOperation: "bundle", groupedShapes: [tag({ id: `${id}-part` })], ...extra });
    const near = bundle("near", 10, { layeredText: true });
    const far = bundle("far", 200, { layeredIcon: true });
    const plain = bundle("plain", 5);
    const box = tag({ id: "box", x: 0 });
    expect(keyringTabTag(tab, [far, near, plain, box, tab])?.id).toBe("near");
    expect(keyringTabTag(tab, [far, { ...near, locked: true }])?.id).toBe("far");
    expect(keyringTabTag(tab, [far, { ...near, hidden: true }])?.id).toBe("far");
    expect(keyringTabTag(tab, [plain, box, tab])).toBeNull();
  });
});

describe("a key ring tab fixed to the tag where it was put (#598)", () => {
  const near = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    expect(a.x).toBeCloseTo(b.x, 3);
    expect(a.z).toBeCloseTo(b.z, 3);
  };

  it.each([0, 37, 90, 200])("reads back where a tab turned %s degrees holds its hole", (degrees) => {
    const radians = (degrees * Math.PI) / 180;
    const place = { hole: { x: -12, z: 7 }, direction: { x: Math.cos(radians), z: Math.sin(radians) }, length: 9.5, diameter: 4 };
    const tab = keyringTabAt(place, { color: "#2b2b2b", height: 3, elevation: 1 }, "Key ring tab");
    expect(tab.keyringTab).toBe(true);
    // The tab itself is turned the way it runs, so its handles show it.
    const turn = ((tab.rotation ?? 0) * Math.PI) / 180;
    expect(Math.cos(turn)).toBeCloseTo(place.direction.x, 3);
    expect(-Math.sin(turn)).toBeCloseTo(place.direction.z, 3);
    const read = keyringTabPlace(tab)!;
    near(read.hole, place.hole);
    near(read.direction, place.direction);
    expect(read.length).toBeCloseTo(place.length, 3);
    expect(read.diameter).toBeCloseTo(4, 6);
  });

  it.each([0, 30, -120])("keeps a hole put by a tag turned %s degrees and gives it back in the same place", (turn) => {
    const letters = tag({ id: "letters", x: 20, z: -6, rotation: turn, width: 40, depth: 12 });
    const place = { hole: { x: 3, z: 1 }, direction: { x: 0.6, z: 0.8 }, length: 8, diameter: 3 };
    const free = textFreeKeyring(letters, place);
    const back = textFreeKeyringPlace(letters, { side: "left", diameter: 3, free });
    near(back.hole, place.hole);
    near(back.direction, place.direction);
    expect(back.length).toBeCloseTo(8, 3);
  });

  it("keeps the hole to the corner of the letters it is nearest to, so it stays there when the words get longer", () => {
    const letters = tag({ id: "letters", x: 0, z: 0, width: 40, depth: 12 });
    const free = textFreeKeyring(letters, { hole: { x: -26, z: -3 }, direction: { x: 1, z: 0 }, length: 8, diameter: 3 });
    expect(free).toMatchObject({ ax: -1, az: -1 });
    expect(free.dx).toBeCloseTo(-6, 3);
    expect(free.dz).toBeCloseTo(3, 3);
    // Twice as long: the hole moves with the left edge.
    expect(freeKeyringCenter(free, { width: 80, depth: 12 })).toEqual({ x: -46, z: -3 });
  });

  it("grows the bottom layer's box only by what the ear reaches beyond it, on the sides of its corner", () => {
    const free = { ax: -1 as const, az: -1 as const, dx: -6, dz: 3, angle: 0, length: 8 };
    const reaches = textKeyringReaches({ textKeyring: { side: "left", diameter: 3, offset: 0, ear: true, free } });
    // The disc round the hole (3.25 mm) reaches 6 + 3.25 mm left of the letters' box and 3.25 - 3 mm above it.
    expect(reaches.left).toBeCloseTo(9.25, 3);
    expect(reaches.right).toBe(0);
    expect(reaches.top).toBeCloseTo(0.25, 3);
    expect(reaches.bottom).toBe(0);
    // The layers above have the hole only, no ear, and do not grow.
    expect(textKeyringReaches({ textKeyring: { side: "left", diameter: 3, offset: 0, free } })).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });

  it("is a key ring a file may carry, and nothing else is", () => {
    const free = { ax: 1, az: -1, dx: 2, dz: -1, angle: 45, length: 7 };
    expect(isTextKeyring({ side: "left", diameter: 3, offset: 0, ear: true, free })).toBe(true);
    expect(isTextKeyring({ side: "left", diameter: 3, offset: 0, free: { ...free, ax: 0 } })).toBe(false);
    expect(isTextKeyring({ side: "left", diameter: 3, offset: 0, free: { ...free, length: -1 } })).toBe(false);
  });
});

describe("a free key ring hole through the AI bridge (#598)", () => {
  it("takes side free with the hole's place and fills in the ear towards the middle", () => {
    const argument = layerTextKeyringArgument({ side: "free", x: -26, z: 0 });
    expect(argument).toEqual({ keyring: { side: "left", diameter: 3, at: { x: -26, z: 0 } } });
    const keyring = placedKeyring((argument as { keyring: KeyringArgument }).keyring, { width: 40, depth: 12 })!;
    // Towards the middle is along +x; the hole's middle is 6 mm outside the box, so the ear runs 6 + 3.25 mm.
    expect(keyring.free).toMatchObject({ ax: -1, dx: -6, angle: 0 });
    expect(keyring.free!.length).toBeCloseTo(9.25, 3);
  });

  it("refuses a free hole without its place, and keeps a side as it was", () => {
    expect(layerTextKeyringArgument({ side: "free", x: 3 })).toHaveProperty("error");
    expect(layerTextKeyringArgument({ side: "free", x: 3, z: 1, length: -2 })).toHaveProperty("error");
    expect(placedKeyring({ side: "right", diameter: 4 }, { width: 40, depth: 12 })).toEqual({ side: "right", diameter: 4 });
  });
});
