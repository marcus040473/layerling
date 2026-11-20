## Summary

- Lock shape keeps the name (`shapeLock.ts`, the guide: "its size, its settings and its name stay as they are"). The settings panel greys out its pencil for such a part, but the object list still showed its pencil and opened the name field on a double-click; Enter then changed nothing.
- The list now leaves the pencil out on a part whose shape is locked, and a double-click opens no field. A part under the padlock alone, and a group that merely holds a part of locked shape, are renamed as before. No new text.

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (6004 passed)
- [x] `npm run test:e2e` (1650 passed)
- [ ] Manually tested the affected workflow (not in the browser, see Notes)
- Two new cases in `tests/unit/objectListShapeLock.test.ts`; the first fails without the change.

## Notes

- The reporter expected to be able to rename. If you would rather allow that, it means dropping the name from the shape lock, the message `status.shapeLockHeld` and the guide in all languages; I did not do that.
- Seen on the way, not changed: the settings panel disables its pencil for a part under the padlock too, although the list and the guide let those be renamed.
- Not tried in the browser; the checks are the tests above.
- This fix was checked together with the other issue fixes of 20 November on one branch based on your main at 1.166.0 plus the 13 commits after it; the test counts are from that branch.
