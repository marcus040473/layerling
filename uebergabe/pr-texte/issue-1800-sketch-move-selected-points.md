## Summary

- A frame selects the points inside it and every line with an end or its middle inside, so the lines leading out of the frame are selected too. Dragging the frame moved only the selected points; the arrow keys and a typed X/Y went through `sketchSelectionMovePointIds`, which added both ends of every selected line, so the unselected neighbours moved as well.
- In a multiple selection the helper now leaves out the far end of a line that hangs on the selected points by one end only; that line stretches. The frame drag asks the same helper, so all three move the same points.

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (6004 passed)
- [x] `npm run test:e2e` (1650 passed)
- [ ] Manually tested the affected workflow (not in the browser, see Notes)
- Two new cases in `tests/unit/sketchMoveSelection.test.ts`; both fail without the change.

## Notes

- Three small changes beyond the issue, please say if you want any of them different: a selected line with neither end among the selected points now moves with the frame drag (before it was highlighted but left behind by the mouse); dragging one of the lines that lead out moves the selected points plus that line's far end, not the far ends of the other such lines; a point plus its adjacent line, shift-clicked, nudges only the point, since that selection looks the same in the data as a frame.
- Resize and rotate of the selection are unchanged.
- I kept it small because of #1861, but did not check for overlap with it.
- Not tried in the browser; the checks are the tests above.
- This fix was checked together with the other issue fixes of 20 November on one branch based on your main at 1.166.0 plus the 13 commits after it; the test counts are from that branch.
