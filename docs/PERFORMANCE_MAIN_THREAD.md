# What blocks the main thread

While the page's main thread works, the editor cannot answer a click, a key or the mouse: it
freezes. This note records how long the heavy actions block it, measured, before and after each
step that moves work into a worker. No step without a number.

## How it is measured

`scripts/measure-main-thread.mjs` runs each action in a fresh editor of a production build, in
headless Chromium, through the MCP bridge (and the real buttons for STEP export and opening a
.lyl file). It makes its own test data, the same at every run: a UV sphere of about 300,000
triangles as binary STL and as OBJ, 200,000 and 100,000 for the cuts, 60 boxes with 20 cylinder
holes, and so on. Set-up is not measured, only the action.

```
npm run build
LAYERLING_MCP_REMOTE=true LAYERLING_MCP_TOKEN=measure-token-0123456789 npx next start apps/web -p 3021
node scripts/measure-main-thread.mjs --url http://localhost:3021 --token measure-token-0123456789 [--only cut-mesh,split-mesh] [--runs 3] [--json out.json] [--profile dir]
```

The columns:

- **Duration**: from sending the command to its answer.
- **Main thread blocked / longest block**: the long tasks (50 ms or more) the browser reports.
- **Longest input delay**: how late a 10 ms timer came at worst - the wait a click or a key would
  have had. This decides **freezes**: 200 ms or more. The long-task count alone misses work the
  browser does not report as a task (the 3MF export and the print estimate show 0 ms there, yet a
  click waits over a second).
- **Longest frame gap**: the longest wait between two painted frames. Without input delay it is
  the GPU or the compositor, not the main thread (software rendering in the container).

`--profile dir` writes a CPU profile of each run (open it in Chrome DevTools, Performance).

Machine: a container with 4 cores, Chromium with SwiftShader (no GPU). Absolute numbers are for
comparing steps on the same machine, not for what a user's computer takes. The table shows the
median of the runs (2 for the baseline, 3 after step 1).

## Baseline (main at 83aba9cc)

| Action | Duration | Blocked | Longest block | Input delay | Frame gap | Freezes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Import STL, 300k triangles (binary) | 2,257 ms | 2,929 ms | 1,137 ms | 1,236 ms | 1,133 ms | yes |
| Import OBJ, 300k triangles | 2,430 ms | 2,764 ms | 1,574 ms | 1,585 ms | 1,567 ms | yes |
| Import 3MF, 100k triangles | 922 ms | 1,171 ms | 814 ms | 1,000 ms | 800 ms | yes |
| Group 60 boxes with 20 cylinder holes | 188 ms | 278 ms | 175 ms | 208 ms | 183 ms | yes |
| Group 40 cylinders with 20 sphere holes | 591 ms | 848 ms | 570 ms | 651 ms | 483 ms | yes |
| Cut a cylinder out of an imported 200k sphere | 1,898 ms | 2,625 ms | 1,887 ms | 2,245 ms | 1,267 ms | yes |
| Group two overlapping imported 100k spheres | 1,594 ms | 2,066 ms | 1,579 ms | 1,856 ms | 1,567 ms | yes |
| Split an imported 300k sphere in two | 3,873 ms | 4,369 ms | 3,861 ms | 3,869 ms | 3,850 ms | yes |
| Export STL (300k import and 40 boxes) | 1,223 ms | 189 ms | 189 ms | 1,143 ms | 1,100 ms | yes |
| Export 3MF of the same | 2,280 ms | 0 ms | 0 ms | 2,274 ms | 2,267 ms | yes |
| Print estimate of a 300k import | 1,157 ms | 0 ms | 0 ms | 1,145 ms | 1,133 ms | yes |
| Section view on (300k import and 40 boxes) | 11 ms | 581 ms | 512 ms | 538 ms | 567 ms | yes |
| Simplify a 300k import to 20 % | 345 ms | 579 ms | 330 ms | 332 ms | 317 ms | yes |
| Save a .lyl (300k import, 60 boxes, 60 undo steps) | 887 ms | 285 ms | 165 ms | 170 ms | 150 ms | no |
| Open that .lyl | 6,430 ms | 4,540 ms | 2,113 ms | 2,138 ms | 2,133 ms | yes |
| Export STEP of 60 bodies (loads the CAD kernel) | 1,630 ms | 0 ms | 0 ms | 123 ms | 117 ms | no |
| Import that STEP file | 60 ms | 0 ms | 0 ms | 44 ms | 183 ms | no |

