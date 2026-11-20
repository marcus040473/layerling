## Summary

- The picture is named `.thumbnails/<file>.<size hex>-<mtime hex>.png` and every reader looked for that exact name. A sync that shifts the file's time gives the other computer another revision, so the start page showed "No snapshot".
- New `findSharedThumbnail()` in the shared-projects route tries the exact name first, then a picture of the same file with the same size, the one whose time is nearest. Used by the listing, the search, all designs, the picture request, move, rename and copy.
- The revision, ETag and If-Match checks are untouched. A picture found by size only is served with `no-store`. Reading never renames or deletes a picture, so two computers cannot take them from each other; a save removes the file's other pictures.

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (6004 passed)
- [x] `npm run test:e2e` (1650 passed)
- [ ] Manually tested the affected workflow (not in the browser, see Notes)
- New `tests/unit/sharedProjectsThumbnailSync.test.ts` (13 tests, 7 fail without the change).

## Notes

- `apps/web/public/store.php` has the same exact-name lookup and is not changed; the report was about the Node server.
- An edit that keeps the file's byte size can show the old picture until the next save. A `.lyl` is compressed, so that is rare.
- Not tried with a real Google Drive or on Windows; the tests name the picture with a time 15 s off.
- Not tried in the browser; the checks are the tests above.
- This fix was checked together with the other issue fixes of 20 November on one branch based on your main at 1.166.0 plus the 13 commits after it; the test counts are from that branch.
