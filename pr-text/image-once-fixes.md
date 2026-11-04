Title: Image texture Once: no holes on round bodies, and it goes onto the picked faces

## Summary

Two reports about an image pressed on once (#1188):

- **Parts of a sphere went missing** ([#1268](https://github.com/henmedia/layerling/issues/1268)). You tracked it down: with the image once, the flanks were still refined at the end of `refined()`, after the values had been worked out per point, so the new points had none, moved by `NaN`, were dropped by `mergeFlatPoints`, and long triangles closed the gap through the body. On a rounded plate the same left a spike and made the design impossible to save, "Could not save design shapes" ([#1206](https://github.com/henmedia/layerling/issues/1206)): the `NaN` reached the saved shapes. A text and an image once now skip the flank refinement and the bead cut, as the text did already (your `!text` → `!stuckOn(s)`, for both steps).
- **With faces picked, it goes onto them** ([#1206](https://github.com/henmedia/layerling/issues/1206), [#1176](https://github.com/henmedia/layerling/discussions/1176)). Once placed its middle by Around and Height alone. With the top of a plate picked and Height at 100 %, the ray met the front wall at its top – a face not picked, which stays smooth – so only the edge it shares with the top was pressed in. Now, with faces picked, a text or an image once always lands on them: where Around and Height aim past them, its middle goes onto the picked faces, seen straight on from the side they face together (else the point of them nearest to their middle). Where Around and Height meet a picked face, nothing changes.

The Once hint says so ("With faces picked, it always lands on them."), in the 15 languages that have it, and so do the guide's sentences on Once and on the text label in chapter 3, in the 15 languages that have them.

## Testing

- `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run guide`, `npm run i18n:status`
- New in `tests/unit/surfaceTextureImageOnce.test.ts`:
  - a 100 mm sphere with a square and a white image, inward and outward, stays closed, every point finite and no edge over 15 mm (fails without the change: points not finite);
  - a plate with its top picked and Height 100 % gets the image pressed into the top only, round its middle (fails without the change).

## Notes

- `nearestSurfacePoint` (`surfaceTextureUnfold.ts`) takes an optional mask of the triangles that count.
- Your other idea in #1268, the darkest tone of an own image as 0 so a near-black background is not cut in by 0.2 mm, is not in this PR.
