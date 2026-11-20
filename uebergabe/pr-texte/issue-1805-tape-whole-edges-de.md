**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Tape measure: "Measure whole edges" stays as it was left after a sketch (Issue #1805)“
Auf Deutsch: Maßband: „Ganze Kanten messen“ bleibt nach einer Skizze, wie es eingestellt war (Issue #1805)

Commit im Fork: `c96abcc9e` auf dem Zweig `ccr-2ebd5732-18byw4`

Zusammenfassung:
- Der Schalter sprang nach einer Skizze (und nach Neuladen) von selbst wieder an.
- Jetzt merkt sich der Browser die Einstellung.
- Dass „Messung hinzufügen“ beim Schließen ausgeht, ist Absicht und bleibt.

Prüfungen: Typprüfung grün, Tests 6004, e2e 1650. Geprüft zusammen mit den anderen Korrekturen vom 20.11. auf einem Zweig auf Stefans Stand 1.166.0; die Testzahlen stammen von dort.
