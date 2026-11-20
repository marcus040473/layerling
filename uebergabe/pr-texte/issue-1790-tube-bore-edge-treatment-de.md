**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Edge treatment: a tube's bore still cuts through the group after a chamfer or fillet (Issue #1790)“
Auf Deutsch: Kanten bearbeiten: Die Bohrung eines Rohrs schneidet nach Fase oder Rundung weiter durch die Gruppe (Issue #1790)

Commit im Fork: `948bffdd6` auf dem Zweig `fix-1790-tube-bore-edge-treatment`

Zusammenfassung:
- Beim Gruppieren wird ein Rohr mit „Bohrung schneidet ein Loch“ als Körper plus Loch behandelt. Das Kantenwerkzeug tat das nicht, deshalb war das Loch im Quader danach wieder zu.
- Jetzt bekommt das Kantenwerkzeug das Rohr genauso geteilt. Gilt für Rohr, Ring und gebogenes Rohr, für Fase und Rundung.

Prüfungen: Typprüfung grün, Tests 6015, eigene e2e-Tests 5. Der Zweig ist Stefans neuester Stand plus genau dieser eine Commit. Die ganze e2e-Reihe lief mit allen elf Korrekturen zusammen.
