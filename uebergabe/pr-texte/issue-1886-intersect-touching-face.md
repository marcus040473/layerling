## Summary

- Rebuilt: a group of a 30 x 30 x 10 box with a 16 mm ball sunk into its top, intersected with a box standing exactly on the first box, gave the ball's upper part plus the whole touching face as a sheet (bounds x -15..15 instead of -5..11).
- It is not the 0.001 mm of #1133. The sheet is exactly flat and comes from Manifold: two boxes that only touch intersect to four triangles of no volume, not to nothing. `manifoldIntersectionMeshShape` used that as it came.
- New `withoutTouchingSheets()` folds the result with the tolerance of the #1133 fix and takes the fold only if the volume is unchanged and the surface did not grow. A result that folds to nothing is reported as empty.

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (6013 passed)
- [x] This fix's e2e files on this branch (6 passed); the whole `npm run test:e2e` (1650 passed) ran on a branch with all eleven issue fixes together, on 1.166.0
- [ ] Manually tested the affected workflow (not in the browser, see Notes)
- New `tests/e2e/intersectTouchingFaces.e2e.ts` (6 tests): touching at three heights in both orders, the ball in the upper group, touch-only gives empty, a real 0.05 mm shared slab is kept. 4 fail without the change.

## Notes

- I could not open the bug report's file. If the reporter's layer really is 0.001 mm thick with volume, this does not remove it; I found no arrangement that makes such a layer.
- The three-bvh-csg fallback, used only when Manifold fails, is unchanged.
- Not tried in the browser; the checks are the tests above.
- The branch is your main at 04697a698 plus this one commit.
