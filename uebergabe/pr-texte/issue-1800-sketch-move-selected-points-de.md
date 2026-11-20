**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Sketch: arrow keys and typed positions move only the selected points, as dragging the frame does (Issue #1800)“
Auf Deutsch: Skizze: Pfeiltasten und eingetippte Werte verschieben nur die gewählten Punkte, wie die Maus (Issue #1800)

Commit im Fork: `e87c88ee5` auf dem Zweig `fix-1800-sketch-move-selected-points`

Zusammenfassung:
- Ein Auswahlrahmen wählt auch die Linien, die aus dem Rahmen herausführen. Die Maus verschob nur die Punkte, Pfeiltasten und Zahleneingabe nahmen auch die äußeren Enden dieser Linien mit.
- Jetzt verschieben alle drei dieselben Punkte, die Linien nach außen werden gedehnt.
Hinweis: Drei kleine Nebenänderungen stehen im englischen Text unter Notes, Stefan soll sagen, ob er sie so will.

Prüfungen: Typprüfung grün, Tests 6015. Der Zweig ist Stefans neuester Stand plus genau dieser eine Commit. Die ganze e2e-Reihe lief mit allen elf Korrekturen zusammen.
