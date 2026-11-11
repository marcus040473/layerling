## Summary

- Follow-up to #1497, as suggested there: with a frame above the slide-in lid, the wall it slides in through keeps its height and has a slot, but the hints for the click bump, the finger grip and the pull tab still spoke of "the cut wall".
- The three hints now say "the wall it slides in through", which is true with and without a frame; the bump's height is described as how far it stands out under the lid.
- Changed in every language that has these hints (en, de, fr, nl, ru, cs, sl, da, es, it, pl, ar, pt-pt, zh-cn, zh-tw); no other texts, no geometry.

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (5486 passed)
- [x] `npm run test:e2e` (1416 passed) – the lid panel test now checks the new wording, and that none of the three hints says "cut wall" with a frame
- [x] `npm run guide`, `npm run i18n:status`
- Text-only change; the panel test renders the Lid panel for a slide-in lid with and without a frame

## Notes

- The guide's paragraph on the slide-in lid still describes the lid without a frame, where the wall is cut down; I left it as it is.
