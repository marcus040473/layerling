## Summary

- **Trace in the sketch:** the reference image's settings get **Trace**. It traces the outline of the shape in the picture – a silhouette, a logo, a word – and shows it in red over the picture: square points for corners, round ones for smooth points. Settings: **Dark shape / Light shape**, **Threshold**, **Points** (how many the outlines get together, from the fewest the shape allows to a close fit; the hint under it gives the count and the corners), **Corner from** (degrees; 180 makes none), **Leave out specks up to** (mm) and **Keep holes** (off: only the outermost outlines). **Apply** puts the outlines into the sketch where the picture lies – its size, turn and crop, only the part it shows – selected, one step to undo. They are ordinary sketch points: corners plain or split between curves, smooth points with their handles in line, so they move, curve and remove like drawn ones, and holes are outlines inside others as usual.
- **Trace in the vase drawing:** beside **Take outline**, the photo row gets **Trace**: the body form from the photo with **Threshold** (how far a colour lies from the background's), **Points** (3 to 40) and **Corner from**, shown dashed in red over the photo before **Apply** makes it the vase's. The photo follows the object as the threshold changes it; Cancel lays it back.
- **The tracer** (`pictureTrace.ts`) builds on `rasterTrace`'s outline (its field and marching squares, now exported): the outline walked in even steps; a corner where the line turns by more than the corner angle within three pixels while it runs on straight either side (a tight curve turns as much, but spread out), placed where the two sides meet; between the corners cubic Béziers fitted by least squares and split where they stray (after Schneider, Graphics Gems 1990), as loosely as the number of points allows (a bisection on the tolerance). No new dependency.
- `findObject` takes a threshold and `profileFromSamples` a number of points and a corner angle; without them both work as before.
- Guide: a paragraph in "A picture as template" (chapter 7) and a sentence in the vase drawing (chapter 3). Texts in English, German, French, Dutch, Russian, Czech, Slovenian and Danish.

![Trace: a silhouette with the red preview and its settings, the outline taken into the sketch, and the vase drawing tracing a photo](https://raw.githubusercontent.com/marcus040473/layerling/8125d7ecdc67784541f38a9ea563756ef18acf5a/trace/overview.png)

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (3761 passed; new: `tests/unit/pictureTrace.test.ts` – a square as four corners where its corners are, a disk as a smooth loop within a pixel, a ring with and without its hole, an A with pointed corners outside and in its hole, no corners at 180°, never more points than asked and closer with more, specks and the light part, points in the picture's own pixels when it was shrunk, the SVG path data; `tests/unit/sketchImageTrace.test.ts` – the crop, the outline laid on a moved, scaled and turned picture, the point modes and side kinds, the preview path; `tests/unit/vaseDrawing.test.ts` – the photo's threshold found or set, the number of points, corners or none)
- [x] `npm run test:e2e` (634 passed)
- [x] `npm run guide`, `npm run i18n:status`: no problems; the eight languages complete (Danish misses the same sentences as on main)
- [x] Manually tested the affected workflow: in Chromium on the dev server of this branch, put a picture of a word into an extrude sketch, Trace showed 97 points and 71 corners in red over it, Apply gave the outlines (the holes of A and O as holes), Finish sketch built the body without a notice. In the vase drawing, added a photo of a vase, Trace showed the body form with 11 points, Points at 5 gave 5, Apply made it the vase's.

## Notes

- **Storage:** nothing new. Trace only adds ordinary points and sides to the sketch, or a body form to the vase.
- The idea came from the trace tools of laser programs (LightBurn and Inkscape trace with Potrace); this is written from scratch – Potrace's code is GPL – on the outline `rasterTrace` already finds.
- The picture is traced in the main thread, at most 1000 pixels along its longer side, again once a slider rests for 90 ms; a busy picture takes up to a few hundred ms per change.
- Polish misses the new sentences; the translations other than English and German are mine and worth a native reader.
- No CHANGELOG or whatsNew in the diff, so it stays free of conflicts with yours.
- Developed with the help of Claude Code.
