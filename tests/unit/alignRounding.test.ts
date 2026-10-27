import { describe, expect, it } from "vitest";
import { roundedAlignedValue } from "@/lib/alignRounding";

describe("the position after Align or Mirror (#917)", () => {
  it("cleans floating-point noise of a position that is a round number", () => {
    expect(roundedAlignedValue(0.1 + 0.2)).toBe(0.3);
    expect(roundedAlignedValue(15 + 1e-12)).toBe(15);
    expect(roundedAlignedValue(-3.4729 + 4e-11)).toBe(-3.4729);
  });

  it("keeps the exact place of a turned body, which is no four-decimal number", () => {
    // The two values the second alignment of the report gave: rounded to four decimals they were 15.6404 and 22.3193,
    // about 0.00004 and 0.00002 mm off, enough to leave two boxes meeting in a corner a hair apart.
    expect(roundedAlignedValue(15.640357183517773)).toBe(15.640357183517773);
    expect(roundedAlignedValue(22.319316100057087)).toBe(22.319316100057087);
  });
});
