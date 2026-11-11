# Handoff: state of work on 11 November 2026

For GitHub Copilot (and any other helper) continuing Marcus's Layerling work. Read `.github/copilot-instructions.md`
first: it has the rules. This file says **what is done and what is open**. Marcus's own German guide is
`uebergabe/LIESMICH-MARCUS.md`.

Stefan's newest version: **v1.156.4**.

## Overview

| # | Task | Branch | Head | State |
|---|------|--------|------|-------|
| A | Neutral hints for the slide-in lid (#1497) | `slide-lid-hints` | `e44c85ae6` | **Done**, all 5 checks green. Waits for Marcus to open the PR. Not yet in `marcus`. |
| B | Snap-on hinge (Discussion #1520) | `hinge-snap` | `0999cda97` | **Built, not fully checked.** Only `typecheck` ran green. |
| C | Texture regions on one face (Discussion #1579) | `texture-regions` | `0a866ea6a` | **Work in progress**, about half done, not checked. |
| D | Stefan's v1.156.3 and v1.156.4 into `marcus` | `marcus` | `1b3a5cc34` | `marcus` is at Stefan's **v1.156.2** (all 5501 tests green). v1.156.3/.4 are not merged yet. |
| E | Four new requests where Stefan asks Marcus | – | – | **Waiting for Marcus's decision.** Do not build before he says so. |

Branches A, B and C are based on Stefan's main at v1.156.2. Before a PR to Stefan, merge Stefan's newest tag into them.

---

## A. `slide-lid-hints`: done

With a frame above a slide-in lid, the wall it slides in through has a slot instead of being cut down. Three hints
(`lid.slideBumpHint`, `lid.handleHint.tabSlide`, `lid.handleHint.notchSlide`) still said "the cut wall". They now say
"the wall it slides in through" in all 15 languages that have them. `tests/e2e/lidPanelHinge.e2e.ts` checks the
new wording, with and without a frame.

- PR title and text: `uebergabe/pr-texte/slide-lid-hints.md`. Ready-made compare link with title and text:
  `uebergabe/pr-texte/slide-lid-hints-link.txt`. **Marcus opens this PR himself.**
- Still to do: merge `slide-lid-hints` into `marcus`. In `marcus` the hints in the Lid panel are folded, so the panel
  test there may first need to click `button.tool-hint-more[aria-expanded=false]` before it reads the hint texts.

## B. `hinge-snap`: built, checks open

Discussion https://github.com/henmedia/layerling/discussions/1520. Stefan wrote: "A hinge whose two halves snap
together over a pin is not there yet."

What is built (commit `0999cda97`, see its message for the details):
- The Hinge shape has a new style **Snap-on**. The back leaf's knuckles carry the pin, like the pin style. The front
  leaf's knuckles are open clips that snap over the pin. The clip opening is narrower than the pin by **Snap grip**
  (default 0.3 mm, 0.05 to 1.5). It has a 45° lead-in.
- Both halves print flat without supports. Separate Parts gives the two halves.
- Display mesh and exact CAD (STEP) both done. `hingeGeometry.ts`, `types/layerling.ts`, `ShapeInspector.tsx`,
  MCP field + 3× `SKILL.md`, texts in 15 languages, guide paragraph in 15 languages.
- Tests added: `tests/unit/hingeGeometry.test.ts`, `tests/e2e/hingeLeavesPanel.e2e.ts`, `tests/e2e/stepRoundTrip.e2e.ts`.
- The Lid tool's hinge was left alone on purpose. It has its own styles (outside, flush, pivot) and no choice of the
  Hinge shape's styles.

Still to do:
1. Run `npm test`, `npm run test:e2e`, `npm run guide`, `npm run i18n:status` and fix what fails.
2. Look at it in the browser (`npx next dev apps/web -p 3101`). Add Shape → Hinge → Style "Snap-on". Check it from
   several angles and in the section view, then take 2–3 pictures for the PR (into the `pr-media` branch).
3. Write the PR text: English, Stefan's template, file `uebergabe/pr-texte/hinge-snap.md`, plus a German translation for
   Marcus, `hinge-snap-de.md`.
4. Merge into `marcus`. If `ShapeInspector.tsx` conflicts, keep the `marcus` side and add the new fields by hand.

## C. `texture-regions`: work in progress

Discussion https://github.com/henmedia/layerling/discussions/1579. A user's flower keychain has one connected top face
(petals, leaves, stem). They want a closed region drawn on that face, a pattern only inside it, a second region with
another pattern, and the rest smooth. The regions must stay editable. Stefan asked Marcus to look at it. He also said
the Texture Mask stays for convex bodies only, so **do not change the mask rule**.

Design chosen: a texture layer may carry one **region**,
`SurfaceTextureRegion = { normal: [x,y,z]; points: [u,v][] }`. That is a closed outline in the face's own plane
(see `surfaceTextureRegionFrame`, `surfaceTextureRegionPoint`). The pattern goes only on surface that faces the region's
way (within 60°) and lies inside the outline, using the even-odd rule. A region takes the place of picked faces. Later
layers' regions stay smooth in earlier layers (`exceptRegions`), so where regions overlap, the later layer wins.

Done in commit `0a866ea6a` (WIP):
- `apps/web/src/lib/surfaceTexture.ts`: types, normalize, outline simplifying (max 256 points), inside test, the
  displacement limited to the region.
- `apps/web/src/lib/surfaceTextureShape.ts`: layers in order with `exceptRegions`.
- Texts in 14 languages (10 new keys each), MCP schema in `scripts/layerling-mcp-tools.mjs`, 3× `SKILL.md`.
- Started: `ShapeInspector.tsx` (region buttons), `WorkplaneViewport.tsx` (click-to-draw on the face),
  `LayerlingEditor.tsx`.

Still to do:
1. Finish the **MCP handler in `LayerlingEditor.tsx`**: an optional region polygon per layer. The helper stopped
   exactly there.
2. Finish **drawing a region in the view**: click points on the face, close the outline, store it on the layer. Also
   make it editable or removable from the inspector, and make it survive save/load and undo.
3. Guide paragraph in 15 languages, in the Surface Texture chapter.
4. Tests. `tests/unit/surfaceTextureRegions.test.ts` is a start. `tests/unit/surfaceTextureRegionsExplore.test.ts` was
   only for exploring: turn it into a real test or delete it.
5. All 5 checks, a browser check with a flat plate (two regions with two patterns, smooth rest), pictures, PR text
   (`uebergabe/pr-texte/texture-regions.md` + German).
6. Then merge into `marcus` (docked Surface Texture panel).

## D. Merging Stefan's versions into `marcus`

`marcus` is at v1.156.2. To bring it up to date:
```
git fetch upstream --tags
git checkout marcus
git merge v1.156.4
```
Conflicts in docked panels (they happened last time in `SplitPanel.tsx`, `HolePatternPanel.tsx`, `LidPanel.tsx`,
`ShapeInspector.tsx`):
- Merge each conflicted file again with the **last merged tag as the base**. This gives far fewer conflicts than git's
  own base:
  ```
  git show HEAD:<file> > /tmp/o; git show v1.156.2:<file> > /tmp/b; git show v1.156.4:<file> > /tmp/t
  git merge-file -p --diff3 -L ours -L base -L theirs /tmp/o /tmp/b /tmp/t > <file>
  ```
- Long one-line conflicts (SKILL.md, messages, tests) where both sides only add: run
  `python3 uebergabe/werkzeuge/merge3chars.py <files>`. It merges character by character and leaves real overlaps as
  conflicts.
- Then **look for doubled code**. Last time Stefan had already taken Marcus's neck-fit PR, so the same block came in
  twice: two `neckTop` declarations, a doubled import, and a sentence twice in SKILL.md. `npm run typecheck` finds some
  of these, but not all.
- New UI parts from Stefan go into the docked window by hand. Last time that was Stretch mode in Split and the hole tilt
  slider in Hole pattern.
- Commit message on `marcus` in German, like `merge: Stefans 1.156.4 – …` (see `git log marcus`).
- After pushing `marcus`, the demo is rebuilt by the workflow `layerling.yml` in **marcus040473/marcus040473.github.io**.
  Start it there with Actions → Layerling-Webseite → Run workflow (branch `main`). It also runs once a day by itself.

## E. Requests waiting for Marcus

Do not build these until Marcus says so.
- **#1594**: thread offset for the screw lid. The thread starts a set distance below the top edge, and the cap's rim
  gets that much longer. Stefan asked Marcus.
- **#1607**: Surface Texture: a "Show selected faces" button that highlights a layer's picked faces. Stefan asked Marcus.
- **#1573**: Texture Mask folded under Surface Texture, and Surface Texture/Wrap around cylinder placed lower than
  Properties/Position (this concerns Stefan's card view). Stefan asked Marcus.
- **#1587**: sliding latch for boxes, print-in-place if possible, with an "OPEN" sign. Stefan asked Marcus.

## Status page

Marcus's overview is a page on claude.ai that Copilot cannot reach. Do not try. Tell Marcus in German what you did, and
he notes it there himself.
