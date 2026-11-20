## Summary

- The switch lived only in the 3D view's state and started switched on. The view is taken down while a sketch has its place and built anew afterwards, so a switch that had been turned off came back on. A reload did the same.
- It is now kept in the browser like the lock of the proportions (`readTapeWholeEdges` / `writeTapeWholeEdges` in `tapeStore.ts`, key `layerling.editor.tapeWholeEdges`).
- "Add measurement" going off is left as it is: closing the tape measure's buttons, Esc or another tool puts the tool down on purpose.

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (6004 passed)
- [x] `npm run test:e2e` (1650 passed)
- [ ] Manually tested the affected workflow (not in the browser, see Notes)
- Three new cases in `tests/unit/tapeStore.test.ts`. The view cannot be mounted in a unit test, so the third reads its source, like `viewportPropRefs.test.ts`; it fails without the change.

## Notes

- As a side effect the switch now also survives a reload and is the same for every design.
- Not kept in `toolMemory`, because that is cleared on a project change while the view stays.
- Not tried in the browser; the checks are the tests above.
- This fix was checked together with the other issue fixes of 20 November on one branch based on your main at 1.166.0 plus the 13 commits after it; the test counts are from that branch.
