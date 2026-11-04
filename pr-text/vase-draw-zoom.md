Title: Vase drawing: the view keeps its zoom when a point is dropped, and a double-click on the line adds a point again

## Summary

Two things in the vase drawing window, both reported in Discussions:

- **Zoomed in, the view stays where it is** ([#1278](https://github.com/henmedia/layerling/discussions/1278)). After a point or a handle was dropped, the board fitted the whole vase in again whenever the vase reached past the view – and zoomed in on a part, it always does. Fine-tuning a profile point by point, you were thrown back out after every point. The view now follows only when it showed the whole vase before the drag and the vase has grown past it.
- **A double-click on the line adds a point** ([#1252](https://github.com/henmedia/layerling/discussions/1252)). The double-click was listened for on the line's own path, which never got it: the press on the line starts a pan and the svg takes the pointer, so the click and the double-click go to the svg – and the first click had redrawn the path by then anyway. The svg now catches the double-click and adds the point there when the click before it was on the line, as the hints say ("Double-click the line to add a point"). The same in the body form, the cross-section and the twist.

## Testing

- `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run guide`, `npm run i18n:status`
- New `tests/unit/vaseDrawingZoom.test.ts`: zoomed in four steps and a point moved within the view, the view stays as it was; with the whole vase in view and a point dragged far out, the view follows. Fails without the change.
- New `tests/unit/vaseDrawingDoubleClick.test.ts`: a double-click on the line between the two lowest points adds a point there and selects it; one beside the line adds none. Fails without the change.

## Notes

- Only `apps/web/src/lib/vase/vase-editors.mjs`; no texts change.
