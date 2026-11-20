## Summary

- Every history step canonicalizes the whole design, and `canonicalizeShape` made a new `groupedShapes` array for every group each time. The view tells a group shown in its parts' colours by that array (`shapeGeometrySignature`, `getPartColoredMeshGeometry`), so after each arrow key, Undo or Redo it rebuilt and recoloured every Multicolor group, not only what had moved. A mouse drag passes untouched shapes on as they are, which is why it stayed quick.
- New `canonicalGroupedShapes()` with a WeakMap canonicalizes a parts array once and hands back the same array afterwards, the pattern of `canonicalEdgeTreatmentHistory` (#1042). A group whose parts change still gets a new array and is rebuilt.
- Measured in a production build, headless Chromium, 36 Multicolor groups plus 30 boxes: one arrow key 4.0–4.8 s to 0.36–0.53 s, Undo 4.2–4.6 s to 0.49–0.66 s, Redo 4.0–4.2 s to 0.58–0.60 s.

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (6017 passed)
- [x] `npm run test:e2e` (1650 passed) on a branch with all eleven issue fixes together, on 1.166.0; this fix has no e2e file of its own
- [x] Manually tested the affected workflow: production build in headless Chromium with real key presses, timings above; on 1.156.4, before your newer commits were merged in
- New `tests/unit/moveKeepsBuiltGroups.test.ts` (4 tests): replays the editor's steps for an arrow key, Undo and Redo and asks `rebuildShapes` which objects were replaced. All 4 fail without the change.

## Notes

- I could not load the reporter's project. If it has no Multicolor groups, their delay has another cause.
- The memo relies on nobody changing a `groupedShapes` array in place; I found no such place, and the #1042 memo relies on the same.
- Not looked at: `stringSignatureCache` in `editorHistory.ts` holds only 64 `cadBrep` strings, so a design with more exact bodies may hash them again on every step. And the second user's remark that a held key does not move bigger parts.
- The branch is your main at 04697a698 plus this one commit.
