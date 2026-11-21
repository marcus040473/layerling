# Vasentool: Analyse und neuer Kern

Stand: 19. November 2026. Gemessen an Layerling `main` 1.166.0 (Commit `33c6712c`), in Node 22 auf einem
Rechner. Die Verhältnisse zählen, die Millisekunden sind auf anderen Geräten andere.

## Kurzfassung

- **Der Vasenkern selbst ist nicht das Problem.** Eine glatte Vase baut er in 4 ms, Rillen in 33 ms.
- **Die Zeit geht bei den Oberflächenstrukturen verloren.** Ein Muster aus „Surface Texture“ auf einer Vase
  braucht 0,4 bis 12 Sekunden, in der Vorschau 0,4 bis 7 Sekunden. Das Werkzeug ist für beliebige Körper
  gebaut: Es unterteilt, schneidet, verschweißt und repariert ein fertiges Netz. Bei einer Vase ist das alles
  unnötig, weil ihre Wand ein regelmäßiges Raster ist.
- **Der neue Kern rechnet das Muster direkt auf dem Raster der Wand.** Vorschau in 4 bis 23 ms, fertige Vase
  in 5 bis 63 ms, „Fein“ in höchstens 160 ms. Das Netz ist geschlossen, ohne dass etwas repariert wird.
- **Was fehlt**, ist vor allem das, wonach die Community fragt: mehr Muster ohne Wartezeit, Muster in
  Höhenbereichen übereinander, Bild und Text im Vasentool, eine Druckprüfung beim Entwerfen und leichtere Dateien.
- **Nachtrag:** Gemessen ist oben Stefans Stand. Der Zweig `marcus` hat schon den Vasen-Designer mit eigenen
  Reliefmustern. Dort ist jetzt eingebaut: **eigenes Bild oder Text als Relief** und eine **Beschleunigung der
  Reliefmuster um rund 40 %** (siehe Abschnitt 5).
- Der neue Kern ersetzt den alten **nicht** vollständig. Deckel, Beine, Untersetzer, Einsätze, Durchbrüche und
  Lampenfassungen bleiben vorerst beim alten Kern (siehe „Was der neue Kern nicht kann“).

## 1. Wo heute die Zeit bleibt

### Oberflächenstrukturen auf der Vase

Glatte Flasche 90 × 180 mm, darauf ein Muster mit seinen Vorgaben (`bench/layerling-texture.perf.ts`):

| Muster | Vorschau | Fertig | Dreiecke fertig |
|---|---:|---:|---:|
| Rillen | 1,1 s | 0,8 s | 54.000 |
| Rändel | 3,5 s | 3,1 s | 342.000 |
| Waben | 7,3 s | 9,7 s | 1.089.000 |
| Noppen | 5,3 s | 8,7 s | 482.000 |
| Zellen | 2,7 s | 3,6 s | 423.000 |
| Ziegel | 1,9 s | 1,9 s | 185.000 |
| Strick | 0,7 s | 2,4 s | 478.000 |
| Seil | 0,7 s | 2,4 s | 569.000 |
| Geflecht | 2,5 s | 4,7 s | 382.000 |
| Rinde | 3,7 s | 12,1 s | 505.000 |
| Holz | 1,8 s | 4,9 s | 556.000 |
| Carbon | 3,4 s | 5,9 s | 258.000 |
| Körnung | 0,4 s | 1,2 s | 414.000 |
| Steine | 2,4 s | 4,7 s | 464.000 |
| Risse | 1,1 s | 2,1 s | 179.000 |

Wohin die Zeit geht (Profil eines Laufs):

- **Waben, 10,8 s:** flache Punkte zusammenlegen 20 %, Speicher aufräumen 12 %, Zellen schneiden 23 %,
  kurze Kanten entfernen 8 %. Das Muster selbst auszurechnen ist der kleinste Teil.
- **Strick, 3,5 s:** flache Punkte zusammenlegen 18 %, Speicher aufräumen 13 %, Normalen und Knicke 8 %,
  kurze Kanten entfernen 7 %.
- **Rinde, 13,3 s:** hier ist es das Muster: Zellen- und Rauschfunktion zusammen rund 50 %.

Zwei Folgen kommen dazu:

- Waben überschreiten das eigene Limit: 1,09 Mio. Dreiecke fertig bei einem Budget von 600.000, und 821.000 in
  der Vorschau bei einem Budget von 200.000.
