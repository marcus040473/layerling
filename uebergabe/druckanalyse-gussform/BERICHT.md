# Bericht: Druckanalyse mit Schichtansicht, Gussform und Prägestempel (17.11.2026)

Grundlage: Zweig `marcus` (Stand c3b581b29, mit Stefans Stand 1.165.2). Gebaut auf `claude/upbeat-hypatia-9lluo2`.
Auftrag: die beiden Konstruktionsanweisungen, „einmal durchprogrammieren“, also ohne Zwischenstopps.

## Was gebaut wurde

### A. Druckanalyse („Layercheck“)
- **Analysekern** `apps/web/src/lib/layerCheck.ts`: schneidet die Teile mit Manifold in Schichten (Mitte jeder Schicht), vergleicht jede Schicht mit der darunter. Vorprüfungen: im Druckbett, schwebt, offenes Netz, größer als der Bauraum (aus dem gewählten Drucker). Je Schicht: ohne Auflage, Überhang (Winkel aus der Ausladung je Schicht gemessen), Brücke (auf zwei Seiten oder ringsum gehalten), dünne Wand (morphologisches Öffnen), kleine Insel, Haftfläche. Flächen unter 0,05 mm² werden nicht bewertet. Gleiche Befunde in Folgeschichten an derselben Stelle werden zu einem zusammengefasst; mehrere Stellen derselben Art auf einem Bereich einer Schicht (die zwei Arme eines T) ebenfalls.
- **Datenmodell Befund** `apps/web/src/lib/findings.ts`: Art, Stufe, Schicht von–bis, Höhe von–bis, Fläche, Messwert mit Einheit, Lage (Punkt, Kasten, Umriss je Schicht), Teil, Werkzeug-Verknüpfung. Die Gussform nutzt dasselbe Modell (Hinterschnitt, Lufteinschluss, Entformungsschräge).
- **Hintergrund:** Rechnet im Geometrie-Worker. Neu: Fortschrittsmeldungen aus dem Worker (kleine Ergänzung in `geometryWorker.ts`, `geometryWorkerTypes.ts`, `geometry.worker.ts`). Abbrechen beendet den Worker sofort.
- **Fenster** `LayerCheckPanel.tsx` (angedockt wie alle Werkzeuge im Zweig `marcus`): Einstellungen, Grenzwerte, Fortschritt, Zusammenfassung, Filter nach Art und Teil, Befundliste mit Abhilfe und Werkzeug-Knopf, „veraltet – neu prüfen“.
- **Schichtansicht** in der 3D-Ansicht `LayerViewOverlay.ts`: Schnitt auf Schichthöhe (nutzt die Ebene der Schnittansicht), gefüllter Querschnitt, eingefärbte Problemfläche, blasser Schatten der kommenden Schichten, Kamera-Sprung zum Befund, Kamera zurück beim Schließen. Regler senkrecht mit Markierungen, Diagramm der Querschnittsfläche, Tasten, Abspielen, drei Anzeigearten.
- **KI-Werkzeug** `layerling_check_layers` (MCP) mit Beschreibung in den drei SKILL.md und im KI-Kapitel der Anleitung.

### B. Gussform (Verbesserungen an „Gussform & Prägestempel“)
- Öffnungsrichtung X/Y/Z mit **Vorschlag** (kleinster Hinterschnitt, bei Gleichstand größere Trennfläche); Vergleichswerte auf den Knöpfen.
- **Hinterschnitt-Prüfung Fläche für Fläche** mit Sichtprüfung (Strahl in Öffnungsrichtung), Fläche und Anteil, rot in der Ansicht. Die automatische Trennhöhe sucht jetzt den kleinsten Hinterschnitt (schnell über Summen je Fläche).
- **Gießmaterial** (Silikon, Gießharz, Gips, Sonstiges) mit Bewertung, Schwindmaß und Dichte als Vorgabe.
- **Schwindmaß** (Hohlraum um den Schwerpunkt vergrößert), **Entformungsschräge** (Hinweis bei starrem Material).
- **Entlüftungen** einzeln schaltbar, **Lufteinschluss** als Befund mit Lage, **Einguss verschiebbar** (X/Y-Werte).
- **Konturnahe Schale** (45°-gestuft, druckbar ohne Stützen, mit Flansch), **Schraublöcher**, **Gummibandnuten**.
- **Ergebnis zusammengesetzt** zur Kontrolle; Kennzahlen: Außenmaß, Gießvolumen mit Einguss, Gießgewicht.
- **Live-Prüfung** im Fenster (im Hintergrund, kurz nach der letzten Änderung) mit Vorschau: Trennfläche, Einguss, Entlüftungen, Lufteinschlüsse, rote Hinterschnitte.
- **Nachbearbeitbar:** Jede Formhälfte speichert Urmodell und Einstellungen (`moldOf`). Formhälfte wählen → Werkzeug öffnet mit den Werten → „Gussform neu erzeugen“ ersetzt die Teile in einem Rückgängig-Schritt. Zuletzt benutzte Einstellungen werden gemerkt.