The STEP export and import already run in the CAD worker; everything else that freezes runs on
the page.

## Step 1: grouping, cutting and splitting in a worker

`buildGroupedShapeFromSelection` and `splitShapeByPlane` (lib/editorBooleans.ts) run in
`workers/geometry.worker.ts`, called through `lib/geometryWorker.ts`. Everything the editor
groups, cuts or splits goes there: Group, the boolean cut, hole patterns, push/pull of a face,
rebuilding a group after its parts changed, honeycomb bodies, the QR code plate, and the same
through the MCP bridge.

- The shapes cross as Float64Arrays whose buffers are transferred (`lib/geometryTransfer.ts`): a
  Float64Array holds every number exactly, so the answer is the one the page would have worked
  out. A number list shared by several shapes goes once; one the answer takes over unchanged comes
  back as the page's own array.
- Every request has a number; an answer nobody waits for any more is dropped. A new split calls
  off the one before, leaving the editor calls off what it had running, and a worker with nothing
  else to do is stopped.
- Watchdog: a worker that has not said hello in 15 s, or takes over 180 s for one request, is
  stopped. A stuck request answers "The calculation took too long"; the next one starts a fresh
  worker.
- The worker says which build it is from first (lib/buildStamp.ts). No worker in the browser, a
  worker file that will not load (an old offline copy), one from another build, or one that
  crashes on the way: the work runs on the page as before. After two crashes in a visit the page
  stops trying.
- Text stays on the page (its fonts live there), and so does a grouping without a hole or an
  imported mesh, which only puts the parts together and is quicker done than sent away.
- From 300 ms on, the status line says "Calculating… you can keep working". The worker starts and
  loads Manifold when the editor is idle, as the page does, so the first cut does not wait for it.

| Action | Duration | Blocked | Longest block | Input delay | Freezes | Before: longest block / input delay |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Group 60 boxes with 20 cylinder holes | 351 ms | 103 ms | 103 ms | 104 ms | no | 175 / 208 ms |
| Group 40 cylinders with 20 sphere holes | 660 ms | 243 ms | 164 ms | 173 ms | no | 570 / 651 ms |
| Cut a cylinder out of an imported 200k sphere | 2,322 ms | 956 ms | 476 ms | 574 ms | yes | 1,887 / 2,245 ms |
| Group two overlapping imported 100k spheres | 1,854 ms | 579 ms | 283 ms | 362 ms | yes | 1,579 / 1,856 ms |
| Split an imported 300k sphere in two | 3,264 ms | 572 ms | 436 ms | 508 ms | yes | 3,861 / 3,869 ms |

The longest block fell from 1,887 to 476 ms for the cut, from 1,579 to 283 ms for the merge and
from 3,861 to 436 ms for the split; the two primitive groupings no longer freeze. The small
groupings take longer from start to answer (the shapes go to the worker and back), and that time
varies by about 100 ms from run to run.

What still blocks after the answer, from a CPU profile of the 200k cut (`--profile`), is not the
cut but what the editor does with its result:

- building the result's mesh for the view (three.js geometry, normals, bounds) - about 130 ms;
- counting the result's separate parts for "Separate parts" (`meshFaceComponents` in
  LayerlingEditor.tsx, string keys per vertex) - about 250 ms on 200k triangles; it runs whenever
  such a mesh is selected, not only after a cut;
- the scene fingerprint taken before and after the cut (`projectShapesFingerprint`) - about 80 ms;
- unpacking the answer into number lists - about 20 ms for 1.8 million numbers.

Checked:

- tests/e2e/geometryWorkerTransfer.e2e.ts: the worker's way (pack, unpack, compute, pack, unpack)
  gives the same result to the bit as the direct call, for a cut of an imported mesh, a merge of
  two and a split.
