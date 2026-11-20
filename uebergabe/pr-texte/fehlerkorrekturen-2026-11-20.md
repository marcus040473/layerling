# PR-Texte für die Fehlerkorrekturen vom 20.11.2026

Für Marcus. Jede Korrektur ist ein eigener Commit auf dem Zweig `ccr-2ebd5732-18byw4` in **marcus040473/layerling_msto**.
Der Zweig enthält außerdem die Übergabe-Dateien, er ist also **nicht** selbst als PR an Stefan gedacht.

So wird daraus ein PR an Stefan: einen neuen Zweig von Stefans `main` anlegen, den einen Commit darauf übernehmen
(`git cherry-pick <Commit>`), hochladen und den PR mit Titel und Text aus der Datei öffnen. Das kann ich für dich
vorbereiten, sobald du sagst, welche Korrekturen zu Stefan sollen. Den PR selbst öffnest du wie immer selbst.

Zu jeder Datei gibt es eine `-de.md` mit dem englischen Titel und einer deutschen Erklärung.

| Meldung | Commit | Worum es geht | Text |
|---|---|---|---|
| 1868 | `605f31216` | Deckel: Der Rand folgt einer Öffnung, die nach unten enger wird (Issue #1868) | `issue-1868-lid-leaning-walls.md` |
| 1899 | `56938273a` | Export: Ein in der Größe verändertes Namensschild behält seinen Text auf der Platte (Issue #1899) | `issue-1899-name-tag-resized-export.md` |
| 1781 | `d93bcfb65` | 3MF- und OBJ-Export: Kleine Teile einer Gruppe werden nicht mehr als Splitter weggelassen (Issue #1781) | `issue-1781-small-parts-3mf.md` |
| 1886 | `b9b251e5f` | Schnittmenge: Berühren sich zwei Teile zusätzlich an einer ebenen Fläche, bleibt keine hauchdünne Schicht mehr (Issue #1886) | `issue-1886-intersect-touching-face.md` |
| 1812 | `8d400435e` | Kantenwerkzeuge: Die Suche nach Innenecken hält ihre vier Sekunden ein (Issue #1812) | `issue-1812-inner-corner-budget.md` |
| 1875 | `c6db822b6` | Verschieben mit den Pfeiltasten und Rückgängig bauen nicht mehr alle mehrfarbigen Gruppen neu (Issue #1875) | `issue-1875-move-keeps-built-groups.md` |
| 1800 | `96cc54497` | Skizze: Pfeiltasten und eingetippte Werte verschieben nur die gewählten Punkte, wie die Maus (Issue #1800) | `issue-1800-sketch-move-selected-points.md` |
| 1790 | `82d1e93d0` | Kanten bearbeiten: Die Bohrung eines Rohrs schneidet nach Fase oder Rundung weiter durch die Gruppe (Issue #1790) | `issue-1790-tube-bore-edge-treatment.md` |
| 1805 | `c96abcc9e` | Maßband: „Ganze Kanten messen“ bleibt nach einer Skizze, wie es eingestellt war (Issue #1805) | `issue-1805-tape-whole-edges.md` |
| 1836 | `bf3925355` | Objektliste: Bei gesperrter Form wird kein Namensfeld mehr angeboten, das dann nichts tut (Issue #1836) | `issue-1836-shape-lock-rename.md` |
| 1874 | `550f4699c` | Geteilter Ordner: Das Vorschaubild wird auch auf dem anderen Rechner gefunden (Issue #1874) | `issue-1874-shared-thumbnail-sync.md` |
