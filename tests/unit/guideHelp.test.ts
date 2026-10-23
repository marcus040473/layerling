// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { guidePrepare, type GuideSearchEntry } from "@/lib/guideSearchCore";
import { guideIndexUrl, helpNameOf, helpSummary, loadGuideIndex, lookupHelp, panelGuideHref, resolveHelpTarget } from "@/lib/guideHelp";

/*
 * Interactive Help: the name of an element, the walk up to one that has a name, and what the guide's
 * index says about it.
 */

function page(html: string) {
  document.body.innerHTML = html;
  return document;
}

describe("the name of an element", () => {
  it("takes data-help before everything else", () => {
    page('<button id="b" data-help="Mirror" aria-label="Flip" title="Turn">X</button>');
    expect(helpNameOf(document.getElementById("b")!)).toBe("Mirror");
  });

  it("takes the aria-label, then the title, then the words on a button", () => {
    page('<button id="a" aria-label="Align faces" title="Other">A</button><button id="b" title="Group">B</button><button id="c"> Mirror  </button>');
    expect(helpNameOf(document.getElementById("a")!)).toBe("Align faces");
    expect(helpNameOf(document.getElementById("b")!)).toBe("Group");
    expect(helpNameOf(document.getElementById("c")!)).toBe("Mirror");
  });

  it("leaves the keys at the end of a title out", () => {
    page('<button id="a" title="Import (Ctrl+I)">i</button><button id="b" title="Command search (Ctrl+K)">k</button><button id="c" title="Hide (H)">h</button><button id="d" title="Snap (grid)">s</button>');
    expect(helpNameOf(document.getElementById("a")!)).toBe("Import");
    expect(helpNameOf(document.getElementById("b")!)).toBe("Command search");
    expect(helpNameOf(document.getElementById("c")!)).toBe("Hide");
    // Words in brackets that are no keys stay.
    expect(helpNameOf(document.getElementById("d")!)).toBe("Snap (grid)");
  });

  it("reads the label of a field, wherever the label is", () => {
    page('<label for="w">Width</label><input id="w" type="text"><label class="slider"><span class="range-property-name">Wall thickness</span><input id="t" type="range"></label><span id="n">Depth</span><input id="d" aria-labelledby="n">');
    expect(helpNameOf(document.getElementById("w")!)).toBe("Width");
    expect(helpNameOf(document.getElementById("t")!)).toBe("Wall thickness");
    expect(helpNameOf(document.getElementById("d")!)).toBe("Depth");
  });

  it("calls the label around a slider by its name, not by its unit", () => {
    page('<label id="l" class="range-property"><span class="range-property-header"><span class="range-property-name">Length</span><span class="range-value-control"><input type="text"><span>mm</span></span></span><input type="range"></label>');
    expect(helpNameOf(document.getElementById("l")!)).toBe("Length");
  });

  it("calls the number field inside a slider by the slider's name, not by its name and unit together", () => {
    page('<label class="range-property"><span class="range-property-header"><span class="range-property-name">Length<button type="button" title="Reset"></button></span><span class="range-value-control"><input id="t" type="text" value="30.00"><span>mm</span></span></span><input id="s" type="range"></label>');
    expect(helpNameOf(document.getElementById("t")!)).toBe("Length");
    expect(helpNameOf(document.getElementById("s")!)).toBe("Length");
  });

  it("asks for the name of a slider from the line above it, which holds the name and the unit", () => {
    page('<label class="range-property"><span class="range-property-header" id="h"><span class="range-property-name" id="n">Length</span><span class="range-value-unit">mm</span></span></label>');
    expect(helpNameOf(document.getElementById("h")!)).toBe("");
    expect(resolveHelpTarget(document.getElementById("n"))?.name).toBe("Length");
    expect(resolveHelpTarget(document.getElementById("h"))?.name).toBe("Length");
  });

  it("calls a panel or a ribbon group by its heading, not by everything in it", () => {
    page('<div class="edge-modifier-header" id="h"><div><strong>Hole pattern</strong><span>Holes in a flat face</span></div></div><div data-group="modify" id="g"><div class="toolbar-section-label">Modify</div><button>Align</button></div>');
    expect(helpNameOf(document.getElementById("h")!)).toBe("Hole pattern");
    expect(helpNameOf(document.getElementById("g")!)).toBe("Modify");
  });

  it("has no name for a container, a number or a sentence", () => {
    page('<div id="c"><button>Mirror</button></div><button id="n">12.5</button><button id="s">This is a long sentence that explains a thing the button does and so it is no name at all.</button><svg id="v" aria-hidden="true"></svg>');
    expect(helpNameOf(document.getElementById("c")!)).toBe("");
    expect(helpNameOf(document.getElementById("n")!)).toBe("");
    expect(helpNameOf(document.getElementById("s")!)).toBe("");
    expect(helpNameOf(document.getElementById("v")!)).toBe("");
  });
});

