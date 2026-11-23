Title: Lid: made again for a box that has magnets or screws, it replaces them and stands no pegs in the old pockets (Discussion #1985)

## Summary

- Discussion #1985: a lid made a second time for a box that already has the posts and pockets of an earlier lid took every old pocket for an opening. A push-in lid stood a peg in each one (a ring, as the lip has a wall), and with screws after magnets the new holes were cut where the wide magnet pockets still lay open, so the box kept both.
- A lid that brings magnets or screws of its own now replaces what the earlier lid left in the corners, posts and all: the lid's group is opened as Ungroup opens it, the old posts and pockets are left out, and the box is grouped with the new ones. Box and lid come out as for a box that never had a lid.
- A lid without magnets or screws leaves the box as it is and is worked out as if the old pockets were closed: its lip goes round the posts and stays out of the pockets.
- Where the box was grouped again after its first lid (a hole for a cable cut into it), the group inside is built again without the old parts and the group round it keeps its id, name and hole.
- The old parts are found by their ids (`lidCornerPart`), as the hinge of an earlier lid is. The ids of posts, pockets and hinge knuckles now start from the body's first id (`localIdBase`): a body that had been ungrouped once has a derived id, and grouping dropped the mark behind it, so the parts were not found again.
- One sentence added to `layerling_make_lid` in the MCP tool and the three `SKILL.md` copies. No new UI texts.

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (6460 passed)
- [x] `npm run test:e2e` (1719 passed)
- [x] `npm run guide`, `npm run i18n:status`
- [x] Manually tested the affected workflow: in the editor, a box 60 x 60 x 50 hollowed with its top open, a push-in lid with 10 x 3 mm magnets, then one with M3 screws, then one without either
- New: `tests/e2e/lidAgain.e2e.ts` (real kernels, grouped as the editor groups: screws after magnets and magnets after screws give the same box and lid as on a fresh box; a plain lid has one lip and leaves the pockets empty; a box grouped with a cable hole afterwards) and `tests/unit/lidCornerParts.test.ts`. Both fail without the change.

## Notes

- A box whose edges were rounded after its first lid is one mesh with its history, without parts to look at: there the lid is made as before. So is a box whose first lid was made before this change from a body with a derived id.
- The other parts an earlier lid adds (latch cheeks, click dimples, a finger notch) stay in the box as before; a hinge is still refused with its message.
- Not built: pegs in the corners as a third choice beside magnets and screws, as asked in the discussion. It would reuse the same corners and posts. Happy to build it if wanted.
