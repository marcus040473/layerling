## Summary

- The analysis in issue #1812 is right: `treatPastInnerCorners` set its 4 s deadline but passed it only to `treatAfterInnerCorners`, so the scan in `innerCornerEdges` always ran to the end. Edge counts match the report (371 and 503 picked, 150 probed on the 2 x 1 bin).
- `innerCornerEdges` now takes the deadline and returns no corners once it is past, so the refusal goes on as before inner corners were handled. Partial results are dropped on purpose: which corners are found in time depends on the machine, so results would differ between tries.
- Measured through the worker on a slow shared machine, fillet 0.3 mm on all edges: 2 x 1 bin with one label 47.8 s to 17.0 s, 3 x 2 bin 71.2 s to 17.7 s, 2 x 1 with two labels 105.4 s to 25.0 s. The messages are unchanged ("the tightest bend has a radius of 0.27 mm").

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (6004 passed)
- [x] `npm run test:e2e` (1650 passed)
- [ ] Manually tested the affected workflow (not in the browser, see Notes)
- New `tests/unit/cadInnerCornerBudget.test.ts` (clock mocked, 2 of 4 fail without the change) and `tests/e2e/cadInnerCornerBudget.e2e.ts` (the labelled 2 x 1 bin through the worker; it asserts the message and that the scan stays within 4 s plus 2 s slack).

## Notes

- The e2e assertion is wall-clock based; a very loaded machine could trip the 2 s slack.
- The chamfer on the bin with two labels is still slow (44.7 s on this machine). That time is outside the inner-corner scan and is not touched here.
- Not tried in the browser; the checks are the tests above.
- This fix was checked together with the other issue fixes of 20 November on one branch based on your main at 1.166.0 plus the 13 commits after it; the test counts are from that branch.