describe("the element the user pointed at", () => {
  it("is the nearest one with a name, found from an icon inside a button", () => {
    page('<div class="toolbar"><button id="b" aria-label="Mirror"><svg><path id="p"/></svg></button></div>');
    const target = resolveHelpTarget(document.getElementById("p"));
    expect(target?.name).toBe("Mirror");
    expect(target?.element.id).toBe("b");
  });

  it("is the field itself, not the window around it", () => {
    page('<div role="dialog" aria-label="Hole pattern"><label><span class="range-property-name">Margin</span><input id="m" type="range"></label></div>');
    const target = resolveHelpTarget(document.getElementById("m"));
    expect(target?.name).toBe("Margin");
  });

  it("passes over an element without a name to the one around it", () => {
    page('<section data-group="arrange" id="g"><div class="toolbar-section-label">Arrange</div><div class="tools" id="t"><span id="s"></span></div></section>');
    const target = resolveHelpTarget(document.getElementById("s"));
    expect(target?.name).toBe("Arrange");
    expect(target?.element.id).toBe("g");
  });

  it("falls back to the question mark of the panel when nothing has a name", () => {
    page('<div class="edge-modifier-panel"><div class="panel-header-actions"><a class="guide-help-link" href="/guide/select-and-arrange.html#hole-pattern-on-a-face"></a></div><div><i id="x"></i></div></div>');
    expect(panelGuideHref(document.getElementById("x")!)).toBe("/guide/select-and-arrange.html#hole-pattern-on-a-face");
    const target = resolveHelpTarget(document.getElementById("x"));
    expect(target?.name).toBe("");
    expect(target?.guideHref).toBe("/guide/select-and-arrange.html#hole-pattern-on-a-face");
  });

  it("is nothing on bare ground, and nothing inside what asks to be left alone", () => {
    page('<div id="x"></div><div data-help-ignore><button id="b">Mirror</button></div>');
    expect(resolveHelpTarget(document.getElementById("x"))).toBeNull();
    expect(resolveHelpTarget(document.getElementById("b"))).toBeNull();
  });

  it("carries the question mark of its panel along with a name", () => {
    page('<div role="dialog"><a class="guide-help-link" href="/guide/shortcuts.html"></a><button id="b">Close</button></div>');
    expect(resolveHelpTarget(document.getElementById("b"))?.guideHref).toBe("/guide/shortcuts.html");
  });
});

const entries: GuideSearchEntry[] = [
  { c: "Selecting and arranging", h: "", u: "/guide/select.html", t: "Moving, aligning and mirroring parts." },
  { c: "Selecting and arranging", h: "Mirror", u: "/guide/select.html#mirror", t: "Flips the selection across a plane. Click “Mirror” and pick an axis. A copy needs Duplicate first." },
  { c: "Selecting and arranging", h: "Align", u: "/guide/select.html#align", t: "Align lays bodies on one edge. Use “Align” with several bodies. Mirror is next to it." },
  { c: "Solids and holes", h: "Grouping", u: "/guide/solids.html#grouping", t: "A hole cuts a solid when you press “Group”. To mirror a group, select it first." },
  { c: "Shapes", h: "The shape's settings", u: "/guide/shapes.html#settings", t: "Every shape has settings such as the wall thickness." },
];
const index = guidePrepare(entries);

