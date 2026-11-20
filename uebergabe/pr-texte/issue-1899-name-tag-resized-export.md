## Summary

- A name tag is a bundle of text layers. The view stretches the layers' meshes to the bundle's size, but the export took the bundle apart and built each layer again as a text in a scaled box. A text keeps its letters' proportions and its outline's width in millimetres, so the rebuilt layers differed from what the view shows.
- Measured before: a tag pulled to twice its width was written at its old width (±17.28 mm instead of ±34.57); a tag made twice as large had its middle layer 22.0 mm deep instead of 24.3 and its bottom layer 25.8 instead of 30.3, so the letters no longer sat on the plate.
- A text inside a resized bundle is now exported as the mesh the bundle shows (`bundleExportParts`). A bundle at its own size keeps its texts as texts, so exact STEP letters are unaffected; tapered, twisted or bent bundles are left as before.
- It was not only the 3MF: STL and OBJ take the parts from the same place and were wrong too.

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (6004 passed)
- [x] `npm run test:e2e` (1650 passed)
- [ ] Manually tested the affected workflow (not in the browser, see Notes)
- New `tests/e2e/nameTagResizedExport.e2e.ts` (8 tests): the library name tag resized four ways, written as 3MF, read back and compared layer by layer with the view's boxes and volumes. 6 of the 8 fail without the change.

## Notes

- Paint on a text layer of a resized bundle is not carried onto the mesh.
- A resized name tag now goes to STEP as a mesh body.
- "Separate parts" on a resized name tag uses the same `restoreGroupedChildren` and is unchanged.
- Not opened in Bambu Studio; the check reads the 3MF's model back.
- Not tried in the browser; the checks are the tests above.
- This fix was checked together with the other issue fixes of 20 November on one branch based on your main at 1.166.0 plus the 13 commits after it; the test counts are from that branch.
