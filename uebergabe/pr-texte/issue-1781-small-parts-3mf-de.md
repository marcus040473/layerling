**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „3MF and OBJ export: small parts of a group are no longer left out as splinters of a cut (Issue #1781)“
Auf Deutsch: 3MF- und OBJ-Export: Kleine Teile einer Gruppe werden nicht mehr als Splitter weggelassen (Issue #1781)

Commit im Fork: `7c5bcade6` auf dem Zweig `fix-1781-small-parts-3mf`

Zusammenfassung:
- Der Farb-Export entfernt lose Stückchen unter 0,5 mm³ als Splitter. Dabei gingen auch kleine, selbst gezeichnete Teile verloren (im Test drei von vier Zähnen).
- Jetzt bleibt von jedem gezeichneten Teil der größte Rest erhalten, wenn er mindestens 5 % des Teils ausmacht.
Hinweise: Die Datei aus der Meldung fehlt. Es ist nicht sicher, dass das genau ihr Fall ist. Stefan kann diesen PR auch liegen lassen, bis die Datei da ist.

Prüfungen: Typprüfung grün, Tests 6017, eigene e2e-Tests 5. Der Zweig ist Stefans neuester Stand plus genau dieser eine Commit. Die ganze e2e-Reihe lief mit allen elf Korrekturen zusammen.
