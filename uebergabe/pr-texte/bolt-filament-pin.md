## Summary

Hi Stefan, in Discussion #1851 a user asked whether 1.75 mm filament could be the pin for screws under M5, where a printed pin does not fit. This adds **Filament as pins** to "Split lengthwise and lay flat":

- A piece of filament lies in a channel on the axis, half in each half, laid in from the cut face and closed at both ends; its roof rises at 45 degrees, so each half prints lying on its cut face without support. It lines the halves up across. It fits from M4, coarse and fine.
- Over 40 mm between the ends there are two 15 mm pieces, one at each end, because filament off a spool is not straight over a long length.
- Where the head takes a piece of at least 3 mm, a second piece goes across the head and lines the halves up along the axis too. Where it does not (a rod, a small socket or countersunk head), the message says to push the halves' ends flush while the glue sets; both halves are the same length, so that is exact.
- The holes have half the pin's play per side, at least 0.05 mm, by the lid hinge's rule and constants (#1873): 0.075 mm at the default, holes of 1.90 mm. The message gives the lengths to cut in steps of 0.5 mm; every hole is 0.6 to 1.1 mm longer than its piece. M5 x 30 with a hex head: 4.5 mm and 21.5 mm.
- `layerling_split_bolt` takes `filament` and answers with the lengths. Texts in all 20 languages, the guide's chapter 9 in its 16 languages, the three SKILL.md copies.

![The option in the screw's settings](https://raw.githubusercontent.com/marcus040473/layerling_msto/14582d02ee0a331d8d8cd1e2355cf73635424be7/bolt-filament-pin/filament-option.png)
![An M5 x 30 split, with the lengths to cut](https://raw.githubusercontent.com/marcus040473/layerling_msto/14582d02ee0a331d8d8cd1e2355cf73635424be7/bolt-filament-pin/split-with-filament.png)

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (6098 passed)
- [x] `npx vitest run --config tests/vitest.e2e.config.ts tests/e2e/boltSplit.e2e.ts` (38 passed); the whole `npm run test:e2e` was not run on this branch
- [x] `npm run guide`, `npm run i18n:status`
- [x] Manually tested the affected workflow: in headless Chromium on the dev server, an M5 x 30 hex screw and a rod split with the option on (pictures above); not printed
- 25 new kernel tests in `tests/e2e/boltSplit.e2e.ts` put the halves back together with filament cylinders in place: no overlap, the same holes in both halves with the stated play, pieces that can be lowered in from the cut face, closed channel ends, a shift across blocked, a shift along the axis blocked only with a head piece, walls on M4 and M5 coarse and fine, no overhang over 45 degrees, all seven heads and the rod at M4 to M6, two pieces on long threads, M3 refused, printed pins unchanged. `tests/unit/boltSplitFilament.test.ts` (5 tests) for the options, the play, the messages and the MCP parameter.

## Notes

- Strength at M4: the channel takes about 45 % of an M4 core's cross-section (about 28 % at M5). That follows from 1.75 mm in a 3.2 mm core. If you would rather offer it from M5 only, say so.
- I found no clean way to line the halves up along the axis by the filament alone in a core this thin, hence the push-flush message for screws without a head piece.
- Below M4 the checkbox is not disabled; the result's message says there was no room.
- Tapered threads are covered only by the wall check in the kernel, inch threads were not tested.
- The translations other than English and German were not checked by a native speaker.
- The branch is your main at 8aa6047f1 (1.167.0 and three commits) plus this one commit.