### C. Prägestempel & Matrize
- Neuer Modus **Relief prägen** (Stempel = Relief des Urmodells als Höhenfeld, Matrize = Relief um die Materialstärke vergrößert, gespiegelt).
- **Unsymmetrische Führungsstifte** (der vierte dünner): passt nur in einer Lage.
- Warnung bei **zu feinen Stellen** (schmaler als das doppelte Material).

## Tests
- `tests/e2e/layerCheck.e2e.ts` (14 Tests): Würfel ohne Befund; Kugel auf Pyramidenstumpf 4,2 mm abgesenkt → „im Druckbett“, keine Schicht unter 0; Kegel ohne Befund an der Spitze; T-Form → ein Befund „ohne Auflage“; Schräge 30/50/70° → nichts/Hinweis/Problem (gemessene Winkel ±3°); Brücke 5/30 mm → nichts/Hinweis; Wand 0,4 mm → Hinweis; Kugel-Oberseite keine dünne Wand; dünner Stift → kleine Insel; schwebendes Teil; zu groß für den Bauraum; Sortieren/Filtern/Weiterschalten; Abbruch; Leistung.
- `tests/e2e/moldDirections.e2e.ts` (12 Tests): Kugel 0 % in jeder Richtung, Volumen ±1 %; Kugel auf Pyramidensockel → Vorschlag nicht oben/unten; Pilzform (Garnrolle) längs geöffnet → Hinterschnitt, Vorschlag quer; zwei Hochpunkte → Einguss + Entlüftung, abgeschaltet → Lufteinschluss mit Lage; Würfel → Entformungsschräge nur bei starrem Material; Schwindmaß; Schale spart Material und schließt; Schrauben/Nuten; zusammengesetzt; kleines Teil mit dünner Wand; Relief-Stempel passt nur in einer Lage.
- `tests/e2e/moldTool.e2e.ts` (bestehend, 8 Tests) unverändert grün; im Hilfsaufruf steht jetzt `direction: "z"` und `shrinkage: 0`, weil diese Fälle für eine Form nach oben/unten geschrieben sind.
- **Messwert Leistung:** Kugel mit 99.912 Dreiecken, 250 Schichten bei 0,2 mm: **etwa 1 Sekunde** (im Test-Lauf, ohne Oberfläche). Im Editor läuft das im Worker; die Oberfläche bleibt bedienbar.

## Berührte Bestandsdateien (und warum)
- `LayerlingEditor.tsx`: Zustand und Verdrahtung der Druckanalyse, Live-Prüfung und „neu erzeugen“ der Gussform, MCP-Befehle.
- `WorkplaneViewport.tsx`: zwei neue Eigenschaften (`layerView`, `moldPreview`) und ihre Effekte; die Zeichnung selbst steckt in eigenen Modulen.
- `SecondaryToolbar.tsx`, `icons.tsx`: Knopf „Druckanalyse“.
- `moldTool.ts`, `MoldPanel.tsx`: die Gussform-Verbesserungen.
- `geometryWorker.ts`, `geometryWorkerTypes.ts`, `geometry.worker.ts`: Aufgaben `layerCheck` und `moldCheck`, Fortschrittsmeldung.
- `types/layerling.ts`, `lylProject.ts`, `editorMeshCore.ts`: Feld `moldOf` (Speichern, Prüfen beim Laden, kein Neuaufbau des Netzes).
- `messages.*.ts`: 160 neue Texte in allen 20 Sprachen (Deutsch und Englisch von Hand, die übrigen übersetzt und automatisch auf Platzhalter geprüft).
- `guideLinks.ts`, `commandKeywords.ts`, Anleitung Kapitel 6, 11 und 14, SKILL.md ×3, `layerling-mcp-tools.mjs`, `layerling-mcp-server.mjs`, `layerlingMcpProtocol.ts`.
- `globals.css` + erzeugtes `graphite-theme.css`.

