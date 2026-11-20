**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Sketch: arrow keys and typed positions move only the selected points, as dragging the frame does (Issue #1800)“
Auf Deutsch: Skizze: Pfeiltasten und eingetippte Werte verschieben nur die gewählten Punkte, wie die Maus (Issue #1800)

Commit im Fork: `96cc54497` auf dem Zweig `ccr-2ebd5732-18byw4`

Zusammenfassung:
- Ein Auswahlrahmen wählt auch die Linien, die aus dem Rahmen herausführen. Die Maus verschob nur die Punkte, Pfeiltasten und Zahleneingabe nahmen auch die äußeren Enden dieser Linien mit.
- Jetzt verschieben alle drei dieselben Punkte, die Linien nach außen werden gedehnt.
Hinweis: Drei kleine Nebenänderungen stehen im englischen Text unter Notes, Stefan soll sagen, ob er sie so will.

Prüfungen: Typprüfung grün, Tests 6004, e2e 1650. Geprüft zusammen mit den anderen Korrekturen vom 20.11. auf einem Zweig auf Stefans Stand 1.166.0; die Testzahlen stammen von dort.
