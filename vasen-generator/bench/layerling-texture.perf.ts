// Measures what a Surface Texture costs on a vase in Layerling itself. Copy into tests/perf/ of the Layerling
// repository and run: npx vitest run --config tests/vitest.perf.config.ts tests/perf/layerling-texture.perf.ts
import { it } from "vitest";
import { fittedVaseMesh, createVaseGeometry } from "@/lib/vaseShape";
import { textureSurfacePositions } from "@/lib/surfaceTextureShape";
import { normalizeSurfaceTexture, SURFACE_TEXTURE_PREVIEW_TRIANGLES } from "@/lib/surfaceTexture";

function timed<T>(run: () => T): [number, T] {
  const start = performance.now();
  const out = run();
  return [Number((performance.now() - start).toFixed(0)), out];
}

it("vase + surface texture cost", { timeout: 600000 }, () => {
  const patterns = (process.env.PATTERNS ?? "grooves,knurl,honeycomb,bumps,cells,bricks,knit,rope,weave,bark,wood,carbon,grain,squares,triangles,stones,cracks").split(",");
  for (const vase of [{ effect: "keine" }, { effect: "keine", body: "hohl" }]) {
    const shape = { width: 90, depth: 90, height: 180, vase };
    const [fitMs, mesh] = timed(() => fittedVaseMesh(shape));
    const [geoMs] = timed(() => createVaseGeometry(shape));
    process.stdout.write(`${JSON.stringify({ vase, triangles: mesh.triangleCount, fitMs, geoMs })}\n`);
    const input = Float64Array.from(mesh.positions);
    for (const pattern of patterns) {
      for (const [label, max] of [["preview", SURFACE_TEXTURE_PREVIEW_TRIANGLES], ["full", undefined]] as const) {
        try {
          const settings = normalizeSurfaceTexture({ pattern });
          const [ms, out] = timed(() => textureSurfacePositions(input, settings, max));
          process.stdout.write(`  ${pattern.padEnd(10)} ${label.padEnd(8)} ${String(ms).padStart(6)} ms  tris ${String(out.positions.length / 9).padStart(8)}\n`);
        } catch (error) {
          process.stdout.write(`  ${pattern} ${label} ERROR ${(error as Error).message}\n`);
        }
      }
    }
  }
});