## Bewusst weggelassen / abweichend
- **Gießlage bei seitlicher Öffnung:** Die Form wird immer mit der Öffnungsrichtung nach oben gegossen (die Form liegt dann auf der Seite). Der Einguss liegt in der „oberen“ (rechten bzw. hinteren) Hälfte, nicht halb und halb in der Trennfläche.
- **Freie Öffnungsrichtung** (Drehgriff/Winkel) und **Einguss/Entlüftungen mit der Maus ziehen**: nicht gebaut. Stattdessen Einguss per X/Y-Wert verschieben, Entlüftungen einzeln an/aus.
- **Zapfen bei zu wenig Platz:** Statt die Zapfen zu verkleinern, wird der Rand um den Hohlraum so breit gemacht, dass sie passen. Der Hohlraum wird nie angeschnitten.
- **Formkasten für Silikon:** Der vorhandene „Silikon-Gießrahmen“ blieb, wie er ist (keine Schräge der Kastenwände, keine Trennplatte).
- **Filamentbedarf der Form** nicht im Fenster (die Export-Schätzung gibt es weiter beim Export).
- **Gussform in derselben Befundliste wie die Druckanalyse:** gleiches Datenmodell, aber die Befunde der Gussform stehen im Gussform-Fenster.
- **Upstream-Fähigkeit:** Der Zweig baut auf `marcus` auf (angedockte Fenster). Für Stefan müsste das Fenster in seine Kartenform umgebaut werden. Neue Logik liegt in eigenen Modulen (`layerCheck.ts`, `findings.ts`, `LayerViewOverlay.ts`, `MoldPreviewOverlay.ts`, `findingText.ts`).
- Kein Eintrag in CHANGELOG oder „Was ist neu“ (das macht Stefan).

## Annahmen (bitte prüfen)
- Schwindmaß-Vorgaben: Silikon 0,1 %, Gießharz 0,5 %, Gips 0 %, Sonstiges 0 %.
- Dichte: Silikon 1,1, Gießharz 1,15, Gips 1,6 (Brei), Sonstiges 1,0 g/cm³.
- Silikon: Hinterschnitte unter 2 % der Oberfläche nur Hinweis. Bagatellgrenze 0,05 cm².
- „Flach“ (ohne Auflage/Brücke) ab 80° zur Senkrechten; Brücke, wenn mindestens 45 % des Randes oder zwei Seiten aufliegen.

## Offene Punkte
- Bei den Sprachen ohne eigene Begriffe (pt-br, tr) und bei pl/da („Błąd“, „Fejl“ für Problem) sollten Muttersprachler drüberschauen.
- Bilder für das eingebaute Handbuch (guide-scenes) gibt es noch nicht; die beschrifteten Schritt-Bilder liegen hier unter `bilder/` und in `ANLEITUNG.md`.

## Notiz für den Upstream (Stefan)
Eigenständig übernehmbar wären: der Analysekern (`layerCheck.ts`, `findings.ts` + Tests), die Worker-Fortschrittsmeldung, die Gussform-Logik in `moldTool.ts` (+ beide Testdateien) und `MoldPreviewOverlay.ts`. Das Druckanalyse-Fenster und die Gussform-Fenster-Erweiterung müssten für Stefans Kartenansicht angepasst werden.

## Prüfläufe (17.11.2026)
- `npm run typecheck`: grün.
- Unit-Tests: 641 Dateien, 6.041 Tests, alle grün.
- E2E-Tests: 1.607 von 1.611 grün. Die 4 roten (`surfaceMaskFoldPanel.e2e.ts` 3×, `surfaceTexturePanel.e2e.ts` 1×, Texture-Maske) sind auf `origin/marcus` ohne meine Änderungen genauso rot, also schon vorher kaputt.
