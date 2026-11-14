import { describe, expect, it } from "vitest";
import { magnetsMeetGridCells, shellGridCellsOf } from "@/lib/shellGridMagnets";
import type { LidShapeMagnets } from "@/lib/lidTool";
import type { WorkplaneShape } from "@/types/layerling";

const body = { x: 0, z: 0, edgeTreatmentHistory: [{ feature: { kind: "shell", amount: 2, shellGrid: { cells: 999 } } }] } as unknown as WorkplaneShape;
/** A magnet post of 8 mm in each inner corner of a box `width` x `depth` with a 2 mm wall. */
const posts = (width: number, depth: number): LidShapeMagnets => ({
  pockets: [],
  posts: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => ({ kind: "cylinder", x: sx * (width / 2 - 2 - 4), z: sz * (depth / 2 - 2 - 4), width: 8, depth: 8 }) as unknown as WorkplaneShape),
});

describe("magnets in the corners of a box with a Gridfinity floor", () => {
  it("counts the cells of the floor for the box's size", () => {
    expect(shellGridCellsOf(130.5, 88.5, 2, 999)).toHaveLength(6);
    expect(shellGridCellsOf(130.5, 88.5, 2, 4)).toHaveLength(4);
    expect(shellGridCellsOf(10, 10, 2, 999)).toHaveLength(0);
  });

  it("meets a cell when the box is just as large as the cells need, and none when it has room", () => {
    expect(magnetsMeetGridCells(body, posts(130.5, 88.5), 130.5, 88.5)).toBe(true);
    expect(magnetsMeetGridCells(body, posts(160, 110), 160, 110)).toBe(false);
    // Fewer cells (the floor takes the 4 nearest the middle) leave the corners free.
    const fewer = { ...body, edgeTreatmentHistory: [{ feature: { kind: "shell", amount: 2, shellGrid: { cells: 2 } } }] } as unknown as WorkplaneShape;
    expect(magnetsMeetGridCells(fewer, posts(130.5, 88.5), 130.5, 88.5)).toBe(false);
  });

  it("has nothing to say about a body without a Gridfinity floor", () => {
    expect(magnetsMeetGridCells({ x: 0, z: 0 } as WorkplaneShape, posts(130.5, 88.5), 130.5, 88.5)).toBe(false);
  });
});
