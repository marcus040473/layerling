// Vasen-Generator 2: the page's texts, German and English.

export const TEXTS = {
  de: {
    title: 'Vasen-Generator',
    presets: 'Vorlagen', random: 'Zufall', reset: 'Ansicht', copy: 'Einstellungen kopieren', paste: 'Einfügen', copied: 'Kopiert', pasteHint: 'Kopierte Einstellungen hier einfügen', apply: 'Übernehmen', cancel: 'Abbrechen', badSettings: 'Das sind keine Einstellungen des Vasen-Generators.',
    shape: 'Form', profile: 'Körperform', height: 'Höhe', diameter: 'Durchmesser', profileHint: 'Punkte ziehen. Klick auf die Linie setzt einen Punkt, Doppelklick löscht ihn.', corner: 'Ecke', removePoint: 'Punkt löschen',
    section: 'Querschnitt', sectionType: 'Umriss', sides: 'Ecken', round: 'Rundung', inner: 'Tiefe der Täler', waves: 'Wellen', amp: 'Wellenhöhe', waveStyle: 'Wellenform', m: 'Symmetrie', n1: 'Form 1', n2: 'Form 2', n3: 'Form 3', ratio: 'Schmale Seite',
    section2: 'Oben wird daraus', morph: 'Übergang von … bis', none: 'Nichts', twist: 'Drehung', twistAngle: 'Verdrehen', sway: 'Pendeln', swayCount: 'Schwünge',
    patterns: 'Muster', addPattern: 'Muster dazu', pattern: 'Muster', count: 'Anzahl rundum', countRings: 'Anzahl über die Höhe', depth: 'Tiefe', depthHint: 'unter 0 nach innen, über 0 nach außen', width: 'Breite', aspect: 'Streckung', patternProfile: 'Flanke', turn: 'Schraubt sich', cross: 'Gekreuzt', wave: 'Schwingt', waveCount: 'Schwünge', stagger: 'Versatz', flip: 'Spitzen nach oben', band: 'Höhenbereich', fade: 'Auslauf', seed: 'Zufallszahl', octaves: 'Feinheit', fit: 'Bild', fitTile: 'Kacheln', fitOnce: 'Einmal über den Bereich', invert: 'Umkehren', chooseImage: 'Bild wählen', text: 'Oder Text', textPlaceholder: 'Text als Relief', remove: 'Entfernen', noImage: 'Noch kein Bild: wähle eines oder tippe einen Text.',
    body: 'Körper', bodyKind: 'Bauart', solid: 'Voll (Vasenmodus im Slicer)', hollow: 'Hohl mit Wand', wall: 'Wand', bottom: 'Boden', bottomHint: '0 = unten offen', hole: 'Loch im Boden', style: 'Oberfläche', smooth: 'Glatt', lowpoly: 'Facetten', lowAround: 'Facetten rundum', lowRows: 'Facetten hoch', lowJitter: 'Unruhe', lowSeed: 'Zufallszahl',
    print: 'Druck', lineWidth: 'Linienbreite', layerHeight: 'Schichthöhe', material: 'Material', speed: 'Tempo', maxOverhang: 'Überhang bis', showOverhang: 'Überhänge zeigen', showLayers: 'Schichten zeigen', showCut: 'Aufschneiden', color: 'Farbe',
    export: 'Datei', quality: 'Feinheit', draft: 'Entwurf', standard: 'Standard', fine: 'Fein', saveStl: 'STL speichern', save3mf: '3MF speichern', saving: 'Baue die Datei …', saved: 'Gespeichert', declined: 'Nicht gespeichert', zipNote: 'In dieser Ansicht kommt die Datei in einem ZIP.', noSave: 'Speichern geht in dieser Ansicht nicht.',
    triangles: 'Dreiecke', built: 'gebaut in', weight: 'Gewicht', filament: 'Filament', time: 'Druckzeit', holds: 'Fasst', fileSize: 'STL', preview: 'Vorschau', tip: 'Kippt bei',
    noWebgl: 'Dieser Browser zeigt keine 3D-Ansicht (WebGL 2 fehlt). Die Dateien lassen sich trotzdem speichern.',
    notes: {
      overhang: 'Die Form wird bis {degrees}° steiler als {limit}° – dort braucht der Druck Stützen. {where}',
      overhangWhere: 'Betroffen: {ranges} mm Höhe.',
      patternOverhang: 'Das Muster hängt stellenweise bis {degrees}° über ({share} % der Wand). Flacher oder breiter druckt sauberer.',
      overlap: 'Vasenmodus: An der steilsten Stelle liegt eine Bahn nur noch zu {percent} % auf der darunter. Muster flacher machen oder dünnere Schichten drucken.',
      tippy: 'Schmaler Fuß: Die leere Vase kippt schon bei {degrees}° Neigung.',
      narrow: 'Die Vase ist an einer Stelle zu schmal für diese Wand.',
      thinWall: 'Wand nur {wall} mm – unter zwei Linien ({lines} mm) druckt sie sich unsicher.',
      thinBottom: 'Boden nur {bottom} mm – unter 0,8 mm wird er leicht undicht.',
      openBottom: 'Unten offen: Auf dem Druckbett steht nur der Wandring. Einen Rand (Brim) zum Haften nehmen.',
      noHole: 'Für das Loch ist der Boden zu klein.',
      tooFine: 'Muster {n}: {mm} mm ist feiner als die Linie ({line} mm) – das druckt der Drucker nicht mehr aus.',
      shallow: 'Muster {n}: {mm} mm Tiefe sieht man im Druck kaum.',
      reduced: 'Für diese Feinheit vereinfacht: ein Punkt alle {around} mm rundum und {up} mm hoch. „Fein“ zeigt mehr.',
      vaseMode: 'Im Slicer: Vasenmodus (Spirale), {bottomLayers} Bodenschichten, Linienbreite {line} mm.',
    },
    profiles: { bottle: 'Flasche', belly: 'Bauchig', amphora: 'Amphore', tulip: 'Tulpe', barrel: 'Fass', hourglass: 'Sanduhr', bowl: 'Schale', cone: 'Trichter', cylinder: 'Zylinder', custom: 'Gezeichnet' },
    sections: { circle: 'Kreis', polygon: 'Vieleck', star: 'Stern', wave: 'Welle', super: 'Superformel', ellipse: 'Oval' },
    waveStyles: { soft: 'Weich', sharp: 'Spitz', arches: 'Bögen', flutes: 'Kehlen' },
    patternNames: { ribs: 'Rillen', rings: 'Ringe', honeycomb: 'Waben', bumps: 'Noppen', voronoi: 'Voronoi', hammered: 'Gehämmert', scales: 'Schuppen', knit: 'Strick', weave: 'Geflecht', bricks: 'Ziegel', noise: 'Rauschen', image: 'Bild oder Text' },
    patternProfiles: { round: 'Rund', sharp: 'Spitz', flat: 'Flach', dome: 'Gewölbt' },
  },
  en: {
    title: 'Vase Generator',
    presets: 'Presets', random: 'Random', reset: 'View', copy: 'Copy settings', paste: 'Paste', copied: 'Copied', pasteHint: 'Paste copied settings here', apply: 'Apply', cancel: 'Cancel', badSettings: 'These are not settings of the vase generator.',
    shape: 'Shape', profile: 'Body form', height: 'Height', diameter: 'Diameter', profileHint: 'Drag the points. A click on the line adds a point, a double-click removes it.', corner: 'Corner', removePoint: 'Remove point',
    section: 'Cross-section', sectionType: 'Outline', sides: 'Corners', round: 'Rounding', inner: 'Depth of the valleys', waves: 'Waves', amp: 'Wave height', waveStyle: 'Wave form', m: 'Symmetry', n1: 'Form 1', n2: 'Form 2', n3: 'Form 3', ratio: 'Short side',
    section2: 'Turns into, at the top', morph: 'Transition from … to', none: 'Nothing', twist: 'Twist', twistAngle: 'Twist', sway: 'Sway', swayCount: 'Swings',
    patterns: 'Patterns', addPattern: 'Add a pattern', pattern: 'Pattern', count: 'Number round', countRings: 'Number over the height', depth: 'Depth', depthHint: 'below 0 inwards, above 0 outwards', width: 'Width', aspect: 'Stretch', patternProfile: 'Flank', turn: 'Spirals', cross: 'Crossed', wave: 'Swings', waveCount: 'Swings', stagger: 'Offset', flip: 'Tips upwards', band: 'Height band', fade: 'Run-out', seed: 'Random number', octaves: 'Fineness', fit: 'Picture', fitTile: 'Tiled', fitOnce: 'Once over the band', invert: 'Invert', chooseImage: 'Choose a picture', text: 'Or text', textPlaceholder: 'Text as a relief', remove: 'Remove', noImage: 'No picture yet: choose one or type a text.',
    body: 'Body', bodyKind: 'Build', solid: 'Solid (vase mode in the slicer)', hollow: 'Hollow with a wall', wall: 'Wall', bottom: 'Bottom', bottomHint: '0 = open at the bottom', hole: 'Hole in the bottom', style: 'Surface', smooth: 'Smooth', lowpoly: 'Facets', lowAround: 'Facets round', lowRows: 'Facets up', lowJitter: 'Unrest', lowSeed: 'Random number',
    print: 'Print', lineWidth: 'Line width', layerHeight: 'Layer height', material: 'Material', speed: 'Speed', maxOverhang: 'Overhang up to', showOverhang: 'Show overhangs', showLayers: 'Show layers', showCut: 'Cut open', color: 'Colour',
    export: 'File', quality: 'Fineness', draft: 'Draft', standard: 'Standard', fine: 'Fine', saveStl: 'Save STL', save3mf: 'Save 3MF', saving: 'Building the file …', saved: 'Saved', declined: 'Not saved', zipNote: 'In this view the file comes in a ZIP.', noSave: 'Saving does not work in this view.',
    triangles: 'Triangles', built: 'built in', weight: 'Weight', filament: 'Filament', time: 'Print time', holds: 'Holds', fileSize: 'STL', preview: 'Preview', tip: 'Tips over at',
    noWebgl: 'This browser shows no 3D view (WebGL 2 is missing). The files can still be saved.',
    notes: {
      overhang: 'The form gets up to {degrees}° steeper than {limit}° – the print needs supports there. {where}',
      overhangWhere: 'Affected: {ranges} mm of height.',
      patternOverhang: 'The pattern overhangs up to {degrees}° in places ({share} % of the wall). Shallower or wider prints cleaner.',
      overlap: 'Vase mode: at the steepest place a line lies on the one below with only {percent} % of its width. Make the pattern shallower or print thinner layers.',
      tippy: 'Narrow foot: the empty vase tips over at a tilt of {degrees}°.',
      narrow: 'The vase is too narrow for this wall in one place.',
      thinWall: 'Wall only {wall} mm – below two lines ({lines} mm) it prints unreliably.',
      thinBottom: 'Bottom only {bottom} mm – below 0.8 mm it leaks easily.',
      openBottom: 'Open at the bottom: only the ring of the wall stands on the bed. Use a brim.',
      noHole: 'The bottom is too small for the hole.',
      tooFine: 'Pattern {n}: {mm} mm is finer than the line ({line} mm) – the printer cannot print it.',
      shallow: 'Pattern {n}: a depth of {mm} mm hardly shows in the print.',
      reduced: 'Simplified for this fineness: a point every {around} mm round and {up} mm up. "Fine" shows more.',
      vaseMode: 'In the slicer: vase mode (spiral), {bottomLayers} bottom layers, line width {line} mm.',
    },
    profiles: { bottle: 'Bottle', belly: 'Bellied', amphora: 'Amphora', tulip: 'Tulip', barrel: 'Barrel', hourglass: 'Hourglass', bowl: 'Bowl', cone: 'Funnel', cylinder: 'Cylinder', custom: 'Drawn' },
    sections: { circle: 'Circle', polygon: 'Polygon', star: 'Star', wave: 'Wave', super: 'Superformula', ellipse: 'Oval' },
    waveStyles: { soft: 'Soft', sharp: 'Pointed', arches: 'Arches', flutes: 'Flutes' },
    patternNames: { ribs: 'Grooves', rings: 'Rings', honeycomb: 'Honeycomb', bumps: 'Bumps', voronoi: 'Voronoi', hammered: 'Hammered', scales: 'Scales', knit: 'Knit', weave: 'Weave', bricks: 'Bricks', noise: 'Noise', image: 'Picture or text' },
    patternProfiles: { round: 'Round', sharp: 'Pointed', flat: 'Flat', dome: 'Domed' },
  },
}

export function translator(language) {
  const table = TEXTS[language] ?? TEXTS.de
  const format = (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => (values?.[key] ?? ''))
  const t = (key, values) => format(table[key] ?? TEXTS.de[key] ?? key, values)
  t.table = table
  t.number = (value, digits = 1) => Number(value).toLocaleString(language === 'en' ? 'en-GB' : 'de-DE', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
  t.note = (note) => {
    const values = { ...note }
    for (const key of ['wall', 'lines', 'bottom', 'mm', 'line', 'around', 'up']) if (typeof values[key] === 'number') values[key] = t.number(values[key], 2)
    if (typeof values.share === 'number') values.share = t.number(values.share * 100, 0)
    if (typeof values.layer === 'number') values.n = values.layer + 1
    if (note.code === 'overhang') values.where = note.ranges?.length ? format(table.notes.overhangWhere, { ranges: note.ranges.map((r) => `${t.number(r.from, 0)}–${t.number(r.to, 0)}`).join(', ') }) : ''
    return format(table.notes[note.code] ?? note.code, values).trim()
  }
  return t
}
