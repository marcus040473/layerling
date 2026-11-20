**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Edge tools: the look for inner corners keeps to its four seconds, so a fillet that cannot be made is refused in time (Issue #1812)“
Auf Deutsch: Kantenwerkzeuge: Die Suche nach Innenecken hält ihre vier Sekunden ein (Issue #1812)

Commit im Fork: `8d400435e` auf dem Zweig `ccr-2ebd5732-18byw4`

Zusammenfassung:
- Die Analyse aus der Meldung stimmt. Die Zeitgrenze von vier Sekunden galt nur für den zweiten Schritt, die Suche davor lief immer bis zum Ende.
- Jetzt gilt sie auch für die Suche. Die Rundung wird rechtzeitig mit der richtigen Meldung abgelehnt (im Test 71 s auf 18 s).
Hinweis: Die Fase am Behälter mit zwei Etiketten ist aus einem anderen Grund noch langsam.

Prüfungen: Typprüfung grün, Tests 6004, e2e 1650. Geprüft zusammen mit den anderen Korrekturen vom 20.11. auf einem Zweig auf Stefans Stand 1.166.0; die Testzahlen stammen von dort.
