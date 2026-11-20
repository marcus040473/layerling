**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Edge treatment: a tube's bore still cuts through the group after a chamfer or fillet (Issue #1790)“
Auf Deutsch: Kanten bearbeiten: Die Bohrung eines Rohrs schneidet nach Fase oder Rundung weiter durch die Gruppe (Issue #1790)

Commit im Fork: `82d1e93d0` auf dem Zweig `ccr-2ebd5732-18byw4`

Zusammenfassung:
- Beim Gruppieren wird ein Rohr mit „Bohrung schneidet ein Loch“ als Körper plus Loch behandelt. Das Kantenwerkzeug tat das nicht, deshalb war das Loch im Quader danach wieder zu.
- Jetzt bekommt das Kantenwerkzeug das Rohr genauso geteilt. Gilt für Rohr, Ring und gebogenes Rohr, für Fase und Rundung.

Prüfungen: Typprüfung grün, Tests 6004, e2e 1650. Geprüft zusammen mit den anderen Korrekturen vom 20.11. auf einem Zweig auf Stefans Stand 1.166.0; die Testzahlen stammen von dort.