describe("what the guide says about a name", () => {
  it("puts the section whose heading is the name first", () => {
    const result = lookupHelp(index, "Mirror", "en");
    expect(result.best?.entry.u).toBe("/guide/select.html#mirror");
    expect(result.more.map((match) => match.entry.u)).toEqual(expect.arrayContaining(["/guide/select.html#align"]));
    expect(result.more.length).toBeLessThanOrEqual(2);
  });

  it("prefers the section that writes the name as a button, over one that only has the word", () => {
    const result = lookupHelp(index, "Group", "en");
    expect(result.best?.entry.u).toBe("/guide/solids.html#grouping");
  });

  it("answers with nothing when the guide has nothing", () => {
    const result = lookupHelp(index, "Teleport", "en");
    expect(result.best).toBeNull();
    expect(result.more).toEqual([]);
  });

  it("finds a name that needs every word and ignores case and accents", () => {
    expect(lookupHelp(index, "wall THICKNESS", "en").best?.entry.u).toBe("/guide/shapes.html#settings");
  });

  it("matches ae and ue for the umlauts of German", () => {
    const german = guidePrepare([{ c: "Auswählen", h: "Teile ändern", u: "/anleitung/a.html#aendern", t: "Ändere die Teile über die Griffe." }]);
    expect(lookupHelp(german, "Teile aendern", "de").best?.entry.u).toBe("/anleitung/a.html#aendern");
    // English does not do that.
    expect(lookupHelp(german, "Teile aendern", "en").best).toBeNull();
  });

  it("uses the quotation marks of the language", () => {
    const german = guidePrepare([
      { c: "Körper", h: "Verbinden", u: "/anleitung/k.html#v", t: "Mit „Gruppieren“ wird aus Teilen eins." },
      { c: "Körper", h: "Anderes", u: "/anleitung/k.html#a", t: "Gruppieren ist auch im Menü. Gruppieren, gruppieren." },
    ]);
    expect(lookupHelp(german, "Gruppieren", "de").best?.entry.u).toBe("/anleitung/k.html#v");
  });

  it("summarises with the sentence that mentions the name", () => {
    const entry = entries[1];
    expect(helpSummary(entry, "Mirror")).toBe("Click “Mirror” and pick an axis. A copy needs Duplicate first.");
    const long = { c: "C", h: "H", u: "/u", t: `${"Intro sentence here. ".repeat(20)}The “Margin” is the clear distance to the edge. ${"Then more words follow. ".repeat(20)}` };
    const summary = helpSummary(long, "Margin");
    expect(summary.startsWith("The “Margin” is the clear distance")).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(270);
    expect(summary.endsWith("...")).toBe(true);
    // Without the name, the beginning.
    expect(helpSummary({ ...long, t: "Short text." }, "Nothing")).toBe("Short text.");
  });
});

describe("the index of a language", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("lives in the guide folder of the language", () => {
    expect(guideIndexUrl("en")).toBe("/guide/search-index.json");
    expect(guideIndexUrl("de")).toBe("/anleitung/search-index.json");
  });

  it("is fetched once, and a failure is not remembered", async () => {
    let calls = 0;
    const ok = (async () => { calls += 1; return { ok: true, json: async () => entries }; }) as unknown as typeof fetch;
    const first = await loadGuideIndex("nl", ok);
    const second = await loadGuideIndex("nl", ok);
    expect(first).toHaveLength(entries.length);
    expect(second).toBe(first);
    expect(calls).toBe(1);

    const broken = (async () => ({ ok: false, json: async () => null })) as unknown as typeof fetch;
    expect(await loadGuideIndex("fr", broken)).toBeNull();
    const fixed = (async () => ({ ok: true, json: async () => entries })) as unknown as typeof fetch;
    expect(await loadGuideIndex("fr", fixed)).toHaveLength(entries.length);
  });
});

