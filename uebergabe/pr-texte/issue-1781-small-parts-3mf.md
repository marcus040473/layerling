## Summary

- The colour-separated export removes closed loose pieces under 0.5 mm³ from any body a cut or merge touched (`removeLooseSplinters`). That also removed small parts the user had drawn: of four 1 mm teeth grouped with two eyes and standing 0.3 mm out of a later head of another colour, three were removed. The same teeth ungrouped, or an STL of the group alone, keep all four.
- `removeLooseSplinters` now gets the meshes the body was made from. For each loose piece those had, the largest part left is kept if it holds at least 5 % of that piece and at least 0.01 mm³. Slivers of a large piece, a second smaller leftover and splinters outside any drawn piece are removed as before.

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (6004 passed)
- [x] `npm run test:e2e` (1650 passed)
- [ ] Manually tested the affected workflow (not in the browser, see Notes)
- 4 new cases in `tests/unit/meshSplinters.test.ts` and new `tests/e2e/colorExportSmallParts.e2e.ts` (5 tests, 4 fail without the change).

## Notes

- I could not open the bug report's file, so I cannot say for sure that this is what took the reporter's teeth. It is the only 3MF-versus-STL difference I found. Please treat this PR as optional if you prefer to wait for the file.
- Bodies a loose hole was cut from, and meshes Layerling computed itself (a group cut with its holes), do not count as drawn; their leftover splinters are removed as before.
- A second loss is not fixed: a piece of a multi-piece body that lies entirely inside a later body of another colour is still cut away when other pieces of the same body stick out (#906 only protects a body swallowed whole).
- Not tried in the browser; the checks are the tests above.
- This fix was checked together with the other issue fixes of 20 November on one branch based on your main at 1.166.0 plus the 13 commits after it; the test counts are from that branch.
