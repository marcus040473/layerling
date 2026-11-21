## Summary

Hi Stefan, in Discussion #1806 a user asked for full control over where the opening and the air vents of a mold go. This adds a switch for that to the two-part mold:

- **Set the openings myself** (off by default; off, everything is as before). With it on, the sprue and the vents are no longer placed by themselves. A click on the master in the view sets an opening there, a sprue or a vent as chosen in the panel; a click on an opening's post takes it away.
- The panel lists the openings with their place and a remove button each, plus **Remove all** and **Take over the suggested ones**, which fills the list with what the automatic placement would make, as a start.
- Each opening is a channel from the mold's top down to the master at that spot, made by the code the automatic sprue and vents use (funnel, bosses of a contour shell). An opening beside the master is left out and counted in the note; without a sprue the note says the mold cannot be poured; a high point with no opening within reach still gives the air trap finding.
- Options `ownOpenings` and `openings` (`x`, `y` across the parting face from the middle of the master, as the sprue's shift is measured, and `kind`); `layerling_make_mold` takes both and answers with the suggested and the missed openings. Texts in all 20 languages, the guide's mold chapter in its 16 languages, the three SKILL.md copies.

![The switch on, a sprue and a vent set by a click](https://raw.githubusercontent.com/marcus040473/layerling_msto/14582d02ee0a331d8d8cd1e2355cf73635424be7/mold-own-openings/own-openings-set.png)
![The mold made with those openings](https://raw.githubusercontent.com/marcus040473/layerling_msto/14582d02ee0a331d8d8cd1e2355cf73635424be7/mold-own-openings/mold-made.png)

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (6106 passed)
- [x] `npx vitest run --config tests/vitest.e2e.config.ts tests/e2e/mold` (26 passed); the whole `npm run test:e2e` was not run on this branch
- [x] `npm run guide`, `npm run i18n:status`
- [x] Manually tested the affected workflow: in headless Chromium on the dev server, a sprue and a vent set by a click, one removed by a click on its post, the suggested ones taken over, the mold made (pictures above)
- New `tests/unit/moldOwnOpenings.test.ts` (13 tests): the list's limits, own openings in place of the automatic ones, a channel that reaches the cavity, an opening beside the master, no sprue, the suggested ones equal to the automatic result, the master moved.

## Notes

- The openings belong to one opening direction: if the direction changes, the same numbers mean other spots. The list is not cleared or converted.
- A click beside the master deselects and closes the panel, as before; the openings set so far are then gone.
- The switch is remembered in the browser, the list only on the mold's parts (for "Make the mold again").
- The list shows mm also in an inch workspace. The air trap's remedy text still says "switch its vent on".
- A sprue set near the master's edge with a thin wall can break out of the block's side, as a shifted automatic sprue already can. There is no check.
- No test for the picking in the view itself, and not tried on a touch device or with a free opening direction in the browser.
- The translations other than English and German were not checked by a native speaker.
- The branch is your main at 8aa6047f1 (1.167.0 and three commits) plus this one commit.
