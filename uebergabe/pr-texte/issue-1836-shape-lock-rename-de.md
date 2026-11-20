**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Object list: a part of locked shape no longer offers a name field it then refuses (Issue #1836)“
Auf Deutsch: Objektliste: Bei gesperrter Form wird kein Namensfeld mehr angeboten, das dann nichts tut (Issue #1836)

Commit im Fork: `bf3925355` auf dem Zweig `ccr-2ebd5732-18byw4`

Zusammenfassung:
- „Form sperren“ hält laut Handbuch auch den Namen fest. Die Liste bot trotzdem ein Namensfeld an und verwarf die Eingabe.
- Jetzt bietet sie bei solchen Teilen keins mehr an.
Hinweis: Der Melder wollte eigentlich umbenennen können. Das wäre eine größere Änderung, die Stefan entscheiden soll.

Prüfungen: Typprüfung grün, Tests 6004, e2e 1650. Geprüft zusammen mit den anderen Korrekturen vom 20.11. auf einem Zweig auf Stefans Stand 1.166.0; die Testzahlen stammen von dort.
