## Summary

- A new **Vase** in the shape library, for vases, pots and lampshades. Its height and widest diameter are the shape's own measures (handles, Properties); everything else sits on cards of their own in its settings and stays editable, also after saving.
- **Form and pattern:** body form (bottle, bellied, bowl with neck, barrel, cylinder, funnel); cross-section (circle, polygon with rounded corners, wave: soft, pointed, arches or fins, or drawn), with an optional second cross-section it blends into up the height; twist and sway, evenly or as a curve, along the height or along the contour; **solid** for the slicer's vase mode (spiralize) or **hollow** with wall and bottom; the vase's own patterns: grooves, stripes, Voronoi cells (the outer wall is cut along the joints' height lines, so the joints have no steps) or facets, in a band of the height if wanted. A new vase is plain.
- **Bottom and wall:** drain holes with a slope towards them, a hollow foot, recesses for rubber feet, an open wall (Voronoi, honeycomb, diamonds or circles, for lanterns and baskets), a lampshade (hanging or standing for E27/E14, or over an LED puck), ribs or a double wall that make a vase-mode print stronger, and a watertight check.
- **Accessories:** legs moulded on or to plug in (with sockets in the bottom), a stand, a saucer (a dish, or hidden in the hollow foot), inserts (planter, self-watering, flower frog, water tube) and lids (push-in, snap-on, screw-on). **Lay out accessories** puts them beside the vase as parts of their own, ready to print; laid out again, the old ones are replaced.
- **Print:** weight and filament length for the chosen material, and notes on printing it: overhangs, thin walls, what the slicer needs for the vase mode.
- **Draw the vase** opens a large window over the work area (moved by its title bar, resized from its corner) to draw the body form, the cross-section and the twist in real millimetres, with SVG and mesh import and a photo to trace or take the outline from.
- MCP: `kind: "vase"` in `layerling_create_shape` and `layerling_update_object` with `vase` settings, and `vaseParts: true` to lay out the accessories; a paragraph in SKILL.md.
- Guide: a section "A vase" in chapter 3. Texts in English, German, Dutch, Czech, French, Slovenian and Russian; the other languages show the English text.

![Five vases: faceted bottle, grooved bellied vase, twisted wave cylinder, funnel with an open diamond wall, Voronoi bowl with neck](https://raw.githubusercontent.com/marcus040473/layerling/76fc83d4e2c2260577d057ccd565e6e14e23400c/vase/vase-shapes.png)

![The window to draw a vase in](https://raw.githubusercontent.com/marcus040473/layerling/76fc83d4e2c2260577d057ccd565e6e14e23400c/vase/vase-draw.png)

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (3383 passed; new: `tests/unit/vaseShape.test.ts`, `vaseDrawing.test.ts`, `vasePrint.test.ts`, `vaseVoronoi.test.ts`)
- [x] `npm run test:e2e` (570 passed; new: `tests/e2e/vasePanel.e2e.ts`)
- [x] `npm run export`, `npm run guide`, `npm run i18n:status`: no committed file changes, no i18n problems
- [x] Manually tested the affected workflow: in Chromium on the dev server, five vases made through the MCP bridge (each built in 0.1 to 3.5 s), their cards in the settings, and the drawing window opened; laying out the accessories is covered by the unit and e2e tests

## Notes

- **Storage:** a new shape kind `vase` with an optional `vase` field (its settings) on the shape, and `vasePartOf` on a laid-out accessory. Nothing else in the project format changes; undo and redo treat a change of the vase's settings as one step, like any other property.
- **The core** is the vase tool's own: plain ES modules under `apps/web/src/lib/vase/` (geometry, parts, cut-outs, slits, drawing boards, SVG, mesh and photo import) with `.d.mts` types beside them. Its settings keep the tool's own (German) value names, e.g. `profile: "bauchig"`, `body: "voll"`; the MCP tool lists them, and the panel shows them translated. The notes the core writes are German and are shown in the current language by `vaseNotes.ts`. If you'd rather have English value names or the core in TypeScript, I can do that in this PR.
- **Size:** about 11,000 lines, most of them the core (about 5,900) and the texts in seven languages.
- The translations other than English and German are mine and worth a native reader.
- `globals.css` gets the drawing window's styles, and the Graphite theme has them too (`npm run theme:graphite` changes nothing).
- No CHANGELOG or whatsNew in the diff, so it stays free of conflicts with yours; a proposed entry is below.
- Companion PR: SURFACE_PR (surface texture), independent of this one; a vase also takes a surface texture once both are in. A discussion post for wishes and bug reports follows and will be linked here.
- Developed with the help of Claude Code.

<details>
<summary>Proposed CHANGELOG entry</summary>

- **A vase, as a shape of its own:** The shape library has a new **Vase** for vases, pots and lampshades. Height and widest diameter are the shape's own measures; the frame follows an outline that is not round, so a hexagon keeps its proportions. Everything else sits on cards of their own and stays editable, also after saving. **Form and pattern:** the body form (bottle, bellied, bowl with neck, barrel, cylinder, funnel), the cross-section (circle, polygon with rounded corners, a wave: soft, pointed, arches or fins, or drawn), a second cross-section the first blends into up the height, twist and sway (evenly or as a curve, along the height or the contour), **Solid** for the slicer's vase mode or **Hollow** with a wall and bottom, and a pattern of grooves (also winding), stripes, Voronoi cells or facets, also in a band of the height only; a new vase is plain, and Voronoi joints are cut into the outer wall along their height lines, so they run straight and smooth. **Bottom and wall:** drain holes with a slope, a hollow foot, recesses for rubber feet, an open wall (Voronoi, honeycomb, diamonds, circles), a lampshade (hanging, standing on a socket, over an LED puck), ribs or a double wall through fine slits for a stronger vase mode, and **Must hold water**. **Accessories:** legs (moulded on, or to plug in with sockets in the bottom), a stand, a saucer or one hidden in the foot, a plant insert, an insert with a water store, a holder for stems or water tubes, and a slip, snap or screw lid; **Lay out accessories** puts them beside the vase as parts of their own, ready to print, and says which ones do not fit this vase. **Print:** the weight in the chosen material, the length of filament (for a solid vase as the slicer's vase mode prints it) and notes on printing: overhangs over 45°, thin walls, what a lid, a lamp or legs need, and the slicer settings for ribs and a double wall. **Draw the vase**, high up in its settings, opens a large window over the work area with drawing boards for the body form from the side, the cross-section from above (mirrored by half or quarter, a windmill, or free) and the twist as a curve up the height, in real millimetres with a grid, zoom, handles and corners; it moves by its title bar, grows from its corner, and covers the whole screen on a phone. An SVG drawing becomes the cross-section or the body form, the mesh of a model vase (STL, 3MF, OBJ) the body form, and a photo of a vase can go behind the drawing, found and scaled by its measures, to trace or take its outline. A drag is one step of undo. The MCP tools create and change vases with a `vase` setting and lay out the accessories with `vaseParts`. Described in chapter 3 of the guide; the panel and that section are in English, German, Dutch, Czech, French, Slovenian and Russian.

</details>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01RA8tVvdf6adjsMvMfzZ9Bs
