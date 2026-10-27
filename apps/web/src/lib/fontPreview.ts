import { JAPANESE_FONT, customFontRevision, japaneseTypefaceLoaded, textFont, textFontsLoaded } from "@/lib/textFonts";

/**
 * A line of text in one of the editor's typefaces, as an SVG path, for the font picker and the font
 * window. It is drawn from the same outlines the text shape is built from, so a font of one's own
 * shows as it will come out, whether or not the browser has it installed.
 */
export type FontPreview = {
  /** The outline, y down, the baseline at 0; every glyph's holes are in it (fill-rule evenodd). */
  d: string;
  /** Where the line starts, ends and what it needs above and below the baseline, in the size asked for. */
  minX: number;
  width: number;
  ascent: number;
  descent: number;
};

/** The longest sample drawn: a long text only needs its start to show the face. */
export const FONT_PREVIEW_MAX_CHARACTERS = 28;

const cache = new Map<string, FontPreview | null>();

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * The preview of `text` in `fontId`, `size` tall (the height of a capital's em, in the units of the
 * path), or null when the fonts are not loaded yet or the text has no outlines. Kept per font, text and
 * size until the font changes - a font of one's own that was read again, or the Japanese face that arrived.
 */
export function fontPreview(fontId: string, text: string, size = 24): FontPreview | null {
  if (!textFontsLoaded()) return null;
  // Drawing it would fetch the 2.6 MB Japanese face; a list of fonts must not do that. It shows once something else has.
  if (fontId === JAPANESE_FONT && !japaneseTypefaceLoaded()) return null;
  const sample = Array.from(text.replace(/\s+/g, " ").trim()).slice(0, FONT_PREVIEW_MAX_CHARACTERS).join("");
  if (!sample) return null;
  const key = `${fontId}\u0000${customFontRevision(fontId)}\u0000${size}\u0000${sample}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  let preview: FontPreview | null = null;
  try {
    const shapes = textFont(fontId).generateShapes(sample, size);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const parts: string[] = [];
    for (const shape of shapes) {
      const { shape: outline, holes } = shape.extractPoints(8);
      for (const loop of [outline, ...holes]) {
        if (loop.length < 3) continue;
        parts.push(`M${loop.map((point) => `${round(point.x)} ${round(-point.y)}`).join("L")}Z`);
        for (const point of loop) {
          minX = Math.min(minX, point.x);
          maxX = Math.max(maxX, point.x);
          minY = Math.min(minY, point.y);
          maxY = Math.max(maxY, point.y);
        }
      }
    }
    if (parts.length > 0) {
      preview = { d: parts.join(""), minX: round(minX), width: round(maxX - minX), ascent: round(Math.max(maxY, size * 0.7)), descent: round(Math.max(-minY, 0)) };
    }
  } catch {
    preview = null;
  }
  if (cache.size > 600) cache.clear();
  cache.set(key, preview);
  return preview;
}
