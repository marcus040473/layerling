Title: Lid: click bumps that snap the lid in, and a pull tab or a finger notch

## Summary

Two wishes for the lid tool, both left to me in Discussions:

- **Click bumps** ([#1234](https://github.com/henmedia/layerling/discussions/1234), and the latch wishes in [#1220](https://github.com/henmedia/layerling/discussions/1220) and [#1273](https://github.com/henmedia/layerling/discussions/1273)): small half bumps on the lid's lip, or on a cap's rim pointing in, snap into dimples in the body's wall, so the lid clicks into place without magnets or extra parts.
  - A bump is a 1.5 mm ball halfway down the lip, reaching the gap plus 0.4 mm beyond its face; the dimple is a 1.6 mm ball at the same centre, 0.1 mm of play at the tip, and always leaves 0.4 mm of the wall standing.
  - One on the middle of each straight side of 12 mm or more, two on sides over 80 mm, four evenly round a round pot. None on the hinge side, beside a finger notch, or on a divider too thin for a dimple from both sides.
  - The dimples go to the body as one hole grouped with it, as the hinge's slots do. Not for a flat lid or pivot pins (it says so).
- **A handle** ([#1230](https://github.com/henmedia/layerling/discussions/1230)): under **Handle**, None, **Pull tab** or **Finger notch**, at the front, or opposite the hinge.
  - Pull tab: 20 mm wide (at most half the plate), 6 mm out from the plate's edge, corners rounded 3 mm, as thick as the plate, so the lid still prints turned over without support.
  - Finger notch: a 16 mm wide half-round recess in the body's wall just below the lid's edge, at most 5 mm deep, never leaving less than 0.8 mm of wall.
  - Refused for a pivot lid and where the side is too short or the wall too thin, each with its reason.

MCP: `make_lid` takes `clickBumps` and `handle` and reports them. Texts in en, de, fr, nl, ru, cs, sl, da, es, it, pl, ar, zh-cn and zh-tw, a paragraph in guide chapter 6 in 15 languages, SKILL copies.

It builds on #1291 (the hinge types and pin play), which is in main now.

## Testing

- `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run guide`, `npm run i18n:status`
- New `tests/e2e/lidClickHandle.e2e.ts` (14 tests, real Manifold kernel): bumps and dimples found by probes, four caps of 1.41 mm³ and nothing else added, under 0.01 mm³ of overlap with the lid closed once the cuts are off; 6 bumps on a 100 mm box; a pot, a cap, dividers; none on the hinge side (back and right); the tab's 6 mm, width, height and volume, opposite a hinge and on a cap; the notch's 0.8 mm wall, its round ends and height on plug and cap, moving to the back with a front hinge; all refusals. Mutation checks: without the bumps, the tab, the hinge-side skip, the notch's wall or with smaller dimples, 2 to 5 tests fail each.
- `tests/unit/lidTool.test.ts`: defaults, normalisation, the fit helpers, bump places on boxes, a mesh-style side, a rounded box, round pots and a hole. `tests/e2e/lidPanelHinge.e2e.ts`: the panel's two new controls.

## Notes

- New in `lib/lidTool.ts`: `clickBumpPlaces`, `lidClickBumpsFit`, `lidHandleFits`, `LID_HANDLES`; `lidForSolid` returns `clickBumps` and `handle`, `lidForShapes` turns their cuts into hole shapes.
- A lid with bumps or a tab is built as a mesh, not the exact CAD lid.
