**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Tape measure: "Measure whole edges" stays as it was left after a sketch (Issue #1805)“
Auf Deutsch: Maßband: „Ganze Kanten messen“ bleibt nach einer Skizze, wie es eingestellt war (Issue #1805)

Commit im Fork: `69d3c2715` auf dem Zweig `fix-1805-tape-whole-edges`

Zusammenfassung:
- Der Schalter sprang nach einer Skizze (und nach Neuladen) von selbst wieder an.
- Jetzt merkt sich der Browser die Einstellung.
- Dass „Messung hinzufügen“ beim Schließen ausgeht, ist Absicht und bleibt.

Prüfungen: Typprüfung grün, Tests 6016. Der Zweig ist Stefans neuester Stand plus genau dieser eine Commit. Die ganze e2e-Reihe lief mit allen elf Korrekturen zusammen.
