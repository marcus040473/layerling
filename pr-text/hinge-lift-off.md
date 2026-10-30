# Hinge: lift-off style and nut pockets

## Summary

- **Style: Lift-off** – a lift-off hinge, as on many doors: two knuckles, the lower one carrying the pin to the end, the upper one a sleeve that lifts off it, so a lid or a door comes off and goes back on. The knuckle count is always two (the count and width rows are hidden). It prints in place lying flat like the other styles; taken apart with **Separate Parts**, the pin's piece stands on its knuckle and the other on its sleeve, both without supports, for a pin printed upright. Mirror it for the other hand. Its exact parts are the pin hinge's – the pin runs the whole length, one knuckle each side – so the edge tool and the STEP export stay exact.
- **Nut pockets**, on every style: **Holes** now offers **Countersunk**, **Straight**, **Nut pocket** and **Countersunk + nut pocket**. A nut pocket is a hexagonal pocket over the hole on the top (the side facing the other leaf when closed), so a bolt from below holds; the mix countersinks the back leaf (the one with the pin) and gives the front one the pockets, as on a reversible hinge with bolts from behind.
- **Nut width (across flats)**: 0 takes it from the hole (M2 to M8 by the standard sizes plus 0.3 mm play: M3 5.8, M4 7.3), or it is set. The pocket is as deep as a nut is high but leaves 0.6 mm of leaf below it; on a leaf too thin for that it is left out, and the row says so. The hint under the row gives the width and depth in use. Holes keep their 0.5 mm walls by the nut's corners.
- **Exact:** the pocket is a six-sided prism cutter (`polygon`, 6 sides, `hole: true`) with the hole's cylinder, turning with the hinge and folding with leaf B like the leaf's boxes (`hingeWorldParts` treats it as a box, since it is not round). The display mesh builds the pocket's six walls and its floor into the leaf's plate.
- The new choice `hingeScrewHead` takes the place of the `hingeScrewCountersink` switch from #999; a design that only has the switch still reads it.
- MCP: `hingeStyle: "liftOff"`, `hingeScrewHead`, `hingeNutWidth` in the tool schema, `mcpShapeSettings` and the skill (all three copies); shape defaults and the project format carry them too.
- Guide: a paragraph in the hinge section of chapter 9, and the style sentence now names four choices. Texts in English, German, French, Dutch, Russian, Czech, Slovenian and Danish.

![Lift-off hinges with a countersunk back leaf and nut pockets in the front leaf: open, folded to 90° and closed](https://raw.githubusercontent.com/marcus040473/layerling/9eab9a5d2ddd4ffbc8a7ff4b09830ed9b00b22bc/hinge/lift-off.png)

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (3836 passed, 6 skipped; new in `tests/unit/hingeGeometry.test.ts`: the lift-off hinge closed in two parts in every fold, with fingers and holes, the pin running to the end inside the sleeve's bore with nothing of the sleeve in its way, its exact parts; nut widths from the hole and as set, the exact volume of a pocket, the mix of countersink and nut, a pocket left out on a thin leaf, the prism cutters folding with B and turning with the hinge)
- [x] `npm run test:e2e` (691 passed; new: STEP export of a lift-off hinge and of nut pockets on the pin and pinless styles, turned, folded and mirrored, within 1 % of the display mesh's volume, in `tests/e2e/stepRoundTrip.e2e.ts`; the style and the hole choices in the settings in `tests/e2e/hingeLeavesPanel.e2e.ts`)
- [x] `npm run guide`, `npm run i18n:status`: no problems; the eight languages complete (Danish misses the same sentences as on main)
- [x] Manually tested the affected workflow: in Chromium on the dev server of this branch, placed a hinge, set Lift-off, a 10 mm knuckle, a 3 mm leaf, two 4.5 mm holes with Countersunk + nut pocket and a corner radius: the knuckle rows went away, the nut row showed 7.3 mm and a 2.4 mm deep pocket, and the body followed. Separate Parts gave the two pieces. The fillet tool on the same hinge built it exactly (88 sharp edges, the pockets' hexagons where the mesh has them), no errors

## Notes

- **Storage:** two optional fields on the hinge (`hingeScrewHead`, `hingeNutWidth`) and a fourth value of `hingeStyle`. A hinge without them is built as before.
- The idea came from a reversible M4 hinge and a removable printer-door hinge a user showed me; nothing of their geometry is taken over.
- A lift-off hinge always has its pin on the back leaf; for the other hand it is mirrored, as any other part.
- The translations other than English and German are mine and worth a native reader.
- Up to date with 1.124.2: your main is merged into the branch. It met the exact cone hinge (#1007) in `hingeGeometry.ts`, `hingeParts.ts`, the MCP tool, the skill and the tests; both are kept – the nut constants beside `CONE_OVERCUT`, a local part with a polygon's `sides` and a cone knuckle's `knuckle`, `hingeHasExactParts` gone as in your main. Where your main now gives the whole-length pin to the pin style only, the lift-off hinge gets it too (`plan.style === "pin" || plan.style === "liftOff"`); a test of the lift-off hinge's parts caught it.
- No CHANGELOG or whatsNew in the diff, so it stays free of conflicts with yours.
- Developed with the help of Claude Code.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01U6NM2F83bjA1KXvcx3rC6u