- Der Körper mit Muster wird als Netz im Entwurf und in jedem Rückgängig-Schritt gehalten. Jede Änderung an
  der Vase danach heißt: Muster neu rechnen, also wieder Sekunden.

### Der Vasenkern

| Vase | Zeit | Dreiecke |
|---|---:|---:|
| Glatte Flasche | 4 ms | 21.000 |
| Rillen, 48 | 33 ms | 174.000 |
| Rillen fein, 180° gedreht | 240 ms | 1.109.000 |
| Voronoi | 150–210 ms | 298.000 |
| Voronoi fein | 470 ms | 674.000 |
| Voronoi fein, 300 × 400 mm | 3,7 s | 4.971.000 |

Was dabei auffällt:

1. **Feste Reihen von 1 mm.** Rillen laufen senkrecht und brauchen keine dichten Reihen. Der Kern legt sie
   trotzdem an: 174.000 Dreiecke, wo 49.000 dieselbe Form geben.
2. **Die Spalten stehen fest, das Muster dreht sich darüber hinweg.** Bei gedrehten Vasen läuft jede Rille
   schräg durch das Raster. Deshalb die vielen Spalten und Reihen, und deshalb zerfielen gedrehte Rillen in
   kurze Striche ([Discussion 1648](https://github.com/henmedia/layerling/discussions/1648)).
3. **Kein Budget für die Gesamtgröße.** Es gibt nur 2.400 Spalten und 1.200 Reihen als Grenze. Eine große
   Vase mit Voronoi kommt so auf fast 5 Mio. Dreiecke und 3,7 s.
4. **Rechnen pro Punkt, was pro Reihe genügt.** Drehung, Höhenbereich und Übergang hängen nur von der Höhe ab,
   werden aber für jeden Punkt neu gerechnet, die Drehung sogar zweimal.
5. **Mehrfache Kopien.** Der Kern sammelt Punkte in gewöhnlichen Listen und wandelt sie am Ende in drei
   Felder um. `fittedVaseMesh` kopiert Punkte und Dreiecke noch einmal, `createVaseGeometry` ein drittes Mal,
   und die Schattierung bildet für jeden Punkt einen Text als Schlüssel.

## 2. Was es im Netz gibt und wonach gefragt wird

**Reddit fehlt.** Von hier ist Reddit doppelt gesperrt: Das Abruf-Werkzeug liest `reddit.com` nicht, und die
Websuche darf Reddit nicht durchsuchen. MakerWorld und Printables lehnen den Abruf selbst ab. Die Belege kommen
aus dem Bambu-Lab-Forum, dem Prusa- und UltiMaker-Forum, Hacker News, GitHub (auch die Wunschlisten der Slicer)
und Layerlings eigenen Discussions. Deutsche Foren-Beiträge zum Thema hat die Suche nicht gefunden.

Andere Generatoren: Make My Vase (Bambu), VaseMaker, PrintPal, VesselMaker, 3Dsynth, BumpMesh (CNC Kitchen).
Layerlings Vase hat mehr Zubehör als alle davon. Die Lücken liegen woanders:

| Wunsch | Beleg | Im neuen Kern |
|---|---|---|
| Echte Muster ohne Blender, mehr als Fuzzy Skin | VesselMaker entstand genau deshalb ([Bambu-Forum](https://forum.bambulab.com/t/building-vesselmaker-an-advanced-vase-planter-generator-feedback-welcome/257019)) | 12 Muster, in Millisekunden |
| Bestimmen, wo ein Muster sitzt; mehrere übereinander | BumpMesh Issues, Layerling 1038, 1105, 1579 | bis 6 Lagen, jede mit Höhenbereich und Auslauf |
| Leichtere Netze, schnellere Antwort | CNC Kitchen: Unterteilung „makes the file huge and slicing slow“ ([Blog](https://www.cnckitchen.com/blog/stop-using-fuzzy-skin-i-made-something-better)); Layerling [1153](https://github.com/henmedia/layerling/discussions/1153), [954](https://github.com/henmedia/layerling/discussions/954) | Budget je Feinheit, glatte Flächen vereinfacht, 3MF |
| Beim Entwerfen sehen, ob es druckbar ist | Wunsch nach Winkelmessung in Make My Vase ([Bambu-Forum](https://forum.bambulab.com/t/feature-request-make-my-vase-angle-measurement/49247)) | Überhänge rot in der Ansicht, Hinweise mit Höhenangabe |
| Schärfere Bilder als Muster | Layerling [1347](https://github.com/henmedia/layerling/discussions/1347) (offen), [Issue 1462](https://github.com/henmedia/layerling/issues/1462) | Bild bis 1024 Punkte (die Seite verkleinert auf 512), zwischen den Punkten gemittelt |
| Ein Boden, der wirklich da ist | Make My Vase druckt ohne Boden ([Bambu-Forum](https://forum.bambulab.com/t/make-my-vase-no-solid-location-section/49398)) | geschlossener Körper, Slicer-Werte neben dem Export |
| Verständlicher Profil-Editor | Layerling [1252](https://github.com/henmedia/layerling/discussions/1252), [1278](https://github.com/henmedia/layerling/discussions/1278) | Punkte ziehen, Klick setzt, Doppelklick löscht |
| Mehr Querschnitte | VaseMaker hat 28, darunter die Superformel | Kreis, Vieleck, Stern, Welle, Superformel, Oval |
| Vorlagen, Zufall, Teilen | bei den neueren Werkzeugen vorhanden; ausdrückliche Nachfrage nicht gefunden | 13 Vorlagen, Zufall, Einstellungen kopieren |

Stefans Bedingung aus Issue 1462 gilt weiter: Es muss „stay quick on big faces“.

### Zweite Runde: weitere Plattformen

**Weitere Generatoren, die es schon gibt**

- [Vaseverse](https://vaseverse.org/): kostenlos, ohne Konto. Grundformen auch Herz, Blume und Tropfen, Muster
  aus einem Foto, Öffnungen in der Wand, passender Untersetzer, Schnittansicht, Ansicht „Überhänge über 45°“,
  Teilen per Link oder QR-Code.
- [Vase Lampshade Studio](https://digitalchiselco.com/lamp-studio): 105 Lampenschirme, Foto als Lithophanie,
  Text, Fassung E27/E14 in einem Stück im Vasenmodus. Kostenpflichtig, nur Windows.
- [the3dai](https://the3dai.com/lamp-shade-generator): Lampenschirm im Browser, nennt die nötigen Bodenschichten
  für den Fassungsring.
- [3d-lithophane.com](https://www.3d-lithophane.com/): Pflanztopf-Generator mit Hängen, Selbstbewässerung,
  Deckel und Griffen.
- [MyLaserTools](https://www.mylasertools.com/3d-vase-generator): Text um die Vase, STL und 3MF.

**Was Nutzer dort fordern**

| Forderung | Wo | Was das für den Generator heißt |
|---|---|---|
| Vasenmodus erst ab einer Höhe, unten normal drucken | [BambuStudio 9657](https://github.com/bambulab/BambuStudio/issues/9657), [Hacker News](https://news.ycombinator.com/item?id=46010173) | Sache des Slicers. Der Generator kann nur sagen, wie viele Bodenschichten nötig sind (macht er). |
| Zwei oder mehr Bahnen im Vasenmodus für dickere Wände | [BambuStudio 5720](https://github.com/bambulab/BambuStudio/issues/5720), [Bambu-Forum](https://forum.bambulab.com/t/how-to-improve-wall-thickness-in-spiral-vase-mode/5039) | Sache des Slicers. Als Ausweg gibt es „Hohl mit Wand“ und die Empfehlung einer breiteren Linie. |
| Farbwechsel im Vasenmodus | [OrcaSlicer 891](https://github.com/OrcaSlicer/OrcaSlicer/issues/891) | Sache des Slicers. |
| Der Boden lässt sich nicht dicker machen, der Boden leckt | [Bambu-Forum, deutsch](https://forum.bambulab.com/t/boden-wandstarke-der-vase/142165), [Prusa-Forum](https://forum.prusa3d.com/forum/prusaslicer/prusaslicer-vase-mode-leaves-gap-between-base-layers-and-spiral-area/), [Bambu-Forum](https://forum.bambulab.com/t/waterproofing-pla-vases/99683) | Bodendicke ist einstellbar und steht im Slicer-Hinweis. Offen: eine Rundung zwischen Boden und Wand, die im Prusa-Forum das Leck schloss. |
| Eine Wand ist zu schwach; Muster machen sie steifer | Hacker News: „to have some kind of texture on the surfaces is absolutely needed for strength“ | Muster sind da. Offen: ein Hinweis, welches Muster wie viel aussteift. |
| Muster als eigenes Teil oder eigene Farbe | [BumpMesh 105](https://github.com/CNCKitchen/stlTexturizer/issues/105) | Fehlt im neuen Kern. Layerling kann es seit 1.146.1. |
| Ein einzelnes Motiv statt Kacheln (Logo, Schild) | BumpMesh hat dafür in 1.5.0 den „Stamp mode“ ergänzt | Geht: „Bild oder Text“ mit „Einmal über den Bereich“. |
| Kein Umweg über Export und Import, direkt im Slicer | [OrcaSlicer 14722](https://github.com/OrcaSlicer/OrcaSlicer/issues/14722) | Spricht dafür, den Kern in Layerling einzubauen statt als eigene Seite. |
| Was kostet es? | [Bambu-Forum zu VesselMaker](https://forum.bambulab.com/t/building-vesselmaker-an-advanced-vase-planter-generator-feedback-welcome/257019): Muster nur gegen Bezahlung | Layerling ist frei. Das ist hier ein Vorteil. |

**Was daraus folgt**

- Eingebaut nach dieser Runde: **Aufschneiden** (unter „Druck“), um in die Wand und auf den Boden zu sehen.
- Naheliegend als Nächstes: Lithophanie-Leuchte (Foto als Wandstärke; die Bausteine sind da, geprüft ist es
  nicht), Rundung zwischen Boden und Wand, Muster als eigenes Teil für eine zweite Farbe.
- Die meisten Forderungen an den Vasenmodus richten sich an die Slicer. Ein Generator kann sie nicht erfüllen,
  nur die passenden Einstellungen nennen.

## 3. Der neue Kern

Acht Entscheidungen, die zusammen den Unterschied machen:

1. **Das Muster ist eine Höhe über der abgewickelten Wand.** Sie wird direkt an den Punkten des Rasters
   ausgerechnet. Unterteilen, Schneiden, Verschweißen und Reparieren entfallen.
2. **Die Spalten drehen sich mit der Vase.** Ein gedrehtes Sechseck behält seine Ecken auf Spalten, eine
   gedrehte Rille bleibt eine saubere Linie. Das Problem aus Discussion 1648 kann so nicht entstehen.
3. **Die Spalten liegen gleichmäßig entlang des Umrisses**, nicht gleichmäßig nach Winkel. Die Flanken eines
   Sterns bekommen so viele Punkte wie seine Spitzen, und die Zellen eines Musters bleiben gleich breit.
4. **Zellen behalten ihre Form.** Am Hals werden Waben kleiner, aber nicht gequetscht.
5. **Reihen nur dort, wo sie etwas zeigen.** Der Abstand richtet sich nach Krümmung, Drehung und dem feinsten
   Muster an dieser Höhe, und nie feiner als eine halbe Schicht.
6. **Ein Budget je Feinheit:** 160.000, 700.000 oder 2,5 Mio. Dreiecke. Wird es zu fein, werden Spalten und
   Reihen gemeinsam gröber, und ein Hinweis sagt es.
7. **Glatte Flächen kosten wenig.** Die Flächen zwischen Fugen werden zu größeren Dreiecken zusammengefasst.
   Bei Ziegeln und Voronoi halbiert das die Datei.
8. **Alles in festen Zahlenfeldern, einmal geschrieben.** Vorschau auf der Seite, fertige Vase und Dateien im
   Hintergrund; die Felder werden übergeben, nicht kopiert.

### Dieselbe Vase, alter und neuer Kern

`bench/compare.mjs` übersetzt die Einstellungen mit `from-layerling.mjs` und baut beide:

| Vase | Alt | Neu | Faktor |
|---|---:|---:|---:|
| Glatte Flasche | 4 ms · 21.000 | 3 ms · 17.000 | 1,4 |
| Rillen, 48 | 33 ms · 174.000 | 8 ms · 49.000 | 4 |
| Rillen fein, 180° gedreht | 249 ms · 1.109.000 | 17 ms · 279.000 | 15 |
| Gekreuzte Streifen | 20 ms · 116.000 | 5 ms · 77.000 | 4 |
| Voronoi | 154 ms · 298.000 | 100 ms · 404.000 | 1,5 |
| Voronoi fein | 467 ms · 674.000 | 314 ms · 1.127.000 | 1,5 |
| Sechseck wird Welle, gedreht | 39 ms · 70.000 | 4 ms · 21.000 | 10 |
| Hohl, Rillen | 41 ms · 218.000 | 11 ms · 97.000 | 4 |
| Facetten | 0,4 ms · 528 | 0,5 ms · 528 | 1 |
| Voronoi fein, 300 × 400 mm | 3.755 ms · 4.971.000 | 364 ms · 1.744.000 | 10 |

**Bei Voronoi ist der alte Kern beim Netz besser.** Er schneidet die Fugen entlang ihrer Linien und kommt mit
weniger Dreiecken aus. Der neue ist hier nur 1,5-mal schneller und das Netz ein Drittel größer. Das
Fugenschneiden des alten Kerns ließe sich auf das neue Raster setzen.

### Die Muster des neuen Kerns

Flasche 90 × 180 mm (`bench/patterns.mjs`):

| Muster | Vorschau | Standard | Fein |
|---|---:|---:|---:|
| Rillen | 4 ms | 8 ms · 38.000 | 7 ms · 91.000 |
| Ringe | 5 ms | 5 ms · 71.000 | 16 ms · 180.000 |
| Waben | 13 ms | 55 ms · 456.000 | 159 ms · 1.263.000 |
| Noppen | 8 ms | 14 ms · 177.000 | 36 ms · 434.000 |
| Voronoi | 23 ms | 63 ms · 304.000 | 151 ms · 688.000 |
| Gehämmert | 5 ms | 11 ms · 71.000 | 25 ms · 163.000 |
| Schuppen | 6 ms | 14 ms · 169.000 | 31 ms · 383.000 |
| Strick | 20 ms | 46 ms · 348.000 | 115 ms · 883.000 |
| Geflecht | 6 ms | 12 ms · 176.000 | 32 ms · 407.000 |
| Ziegel | 9 ms | 38 ms · 325.000 | 128 ms · 758.000 |
| Rauschen | 17 ms | 48 ms · 286.000 | 126 ms · 677.000 |
| Bild oder Text | 12 ms | 41 ms · 377.000 | 160 ms · 900.000 |

Gegen „Surface Texture“ auf derselben Vase: Waben 9,7 s gegen 55 ms, Strick 2,4 s gegen 46 ms, Geflecht 4,7 s
gegen 12 ms, Ziegel 1,9 s gegen 38 ms. Das ist dieselbe Aufgabe, nicht dasselbe Ergebnis: Die Muster sind neu
geschrieben und sehen im Detail anders aus als die von „Surface Texture“.

### Was der Generator sonst mitbringt

- Körperform aus 9 Vorgaben oder gezeichnet, Querschnitt mit Übergang in einen zweiten, Drehung und Pendeln.
- Voll für den Vasenmodus oder hohl mit Wand, Boden und Loch; ohne Boden als Lampenschirm oder Rohr.
- Gewicht, Filament, Druckzeit, Inhalt in Millilitern und Kippwinkel.
- Druck-Hinweise: Form zu steil (mit Höhenangabe), Muster hängt über, Bahnen überlappen im Vasenmodus zu
  wenig, Muster feiner als die Linie, Wand oder Boden zu dünn, Fuß zu schmal.
- STL und 3MF. Eine Waben-Vase mit Text aus dem Test: 17,2 MB als STL, 3,0 MB als 3MF.

## 4. Was der neue Kern nicht kann

Das hat heute nur der alte Kern:

- Zubehör: Beine, Ständer, Untersetzer, Einsätze, Deckel (auch Schraub- und Teekannendeckel).
- Durchbrüche in der Wand, Lampenfassungen, Verstärkungsrippen und Doppelwand, Gummifüße, mehrere Ablauflöcher.
- Gezeichneter Querschnitt, Drehung als Kurve, Drehung entlang der Kontur, Wellenform „Lamellen“.
- Das exakte Fugenschneiden bei Voronoi.

`from-layerling.mjs` nennt für jede Vase, was es nicht übernehmen konnte (`unsupported`). Ist die Liste leer,
kann der neue Kern die Vase bauen.

Die Muster von „Surface Texture“, die es im neuen Kern noch nicht gibt: Rändel als eigenes Muster (geht als
gekreuzte Rillen), Seil, Rinde, Holz, Carbon, Fachwerk, Steine, Quadrate, Dreiecke, Risse.

## 5. Was in Layerling eingebaut ist

Eingebaut ist in den **Vasen-Designer** (Zweig `marcus`, hier zusammen mit Stefans 1.166.0). Der Vasen-Designer
hat eigene Reliefmuster (`lib/vase/vase-patterns.mjs`), die anders arbeiten als der Generator in diesem Ordner:
Sie lesen Höhenbilder, die sich nahtlos wiederholen, und halten jede Unterkante auf 45°. Deshalb ist der neue
Kern **nicht** hineinkopiert, sondern der vorhandene erweitert und beschleunigt.

### Eigenes Bild oder Text als Relief

Neue Kachel „Bild oder Text“ am Ende der Muster-Galerie:

- **Bild laden** (PNG, JPG, SVG …) oder **Text tippen** (bis 60 Zeichen). Helle Stellen stehen vor, dunkle
  liegen tiefer. „Umkehren“ unter „Erweitert“ dreht das um (Gravur statt Relief).
- **Anordnung:** überall, als ein Band rundum oder einmal. Einmal und Band sitzen in der Mitte des
  Höhenbereichs; das einzelne Motiv zeigt nach vorn.
- **Größe** über „Anzahl rundum“: 4 heißt ein Viertel des Umfangs.
- Das Bild liegt in den Einstellungen der Vase (höchstens 512 Punkte Kantenlänge), in derselben Form wie das
  eigene Bild der Oberflächenstruktur. Es wird mit dem Entwurf gespeichert.
- Zwischenspeicher und Vergleiche nennen das Bild mit einem kurzen Namen statt mit allen Grauwerten. Sonst
  wäre bei jedem Reglerzug ein Drittel Megabyte Text verglichen worden.
- Der Assistent (MCP) kann Text und Bild setzen; die Szene meldet ein Bild nur mit seiner Größe.

Gemessen (Flasche 180 × 90 mm, Bild 512 × 384): „Standard“ 250 ms, einmal 160 ms, „Entwurf“ 70 ms, „Fein“
900 ms. Der erste Bau mit einem neuen Bild braucht einmalig etwa 350 ms mehr (das Bild wird weichgezeichnet).

### Reliefmuster schneller

Dieselben Vasen, Punkt für Punkt gleich (27 Fälle über Prüfsummen der Netze verglichen), nur schneller:

| Muster | vorher | jetzt |
| --- | ---: | ---: |
| Blütenblätter | 389 ms | 245 ms |
| Rautenwellen | 565 ms | 270 ms |
| Tulpenblätter | 221 ms | 139 ms |
| Fließende Blätter | 404 ms | 208 ms |
| Schwungrippen | 726 ms | 585 ms |
| Zellnetz | 334 ms | 192 ms |
| Sechseck-Kacheln | 393 ms | 240 ms |
| Rautengeflecht | 405 ms | 215 ms |
| Wellen | 381 ms | 219 ms |
| Schuppen | 356 ms | 207 ms |
| Kiesel | 361 ms | 192 ms |
| Blattadern | 385 ms | 212 ms |
| Blätter | 246 ms | 127 ms |

Woher der Gewinn kommt:

- Das Höhenbild wurde für jeden Punkt der Wand mit zwei neuen Listen und zwei neuen Hilfsfunktionen gelesen.
  Jetzt ist die Rechnung ausgeschrieben, in derselben Reihenfolge.
- Was nur von der Höhe abhängt (Radius, Drehung, Höhenbereich, Zellenhöhe), wurde für jeden Punkt einer Reihe
  neu gerechnet. Jetzt einmal pro Reihe.
- Der Abstand jeder Ecke zur Achse wurde viermal gerechnet, jetzt einmal.

Schwungrippen gewinnen am wenigsten: Sie werden gerechnet, nicht aus einem Bild gelesen. Dort und beim zweiten
Durchlauf für die Diagonalen der Vierecke liegt die nächste Möglichkeit.

### Pflanztopf: Untersetzer, Innentopf, Wandhalter

Der Pflanztopf hat auf dem Reiter Form vier eigene Blöcke: Wasserablauf, Untersetzer, Innentopf, Wandhalter.

- **Wasserablauf:** Die Ablauflöcher sind ein Schalter, dazu Anzahl und Durchmesser.
- **Untersetzer als Schale:** als Teller (gerade Wand) oder anschmiegend. Die anschmiegende Wand folgt dem Umriss des
  Topfs im eingestellten Abstand. Sie ist auf jeder Höhe so weit wie die breiteste Stelle des Topfs darunter, damit
  sich der Topf herausheben lässt, und neigt sich höchstens 45° nach außen. „Schräger Rand“ hebt den Rand auf einer
  Seite an: eine schräge Schale, die den Topf halb umfasst.
- **Angedockte Schale:** sitzt bündig unter dem Topf und führt seinen Bodenumriss nach unten weiter. Ihre Wand ist ein
  Bogen, oben senkrecht, unten 45°. Drei Säulen tragen den Topf 1,2 mm über dem Schalenrand (Schattenfuge, das Wasser
  kann abtrocknen). Auf den Säulen sitzen Zapfen oder Taschen für Magnete; der Topfboden bekommt die passenden Mulden
  und wird dafür dicker.
- **Innentopf:** der vorhandene Pflanzeinsatz und die Selbstbewässerung, jetzt im Pflanztopf-Bereich.
- **Wandhalter:** Der Topf bekommt hinten eine 7 mm tiefe Fläche und darauf eine angeformte Schwalbenschwanz-Schiene.
  Ihr unteres Ende ist ein Keil von 45°. Der Halter ist ein eigenes Teil: Platte, zwei Leisten, eine Rampe und
  Senklöcher im Taschenboden. Der Topf wird von oben eingeschoben und verdeckt die Schrauben. Unter der Schiene bleibt
  die Wand glatt, auch mit Muster. Die Schiene sitzt dort, wo der Rücken des Topfs der Wand am nächsten liegt.

Die Prüfung meldet, was nicht zusammenpasst: loser Untersetzer an der Wand, angedockte Schale ohne Magnete an der
Wand, Ablauflöcher ohne Schale an der Wand, Schale mit hohlem Fuß oder Beinen.

## 6. Weg nach Layerling für den neuen Kern

In dieser Reihenfolge, jeder Schritt für sich nutzbar:

1. **Neue Muster als Wahl der Vase.** `patterns.mjs` und `engine.mjs` nach `lib/vase/` legen. `vaseBody.ts`
   fragt `fromLayerling`; ist `unsupported` leer, baut der neue Kern, sonst der alte. Die Vase bekommt die Lagen
   als neue Einstellung `layers`. Am Rest des Editors ändert sich nichts, das Netz hat dieselbe Gestalt
   (`vertices`, `indices`).
2. **Die drei Kopien sparen.** `fittedVaseMesh` und `createVaseGeometry` nehmen die Felder des Kerns direkt und
   seine Normalen dazu. Die Schattierung mit Knick-Erkennung entfällt für die Vase.
3. **Vorschau beim Ziehen.** Während ein Regler bewegt wird, mit `quality: 'draft'` bauen, danach in der
   gewählten Feinheit.
4. **Zubehör umziehen.** Deckel, Beine und Einsätze bauen auf der Wand ohne Muster auf. Dafür gibt es
   `vaseSampler`, das dem alten `outerAt` entspricht.
5. **Fugenschneiden für Voronoi** auf das neue Raster setzen.

Vor einem PR an Stefan steht seine Zustimmung zur Richtung. Das ist ein großer Umbau an einem Teil, den er
gerade erst übernommen hat.

## 7. Was nicht geprüft ist

- **Kein Probedruck.** Die Druck-Hinweise sind gerechnet, nicht am Drucker bestätigt. Die Grenze von 45° und
  die Überlappung der Bahnen sind übliche Faustwerte.
- **Kein Slicer.** Die Dateien sind als geschlossene Körper geprüft (jede Kante genau zweimal, STL und 3MF),
  aber nicht in Bambu Studio, OrcaSlicer oder PrusaSlicer geladen.
- **Gemessen in Node** und in einem Browser ohne Grafikkarte. Auf einem Handy sind die Zeiten länger; die
  Verhältnisse sollten bleiben.
- **Die Seite ist nur in Chromium geprüft**, am Bildschirm und in Handybreite, hell und dunkel.
- Druckzeit und Gewicht sind Schätzungen aus Wandfläche, Linienbreite und Tempo.
- **Bild und Text im Vasen-Designer** sind im Editor in Chromium ausprobiert (Bild laden, Text, alle drei
  Anordnungen) und mit Tests abgedeckt, aber nicht gedruckt. Ein Text wird mit der Schrift des Systems
  gezeichnet; er sieht deshalb nicht auf jedem Rechner gleich aus.
- **Die Übersetzungen** der neuen Texte (18 Sprachen, Anleitung in 16) sind maschinell und nicht von
  Muttersprachlern gelesen.
