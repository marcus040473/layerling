## Summary

- Add a Snap-on style for Hinge shapes: the back leaf carries the pin, and the front leaf has open clips that snap over it.
- Add an adjustable snap grip and a 45-degree lead-in to make the clips easier to assemble while keeping them in place.
- Keep both halves printable flat without supports, and include the style in exact CAD/STEP export, the MCP settings, translations, and user guides.
- Leave the Lid tool's separate hinge styles unchanged.

## Testing

- [x] `npm run typecheck` — passed.
- [x] `npm test` — passed (5,495 tests; 7 skipped).
- [x] `npm run test:e2e` — passed (1,418 tests).
- [ ] Manually tested the affected workflow

Additional checks:

- `npm run guide` — passed (280 pages built).
- `npm run i18n:status` — passed; no reported translation problems.

## Notes

- See Discussion #1520.
- Snap-on is a style of the Hinge shape; the Lid tool is intentionally unchanged.