describe("a tool window answers for what has no name of its own (#424)", () => {
  const window = (inner: string) =>
    page(`<aside data-help-panel="Chamfer edges" aria-label="Chamfer edges">${inner}<a class="guide-help-link" href="/guide/edges-and-hollowing.html#breaking-edges"></a></aside>`);

  it("asks about the window's title for Cancel, whatever the language says Cancel with", () => {
    window('<button id="c">Cancel</button><button id="d" aria-label="Bottom edges">B</button>');
    expect(resolveHelpTarget(document.getElementById("c"))?.name).toBe("Chamfer edges");
    // A button with a name of its own keeps it.
    expect(resolveHelpTarget(document.getElementById("d"))?.name).toBe("Bottom edges");
  });

  it("asks about the window's title for a field and a slider", () => {
    window('<label class="range-property"><span class="range-property-name">Distance</span><input id="f" type="text" /><input id="s" type="range" /></label>');
    expect(resolveHelpTarget(document.getElementById("f"))?.name).toBe("Chamfer edges");
    expect(resolveHelpTarget(document.getElementById("s"))?.name).toBe("Chamfer edges");
  });

  it("leaves a window with no title to the names of its parts", () => {
    page('<aside><button id="c">Cancel</button></aside>');
    expect(resolveHelpTarget(document.getElementById("c"))?.name).toBe("Cancel");
  });

  it("leads the question mark of a window to the part of the guide it points at", () => {
    window('<button>Cancel</button>');
    const target = resolveHelpTarget(document.querySelector("a.guide-help-link"));
    expect(target?.name).toBe("");
    expect(target?.guideHref).toBe("/guide/edges-and-hollowing.html#breaking-edges");
  });
});

describe("a part with a section of its own in the guide (#424)", () => {
  it("answers for everything in it with that section", () => {
    page('<div data-help-section-all="addShape"><button id="c">Cylinder</button><div id="blank">x</div></div>');
    const named = resolveHelpTarget(document.getElementById("c"));
    expect(named?.sectionOnly).toBe(true);
    expect(named?.guideHref).toContain("adding-a-shape");
    expect(resolveHelpTarget(document.getElementById("blank"))?.sectionOnly).toBe(true);
  });

  it("answers for its blank places only, when it is a container with named parts", () => {
    page('<div data-help-section="cameraBar" aria-label="Camera controls"><button id="home" aria-label="Home">h</button><span id="gap">.</span></div>');
    expect(resolveHelpTarget(document.getElementById("home"))?.name).toBe("Home");
    expect(resolveHelpTarget(document.getElementById("gap"))?.sectionOnly).toBe(true);
  });
});

describe("the cards of a shape's properties (#424)", () => {
  it("lead every part of the properties, taper and twist to the shape's settings, and the rotation to its own section", () => {
    page('<div data-help-section-all="shapeSettings"><label><span class="range-property-name">Length</span><input id="length" type="range"></label><button id="save">Save as default</button></div>'
      + '<div data-help-section-all="rotating"><button id="reset">Back to the default</button></div>');
    const length = resolveHelpTarget(document.getElementById("length"));
    expect(length?.sectionOnly).toBe(true);
    expect(length?.guideHref).toContain("the-shape-s-settings");
    expect(resolveHelpTarget(document.getElementById("save"))?.guideHref).toContain("the-shape-s-settings");
    expect(resolveHelpTarget(document.getElementById("reset"))?.guideHref).toContain("rotating-and-setting-the-pivot");
  });
});

describe("fields in a label that names them for the help (#424)", () => {
  it("names a field by the label's data-help, not by the label's words with their hint, value and options", () => {
    page('<label id="t" data-help="Fast mode"><span><span>Fast mode</span><small>For slower computers: turns off shadows, edge lines on all bodies and the camera inertia</small></span><input id="c" type="checkbox"></label><label data-help="Theme"><span>Theme</span><select id="s"><option>System</option><option>Light</option></select></label>');
    expect(helpNameOf(document.getElementById("c")!)).toBe("Fast mode");
    expect(helpNameOf(document.getElementById("s")!)).toBe("Theme");
    expect(resolveHelpTarget(document.getElementById("c"))?.name).toBe("Fast mode");
  });

  it("names every piece of a part by data-help-all, also those that bring a name of their own", () => {
    page('<div data-help-all="Window background"><div aria-label="Color" id="spectrum"></div><div aria-label="Hue" id="hue"></div></div>');
    expect(resolveHelpTarget(document.getElementById("spectrum"))?.name).toBe("Window background");
    expect(resolveHelpTarget(document.getElementById("hue"))?.name).toBe("Window background");
  });
});
