## Summary

- Grouping cuts a tube, ring or bent tube with "Bore cuts a hole" as its solid plus its bore as a hole (`splitBoreTube`). The edge tool rebuilds the group from `restoreGroupedChildrenForEdges`, which never split it, so the tube reached the kernel as one hollow solid and the box closed the bore again. Chamfer and fillet alike, in the panel and through MCP.
- `restoreGroupedChildrenForEdges` now hands such a tube over as `splitBoreTube` cuts it, in the tube's scope. A nested group holding such a tube counts as mixing solids and holes and gets its own scope, so its bore cuts only that group's solids.

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (6004 passed)
- [x] `npm run test:e2e` (1650 passed)
- [ ] Manually tested the affected workflow (not in the browser, see Notes)
- Two new cases in `tests/unit/restoreGroupedChildrenForEdges.test.ts` and new `tests/e2e/cadTubeBoreHoleGroup.e2e.ts` (5 cases through the real worker: tube through a box with chamfer and fillet, a control with the switch off, a bent tube through a wall). Without the change the box closes the bore, about 3000 mm³ too much.

## Notes

- The bent tube in the e2e test is a straight one, as in the #892 grouping test; one with real bends is not covered.
- A bundle holding such a tube now opens in a bundle scope; no test for that.
- Not tried in the browser; the checks are the tests above.
- This fix was checked together with the other issue fixes of 20 November on one branch based on your main at 1.166.0 plus the 13 commits after it; the test counts are from that branch.