- tests/unit/geometryWorker.test.ts: the fallbacks - no worker, a worker that will not start, never
  says hello, is from another build, crashes during a request, gets stuck - and calling off.
- In the browser (production build): the same cut, split and grouping with the worker and with
  its file blocked give byte-identical STL exports; the blocked case works on the page without an
  error; the status line shows the notice during the 200k cut.
- Static export: the worker file is in the export, in the service worker's offline list, and is
  checked by `npm run verify:static-worker-assets`; with the network off, a reload loads it and
  Manifold from the offline copy.

Not checked: other browsers than Chromium, a real slow computer, a page update while a request
runs (the build stamp covers a worker from another build, not one replaced mid-request), and the
memory a large cut now takes twice (page and worker each hold the mesh while it runs). Workers do
not raise the memory limit of a tab (#683).

## Step 2: a pool of workers - measured, not built

A single cut cannot be shared between workers; a pool only helps when several cuts wait at the
same time. In the editor that is Split through several objects (the honeycomb conversion is the
other loop). A prototype ran up to `hardwareConcurrency - 1` workers (3 here, at most 4) and
started the cuts of a split together. Measured against the same code with one worker, median of
3 runs, actions `split-four` and `split-four-warm` (the second after a split of four small boxes,
so every worker has started):

| Split four imported 100k spheres | 1 worker | 3 workers |
| --- | ---: | ---: |
| Duration, workers cold | 3,816 ms | 2,717 ms |
| Duration, workers warm | 3,675 ms | 2,634 ms |
| Main thread blocked, cold | 1,257 ms | 1,964 ms |
| Main thread blocked, warm | 1,418 ms | 1,338 ms |
| Longest input delay, cold / warm | 1,166 / 1,311 ms | 1,219 / 1,251 ms |

The pool saves about a second, 28 %, on this one action, and nothing on a single cut. It does not
make the editor freeze less: the longest freeze, about 1.1 s, is the page handling the eight
halves after the answer (see step 1), and while the extra workers start the main thread is blocked
longer. Each further worker also holds its own Manifold and its copy of the meshes (not
measured). Not worth it for now; the time after the answer is the larger lever.

## Step 3: what the page does after the answer

CPU profiles of the cuts after step 1 (`--profile`) showed where the remaining freeze goes. Three
pieces are now quicker, each with the same result as before:

- **Edge lines** (`lib/fastEdgesGeometry.ts`): THREE.EdgesGeometry builds a text key for every
  corner and edge; the same algorithm with numbers gives the same lines in the same order
  (tests/unit/fastEdgesGeometry.test.ts compares them with three.js) and took 82 instead of 439 ms
  for a 99,000-triangle sphere in the unit test. Splitting four 100k spheres spent 590 ms of the main thread
  in it.
- **Counting the parts for "Separate parts"** (`lib/meshPartCount.ts`): the same count as the parts
  the button makes (tests/unit/meshPartCount.test.ts checks it against the editor's own way), with
  a number table and union-find instead of a text key per corner. It runs whenever a large mesh is
  selected. Separating itself is unchanged.
- **Whether the split plane crosses an object**: the test builds the object's whole mesh; it now
  runs in the worker with the cut (`splitShapeIfCrossed`), 320 ms of main thread for four 100k
  spheres before.

| Action | Longest block, step 1 → now | Input delay, step 1 → now |
| --- | ---: | ---: |
| Group 60 boxes with 20 cylinder holes | 103 → 78 ms | 104 → 89 ms |
| Group 40 cylinders with 20 sphere holes | 164 → 111 ms | 173 → 135 ms |
| Cut a cylinder out of an imported 200k sphere | 476 → 385 ms | 574 → 410 ms |
| Group two overlapping imported 100k spheres | 283 → 212 ms | 362 → 251 ms |
| Split an imported 300k sphere in two | 436 → 458 ms | 508 → 535 ms |
| Split four imported 100k spheres | 1,166 → 745 ms | 1,269 → 846 ms |

The single 300k split does not change: its halves are above the size whose edges are drawn. Its
profile shows what is left there, all of it the view of the two new meshes:

- building their geometry for the view (getImportedMeshCache in WorkplaneViewport.tsx: number list
  to Float32Array, normals, moving it onto the plate) - about 520 ms;
- the raycasting index (three-mesh-bvh) - about 150 ms;
- unpacking the worker's answer - about 140 ms;
- building a shape's mesh (meshForShape) once more on the page - about 160 ms.

The first two could be built in the worker as well (three.js and three-mesh-bvh run there); the
same work happens on import and when a .lyl opens, so that is the next lever.

Checked: unit and e2e tests; in the browser, the same cut, split and grouping give byte-identical
STL exports as with step 1, with the worker and with its file blocked.

## Step 4: the view of a new mesh, built in the worker

For each mesh a cut, merge or split makes, the worker now also builds what the view draws
(`lib/importedMeshDisplay.ts`): the geometry as the viewport builds it (positions as Float32,
normals, moved onto the plate) and its raycasting index (three-mesh-bvh, the same options). They
come back as transferred buffers with the answer; the viewport takes them instead of building
them, the index only where it would build one itself and only for exactly that geometry. Without
the worker, or for any other mesh, the viewport builds both as before.

On the way: the viewport worked out the normals of a mesh without stored normals twice (once in
getImportedMeshCache, once in putGeometryOnBase), with the same result; it does that once now.

tests/unit/importedMeshDisplay.test.ts checks that the prepared geometry has the same positions,
normals, bounds and index as the one the page builds, that 60 rays hit it at the same distance and
face, and that one normals pass gives what the two gave.

| Action | Longest block, step 3 → now | Input delay, step 3 → now |
| --- | ---: | ---: |
| Group 40 cylinders with 20 sphere holes | 111 → 80 ms | 135 → 94 ms |
| Cut a cylinder out of an imported 200k sphere | 385 → 205 ms | 410 → 302 ms |
| Group two overlapping imported 100k spheres | 212 → 130 ms | 251 → 220 ms |
| Split an imported 300k sphere in two | 458 → 108 ms | 535 → 291 ms |
| Split four imported 100k spheres | 745 → 251 ms | 846 → 348 ms |

From the baseline the longest block of these went down from 1.9, 1.6 and 3.9 s to 0.1 to 0.25 s.
The input delay stays a little above 200 ms: several shorter tasks follow each other (the answer,
the history step, the first frame of the new mesh), none of them long.

Checked as well: the same STL exports as before with the worker and with its file blocked; a click
on a half after a split selects it (picking through the index from the worker); the static export
lists the worker in the offline copy, and with the network off a reload loads it from there.

## Step 5: import and export

CPU profiles of the import, export and estimate actions showed:

- **3MF export**: fflate's `zipSync` packed the file on the main thread, 1.3 s for the 300k import.
  `exportMeshesTo3mfAsync` (lib/threemfExport.ts) hands the same files with the same options to
  fflate's `zip`, which packs in its own workers, as the .lyl save already did; where those cannot
  start it packs with `zipSync` as before. tests/unit/threemfExportAsync.test.ts: the same bytes.
- **Print estimate**: `closedMeshFaceOrientation` (lib/cadProfileExtrusion.ts) built a text key
  per corner and per edge, 1.2 s for the 300k import. It now welds with a number table and keys the
  edges by number, ids and lists in the same order, so the result is the same to the bit
  (tests/unit/closedMeshOrientation.test.ts compares it with the text-key version).
- **STL and OBJ import**: read in the geometry worker (`importedShapeFromStlOffThread`,
  `importedShapesFromObjOffThread` in lib/geometryWorker.ts), with the view's geometry prepared
  there as for a cut (step 4); the .lyl loader reads a stored STL that way as well. Without the
  worker, and on the server, they are read on the page as before. The import window keeps its own
  progress; no "Calculating" notice. 3MF stays on the page: it is read with DOMParser, which a
  worker does not have. The prepared view geometry is now kept by the mesh's position list, so a
  copy of the mesh with its asset id added still finds it.

Two measuring problems turned up on the way:

- The bridge hands an import file to the page as base64 and the page decodes it, and an export
  comes back the same way: for 300k triangles that is about a second of the main thread that a
  person importing through the file chooser or saving a file never has. `import-stl` and the export
  actions include it; `import-stl-file` and `import-obj-file` (new) go through the file chooser.
- Playwright's `setInputFiles` with a buffer copies the file through a script in the page (2 s for
  20 MB); the new actions hand it a path on disk instead.

| Action | Input delay before | now |
| --- | ---: | ---: |
| Export 3MF (through the bridge) | 2,274 ms | 1,061 ms |
| Print estimate | 1,145 ms | 784 ms |
| Import OBJ (through the bridge) | 1,585 ms | 621 ms |
| Import STL (through the bridge, base64 decoding on the page) | 1,236 ms | 1,235 ms |

Through the file chooser, against a build of main (both measured here, median of 3):

| Import, 300k triangles | Duration | Main thread blocked | Longest block |
| --- | ---: | ---: | ---: |
| STL, main → now | 4,371 → 4,558 ms | 4,528 → 3,926 ms | 1,962 → 1,838 ms |
| OBJ, main → now | 5,717 → 5,877 ms | 5,717 → 3,660 ms | 2,085 → 1,533 ms |

Reading the file no longer blocks; the longest block left is the editor starting the new design the
import opens: compiling the WebGL shaders (about 3 s in this container's software rendering, far
less on a graphics card - not measured) and the design's preview picture (`toBlob`, about 0.9 s).
The same two are most of opening a .lyl (2,138 → 1,621 ms input delay).

## Step 6: print estimate, simplify, section view

- **Print estimate** (`exportSolidVolumeOffThread`): the whole estimate - solids, holes taken off,
  union, volume and surface - runs in the geometry worker; the answer is a few numbers. Text stays
  on the page.
- **Simplify** (`simplifyTrianglePositionsOffThread`): meshoptimizer runs in the worker, with the
  view's geometry of the result prepared there. The panel calls off a value the slider has left,
  in the worker too.
- **Welding on a grid** (`lib/gridWeld.ts`): one number table for what three places did with a
  text key per corner - the print estimate's orientation, the part count and the section view's
  weld (`lib/sectionSvg.ts`). tests/unit/gridWeld.test.ts compares it with the text keys on 60
  random sets at five grid sizes, -0, NaN and infinity included. The edge lines keep their own
  (three.js multiplies by the grid where these divide, which can round differently).

| Action | Input delay, step 5 → now |
| --- | ---: |
| Print estimate of a 300k import | 784 → 39 ms |
| Simplify a 300k import to 20 % | 423 → 75 ms |
| Section view on (300k import and 40 boxes) | 734 → 467 ms |

Checked as well: in the browser the estimate gives the same numbers and the simplified mesh the
same STL export with the worker and with its file blocked; tests/e2e/geometryWorkerTransfer.e2e.ts
sends both through the worker's packing.

What is left of the section view: compiling the shaders of the cut faces (about 220 ms, software
rendering) and building the meshes of the bodies once more on the page (about 190 ms).

Shader compilation and the preview picture, the largest part of opening a .lyl and of an import
through the file chooser, are not touched: this container renders with SwiftShader, which has no
parallel shader compilation (`KHR_parallel_shader_compile`), so neither an asynchronous compile
nor its effect can be measured here. That needs a computer with a graphics card.

## Still on the main thread

| Action | Longest input delay now | What it is |
| --- | ---: | --- |
| Open a .lyl | 1,621 ms | shader compilation and the preview picture (profiled) |
| Import through the file chooser | 1,533-1,838 ms | the same (profiled) |
| Export STL (through the bridge) | 1,143 ms | mostly the bridge's base64 (profiled); a download not measured |
| Export 3MF (through the bridge) | 1,061 ms | not profiled again; before, writing the model text and welding came after the packing |
| Import 3MF | 793 ms | DOMParser, not in a worker |
| Section view on | 467 ms | shaders of the cut faces, meshes built again (profiled) |
