import { expect, it } from "vitest";
import { cad, thread } from "./helpers/threadHarness";
import { cadModifierThreadForShape } from "@/lib/cadProfileExtrusion";
import { threadPartSolid } from "@/lib/threadSolid";
import { fuzzyCut, tidiedIfValid } from "@/lib/cadFuzzyCut";

// An M6 tapped hole through a block, the chamfer as long as the pitch (the defaults of a threaded hole): merging the
// faces of the cut turned a valid body invalid, and the group could not be filleted at all (#938).
it("keeps a block with an M6 tapped hole valid when its faces are merged", () => {
  for (const chamfer of [1, 0.9, 1.05, 0.5]) {
    const shape = thread({ threadRole: "bore", hole: true, threadChamfer: chamfer, threadChamferBottom: chamfer, height: 20, threadClearance: 0.4 } as never);
    const hole = threadPartSolid(cad, cadModifierThreadForShape(shape as never)! as never);
    const block = cad.translate(cad.makeBox(40, 20, 20), -20, 0, -10);
    const cut = fuzzyCut(cad, block, hole);
    expect(cad.isValid(cut), `chamfer ${chamfer}: the cut`).toBe(true);
    const tidied = tidiedIfValid(cad, cut);
    expect(cad.isValid(tidied), `chamfer ${chamfer}: after merging`).toBe(true);
    expect(cad.getSubShapes(tidied, "solid").length).toBe(1);
  }
});
