## Summary

Hi Stefan, thanks for tracking this down so precisely (Make exact on a library sphere, exported as STL and read back, reported by Making Layers). All three things you found are fixed, and a fourth one turned up on the way:

- **Over 200,000 triangles:** the edge tool's worker now passes its own limit (`maxTriangles`, 400,000 for Make exact) to `exactSolidFromMesh`, so the 256-step sphere (261,120 triangles) is no longer turned away by the lower default. The STEP export passes its limit too.
- **"Maximum call stack size exceeded":** `Math.max(...values)` and `Math.min(...values)` over every corner or triangle of a face overflowed the stack from about 120,000 values on (first in `bendsEnough`, then in the sphere split and `surfaceFace`). They are now `maxOf` / `minOf` in `lib/meshSurfaceFit.ts`, which loop instead.
- **The sphere was not found whole:** the fans of slivers round the poles turn by hundredths of a degree from one triangle to the next, so they grew into small flat faces, and because creases under 0.1° counted neither as shallow nor as sharp, those faces were never let go for the sphere. Such creases now count as shallow (`meshSurfaceSegments.ts`). The library sphere now comes out as one sphere region with 24, 64, 128 and 256 steps at every size I tried.
- **"makeArcEdge: construction failed" at the cuts:** a mesh that is one sphere all round is now built as the kernel's own sphere (`wholeSphere` in `cadMeshExact.ts`): one face, nothing to cut, checked against the mesh's volume. For spheres that still have to be cut (a ball with a flat underside, a hemisphere, a ball with a bore), the cut path is sturdier too:
  - where two great circles cross, the jagged mesh outline left single-triangle crumbs as pieces of their own; they now go to the neighbouring piece (`absorbCrumbs` in `meshSurfaceTopology.ts`);
  - a chain between two pieces of one face whose ends were both moved onto the crossing gets no edge, and its two ends are snapped to the very same point, so the edges either side join into a wire (`emptyChain`, `snapEmptyChains`);
  - when `unifySameDomain` breaks the sewn solid (eight sphere pieces became faces of no area), the solid keeps its pieces apart instead of being thrown away.

| Library sphere (the editor's own mesh, as in its STL) | before | now |
|---|---|---|
| 24 steps, 20 to 200 mm | 1 sphere face | 1 sphere face |
| 64 steps, 50 mm | 16,128 facets, 20 s | 1 sphere face, 0.2 s |
| 128 steps, 20 / 40 / 100 mm | about 64,800 facets, about 100 s | 1 sphere face, 0.5 s |
| 256 steps, 30 mm | stack overflow | 1 sphere face, about 5 s |
| Ball with a flat underside, fine kernel mesh | 17,653 facets | plane + sphere |

## Testing

- [x] `npm run typecheck`
- [x] `npm test` (6853 passed)
- [x] `npm run test:e2e` (1884 passed)
- [x] New tests in `cadMeshExact.e2e.ts` (library spheres from the editor's own mesh in single precision, the 256-step sphere with 261,120 triangles, a ball with a flat underside, a hemisphere and a ball with a bore from fine meshes) and in `cadMeshExactWorker.e2e.ts` (Make exact through the worker on the 256-step sphere). Without the change, five of them fail as in your mail, and the worker one with "The faces found in this mesh did not close into a solid".

## Notes

- Very coarse spheres (12 steps, or 24 steps at 500 mm) stay as they were: their chords stand further off the sphere than a mesher would leave them, so they are taken for facets, as before.
- The 200,000 default of `exactSolidFromMesh` itself is unchanged; the callers pass their own limit.
