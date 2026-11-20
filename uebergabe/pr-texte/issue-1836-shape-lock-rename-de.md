**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Object list: a part of locked shape no longer offers a name field it then refuses (Issue #1836)“
Auf Deutsch: Objektliste: Bei gesperrter Form wird kein Namensfeld mehr angeboten, das dann nichts tut (Issue #1836)

Commit im Fork: `876f19d0f` auf dem Zweig `fix-1836-shape-lock-rename`

Zusammenfassung:
- „Form sperren“ hält laut Handbuch auch den Namen fest. Die Liste bot trotzdem ein Namensfeld an und verwarf die Eingabe.
- Jetzt bietet sie bei solchen Teilen keins mehr an.
Hinweis: Der Melder wollte eigentlich umbenennen können. Das wäre eine größere Änderung, die Stefan entscheiden soll.

Prüfungen: Typprüfung grün, Tests 6015. Der Zweig ist Stefans neuester Stand plus genau dieser eine Commit. Die ganze e2e-Reihe lief mit allen elf Korrekturen zusammen.
