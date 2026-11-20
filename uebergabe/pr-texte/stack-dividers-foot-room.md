## Summary

- A box hollowed with its top open, stackable with a foot, and with dividers had the dividers up to its rim. The foot of the box above goes into the opening, as deep as it is high, so it stood on the dividers and not in the opening: the boxes did not stack. Two such boxes set on each other overlapped in the kernel.
- With stacking on, the dividers now end `shellStackRoom` below the rim: the foot's height and the play of 0.25 mm, so 3.25 mm with the foot's 3 mm. A height set lower stays lower, and a shelf ledge still ends them at its top.
- A box too low to keep a divider of 1 mm under the foot says that the dividers could not be built.

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (6013 passed)
- [x] The Hollow and divider e2e files (`cadShell*`, `cadGridfinityDividers`, `gridfinityDividerHeightPanel`: 87 passed); the whole `npm run test:e2e` was not run on this branch
- [ ] Manually tested the affected workflow (not in the browser, see Notes)
- One new case in `tests/e2e/cadShellGrid.e2e.ts`: the dividers' top, the same box set on its rim without the two meeting (with the dividers up to the rim they meet), a height set lower, and a box too low.

## Notes

- Seen in my demo on 1.166.0: a rounded box, hollowed, stackable, with dividers.
- The dividers' height slider in the panel still goes up to the rim; a height above the foot's room is simply held to it. I did not change the panel or the guide.
- With a Gridfinity floor there are no dividers, so nothing changes there. A stacking lid's foot was not looked at.
- Not tried in the browser; the checks are the tests above.
- The branch is your main at 04697a698 plus this one commit.
