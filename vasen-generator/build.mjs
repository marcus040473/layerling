// Builds the generator into one file each: app/index.html opens straight from the disk, app/artifact.html is
// the same page without the document's frame (for publishing as a Claude artifact).
// Needs esbuild or esbuild-wasm (`npm install --no-save esbuild-wasm`): `node vasen-generator/build.mjs`,
// or ESBUILD=/path/to/esbuild-wasm/lib/main.js when it lives elsewhere.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
function load() {
  for (const name of [process.env.ESBUILD, 'esbuild', 'esbuild-wasm']) {
    if (!name) continue
    try { return require(name) } catch { /* the next one */ }
  }
  throw new Error('esbuild is missing: run npm ci in the repository, or set ESBUILD')
}
const esbuild = load()

const common = { bundle: true, format: 'iife', minify: true, target: 'es2022', write: false, legalComments: 'none' }
const workerBuild = await esbuild.build({ ...common, entryPoints: [join(here, 'src/worker.mjs')] })
const workerSource = workerBuild.outputFiles[0].text
const appBuild = await esbuild.build({
  ...common,
  entryPoints: [join(here, 'src/app.mjs')],
  plugins: [{
    name: 'worker-source',
    setup(build) {
      build.onResolve({ filter: /^worker-source$/ }, () => ({ path: 'worker-source', namespace: 'worker-source' }))
      build.onLoad({ filter: /.*/, namespace: 'worker-source' }, () => ({ contents: `export default ${JSON.stringify(workerSource)}`, loader: 'js' }))
    },
  }],
})
// A closing script tag inside the script would end it early.
const appSource = appBuild.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')
const page = (await readFile(join(here, 'src/page.html'), 'utf8')).replace('/*APP*/', () => appSource)
await mkdir(join(here, 'app'), { recursive: true })
await writeFile(join(here, 'app/artifact.html'), page)
const head = page.slice(0, page.indexOf('<div class="app">'))
const body = page.slice(page.indexOf('<div class="app">'))
await writeFile(join(here, 'app/index.html'), `<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n${head}</head>\n<body>\n${body}</body>\n</html>\n`)
console.log(`app/index.html ${(page.length / 1024).toFixed(0)} KB (worker ${(workerSource.length / 1024).toFixed(0)} KB)`)
