## Summary

Hi Stefan, this is the tapered capsule from issue #1868 that you asked me to look at.

- A push-in lid's lip and a cap's rim were the body's cut just below the rim, pushed straight down. On a body whose walls lean, the upright lip stood in the wall and the lid did not go in: on a round pot 40 mm across at the rim and 30 at the foot, a 5 mm lip overlapped the wall by 110 mm³. A cap over a body that widens below its rim did the same from the outside.
- `lidForSolid` now cuts the body every 0.25 mm of the lip's or the rim's reach. The lip is what of the opening is open at that height and at every one above it, the gap smaller; the rim goes round the outline with all those above it, the gap larger. Between two heights it is the hull of the two sections where both are convex, so a leaning wall comes out flat, otherwise steps.
- Click bumps stand on the lip or rim as it is at their height, and the dimples go into the wall as it is there.
- A wall that leans less than 0.02 mm over the reach counts as upright and the lid is made exactly as before. Such a leaning lid stays the mesh lid, because the exact one is upright (`leaning` in the result).

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (6004 passed)
- [x] `npm run test:e2e` (1650 passed)
- [ ] Manually tested the affected workflow (not in the browser, see Notes)
- New `tests/e2e/lidLeaningWalls.e2e.ts`: lip and rim clear of the wall with the gap kept on pots leaning either way, click bumps that hold in dimples that do not go through the wall, upright lids unchanged. It fails without the change.

## Notes

- I could not open the bug report's file, so the case is rebuilt as a round pot with Manifold, not as the reporter's hollowed capsule.
- Where the opening widens below the rim, a push-in lid's lip stays upright on purpose: one that followed could not be pushed in. Click bumps then may not reach the wall; I left that alone.
- With "both", the upright one of the two is still as the cut 0.3 mm below the top gives it, so on a steep wall it is up to 0.05 mm nearer at the very top, as before.
- Screw, bayonet and slide-in lids refuse a leaning body as before; a stacking top's foot is unchanged.
- Not tried in the browser; the checks are the tests above.
- This fix was checked together with the other issue fixes of 20 November on one branch based on your main at 1.166.0 plus the 13 commits after it; the test counts are from that branch.
