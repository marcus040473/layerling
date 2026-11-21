# Vasen-Generator 2

Ein neuer, schneller Kern für Vasen mit Oberflächenmustern, dazu eine fertige Seite zum Ausprobieren.
Warum es ihn gibt und was die Messungen sagen, steht in [ANALYSE.md](ANALYSE.md).

## Ausprobieren

`app/index.html` im Browser öffnen (Doppelklick genügt, es braucht keinen Server und kein Internet).

- Vorlage wählen oder „Zufall“ drücken.
- Körperform zeichnen: Punkte ziehen, Klick setzt einen Punkt, Doppelklick löscht ihn.
- Unter „Muster“ bis zu sechs Muster übereinanderlegen, jedes mit eigenem Höhenbereich.
- „Bild oder Text“ macht aus einem Bild oder einem getippten Text ein Relief.
- Unter „Druck“ zeigt „Überhänge zeigen“ rot, was zu steil ist, und „Aufschneiden“ den Blick in die Wand.
- Unter „Datei“ als STL oder 3MF speichern. 3MF ist bei gleicher Vase etwa sechsmal kleiner.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `src/params.mjs` | Einstellungen, Grenzen, Vorgaben. Reine Daten. |
| `src/shape.mjs` | Körperform (Radius über die Höhe) und Querschnitte (Radius über den Winkel). |
| `src/patterns.mjs` | Die zwölf Muster als Höhe über der abgewickelten Wand. |
| `src/engine.mjs` | Baut das Netz, rechnet Gewicht, Druckzeit, Inhalt und die Druck-Hinweise. |
| `src/export.mjs` | STL und 3MF. |
| `src/from-layerling.mjs` | Übersetzt die Einstellungen von Layerlings Vase in die des neuen Kerns. |
| `src/renderer.mjs`, `src/app.mjs`, `src/page.html` | Die Seite: 3D-Ansicht, Regler, Texte (`src/i18n.mjs`, Deutsch und Englisch). |
| `src/worker.mjs` | Baut die fertige Vase und die Dateien im Hintergrund. |
| `test/` | 14 Tests. |
| `bench/` | Messungen, auch gegen den heutigen Kern. |

Der Kern (`params`, `shape`, `patterns`, `engine`, `export`) hat keine Abhängigkeiten und läuft im Browser,
im Worker und in Node.

## Befehle

Tests:

```bash
node --test vasen-generator/test/*.test.mjs
```

Seite neu bauen. Das braucht `esbuild` oder `esbuild-wasm`; ist keines da, einmal ohne Eintrag in `package.json` holen:

```bash
npm install --no-save esbuild-wasm
```

```bash
node vasen-generator/build.mjs
```

Vergleich mit dem heutigen Kern:

```bash
node vasen-generator/bench/compare.mjs
```

Was jedes Muster kostet:

```bash
node vasen-generator/bench/patterns.mjs
```

## Den Kern benutzen

```js
import { buildVase } from './src/engine.mjs'
import { newLayer } from './src/params.mjs'

const mesh = buildVase({
  profile: 'belly', height: 180, diameter: 90,
  section: { type: 'polygon', sides: 6 }, twist: 90,
  layers: [newLayer('honeycomb', { count: 20, depth: -0.9, from: 10, to: 90 })],
})
// mesh.positions, mesh.normals (Float32Array), mesh.indices (Uint32Array), mesh.stats, mesh.notes
```

`buildVase(params, { quality: 'draft' })` gibt die schnelle Vorschau.
