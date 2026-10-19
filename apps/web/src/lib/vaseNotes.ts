import { numberLocale, t, type MessageKey } from "@/lib/i18n";

/**
 * The notes of the vase tool's import modules (SVG, mesh, photo), which they write in German, in
 * the current language. The modules stay as the vase tool has them; a note is recognised by its
 * wording, its numbers carried over. A note not known here stays as it is.
 */

/** A number the vase tool wrote the German way (12,5 or 1.234), in the current language's format. */
function number(text: string) {
  const value = Number(text.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? value.toLocaleString(numberLocale(), { maximumFractionDigits: 1 }) : text;
}

type Note = { pattern: RegExp; key: MessageKey; params?: (match: RegExpMatchArray) => Record<string, string | number> };

const NUMBER = "(-?[\\d.]+(?:,\\d+)?)";

const NOTES: Note[] = [
  { pattern: /^Keine SVG-Datei erkannt\.$/, key: "vaseNote.noSvg" },
  { pattern: /^Die Datei nennt keine Größe in mm/, key: "vaseNote.svgNoSize" },
  { pattern: /^In der Datei steht keine Form/, key: "vaseNote.svgNoShape" },
  { pattern: /^Keine geschlossene Form gefunden\.$/, key: "vaseNote.svgNoClosedShape" },
  { pattern: /^Eine weitere Form in der Datei bleibt unberücksichtigt/, key: "vaseNote.svgOneMoreShape" },
  { pattern: /^(\d+) weitere Formen in der Datei bleiben unberücksichtigt/, key: "vaseNote.svgMoreShapes", params: (m) => ({ count: m[1] }) },
  { pattern: /^Die Form war offen und wird geschlossen\.$/, key: "vaseNote.svgClosed" },
  { pattern: /^Die Mitte der Form liegt nicht in der Form/, key: "vaseNote.svgCentreOutside" },
  { pattern: /^Der Umriss hat (\d+) Abschnitte – auf (\d+) Punkte vereinfacht\.$/, key: "vaseNote.svgSimplified", params: (m) => ({ segments: m[1], points: m[2] }) },
  { pattern: /^Die Form hat keine Höhe oder Breite\.$/, key: "vaseNote.svgFlat" },
  { pattern: /^Gelesen als rechte Hälfte/, key: "vaseNote.svgRightHalf" },
  { pattern: /^Gelesen als ganze Silhouette/, key: "vaseNote.svgWhole" },
  { pattern: /^Aus der Form lässt sich keine Körperform ablesen\.$/, key: "vaseNote.svgNoProfile" },
  {
    pattern: new RegExp(`^Aus der Datei: ${NUMBER} mm hoch, ${NUMBER} mm breit, (\\d+) Punkte\\.$`),
    key: "vaseNote.svgSize",
    params: (m) => ({ height: number(m[1]), width: number(m[2]), points: m[3] }),
  },
  { pattern: /^Das Netz hat keine Höhe/, key: "vaseNote.meshFlat" },
  { pattern: /^Aus dem Netz lässt sich keine Körperform ablesen\.$/, key: "vaseNote.meshNoProfile" },
  {
    pattern: new RegExp(`^Aus dem Netz: ${NUMBER} mm hoch, ${NUMBER} mm breit, (\\d+) Punkte \\(größter Abstand zur senkrechten Achse an (\\d+) Höhen\\)\\.$`),
    key: "vaseNote.meshSize",
    params: (m) => ({ height: number(m[1]), width: number(m[2]), points: m[3], stations: m[4] }),
  },
  { pattern: /^Unten liegt keine ebene Fläche auf/, key: "vaseNote.meshLying" },
  { pattern: /^Das Teil ist um die senkrechte Achse nicht rund/, key: "vaseNote.meshNotRound" },
  { pattern: /^Kein Bild\.$/, key: "vaseNote.photoNone" },
  { pattern: /^Der Hintergrund ist unruhig/, key: "vaseNote.photoBusy" },
  { pattern: /^Im Foto hebt sich nichts deutlich vom Hintergrund ab\.$/, key: "vaseNote.photoNothing" },
  { pattern: /^Der gefundene Bereich füllt das ganze Foto/, key: "vaseNote.photoWhole" },
  { pattern: /^Der Gegenstand reicht bis an den Bildrand/, key: "vaseNote.photoEdge" },
  { pattern: /^Rand und Boden erscheinen als Ellipse/, key: "vaseNote.photoEllipse" },
  { pattern: /^Kein Gegenstand gefunden\.$/, key: "vaseNote.photoNoObject" },
  { pattern: /^Bitte die Höhe des Gegenstands in mm angeben\.$/, key: "vaseNote.photoHeight" },
  { pattern: /^Der Gegenstand ist im Foto zu klein für einen Umriss\.$/, key: "vaseNote.photoSmall" },
  { pattern: /^Aus dem Umriss lässt sich keine Körperform ablesen\.$/, key: "vaseNote.photoNoProfile" },
  { pattern: /^Breite und Höhe passen nicht zum Seitenverhältnis im Foto \(quer (-?\d+) % gestreckt\)/, key: "vaseNote.photoStretched", params: (m) => ({ percent: m[1] }) },
];

/** A note of the vase tool's import modules in the current language. */
export function vaseNote(text: string): string {
  for (const { pattern, key, params } of NOTES) {
    const match = text.match(pattern);
    if (match) return t(key, params?.(match));
  }
  return text;
}
