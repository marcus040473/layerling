# Hinge: screw holes, rounded corners and fingers instead of leaves

## Summary

- **Screw holes in the leaves:** *Screw holes per leaf* (0 to 6) along the axis, with *Hole diameter*, *Holes* **Countersunk** (90°, on the side that faces the other leaf when the hinge is closed, so the heads lie flush) or **Straight**, *Hole spacing (along)* from one hole's centre to the next, and *Hole spacing (across)* from the hole in one leaf to the hole in the other. Left at 0, the holes share the length evenly and sit in the middle of each leaf beside the knuckles. Every hole keeps 0.5 mm of leaf to the edges, the knuckles, a rounded corner and the next hole; where fewer fit, fewer are made and the field says "Only N fit on the leaf."
- **Corner radius** rounds the four outer corners of the leaves.
- **Leaf shape: Fingers** – asked for in a mail to you with a picture of such a hinge. Each knuckle carries its own finger, as wide as the knuckle, instead of a leaf on each side; the two sides' fingers alternate like two combs. As no finger lies under a knuckle of the other side, the hinge folds all the way round, and with cones and fingers as thick as the knuckle it closes flat, the fingers of one side between the other's. No leaf joins the fingers of a side (with the printed pin they hang on it, with cones they are loose pieces), so it is meant to be joined to the model, e.g. one comb to a box and the other to its lid; the hint under the field and the guide say so. The corner radius rounds the finger tips; fingers take no screw holes.
- **Exact:** with or without the pin, holes, corners and fingers stay exact for the edge tool and the STEP export. The leaves are boxes, with upright cylinders in rounded corners; the holes are cutters (`countersink` or `cylinder` with `hole: true`) that fold with leaf B and follow a mirror, and `buildHingeBody` cuts them after fusing. The cone hinge stays a mesh, as before.
- **Display mesh:** each leaf (or finger) is now a plate over its outline, holes and all, open where its own knuckles stand on it; the knuckles keep their slices. Still closed and two-manifold in every style and fold.
- MCP: `hingeScrewHoles`, `hingeScrewDiameter`, `hingeScrewSpacing`, `hingeScrewAcross`, `hingeScrewCountersink`, `hingeCornerRadius` and `hingeLeafStyle` in the tool schema, `mcpShapeSettings` and the skill (all three copies); shape defaults and the project format carry them too.
- Guide: two paragraphs in the hinge section of chapter 9. Texts in English, German, French, Dutch, Russian, Czech, Slovenian and Danish; the other languages show the English text.

![Hinges with screw holes and rounded corners: open and countersunk, folded to 100° with straight holes, a cone hinge closed](https://raw.githubusercontent.com/marcus040473/layerling/e015421aa9a85f55bc6b886eabf48a4e43bcc726/hinge/screw-holes.png)

![Finger hinges: with a pin, with cones and flush fingers folded to 120°, and closed flat](https://raw.githubusercontent.com/marcus040473/layerling/e015421aa9a85f55bc6b886eabf48a4e43bcc726/hinge/fingers.png)

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (3632 passed; new in `tests/unit/hingeGeometry.test.ts`: closed bodies with holes, corners and fingers in every style and fold, exact hole volumes, hole placement and fitting, exact parts and their folding, countersinks pointing the right way when folded or mirrored)
- [x] `npm run test:e2e` (600 passed, and the 4 of the new `tests/e2e/hingeLeavesPanel.e2e.ts` added after that run; new: STEP export of hinges with holes, corners and fingers through the real OCCT kernel, folded and mirrored, within 1 % of the display mesh's volume, in `tests/e2e/stepRoundTrip.e2e.ts`; the settings rows, which appear only where they apply, in `tests/e2e/hingeLeavesPanel.e2e.ts`)
- [x] `npm run guide`, `npm run i18n:status`: no problems; the eight languages complete (Danish misses the same 9 sentences as on main)
- [x] Manually tested the affected workflow: in Chromium on the dev server of this branch, placed a hinge from the shape library, set two screw holes and a corner radius, then Fingers with cones, a flush leaf and a fold of 120°; the rows come and go as they should and the body follows. Opened the fillet tool on a hinge with countersunk holes: the kernel built it (91 sharp edges), no errors. The display meshes in several styles and folds are in the pictures above

## Notes

- **Storage:** seven optional fields on the hinge (`hingeScrewHoles`, `hingeScrewDiameter`, `hingeScrewSpacing`, `hingeScrewAcross`, `hingeScrewCountersink`, `hingeCornerRadius`, `hingeLeafStyle`). A hinge without them is built as before.
- The leaf thickness keeps its limits: with a pin it stays below the other part's bore, so flush fingers come with the cone style.
- A lift-off hinge (two parts, printed standing, as on many door hinges) could follow as a PR of its own if you like.
- The translations other than English and German are mine and worth a native reader.
- No CHANGELOG or whatsNew in the diff, so it stays free of conflicts with yours.
- Developed with the help of Claude Code.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01U6NM2F83bjA1KXvcx3rC6u
