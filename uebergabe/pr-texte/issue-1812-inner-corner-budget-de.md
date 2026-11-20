**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Edge tools: the look for inner corners keeps to its four seconds, so a fillet that cannot be made is refused in time (Issue #1812)“
Auf Deutsch: Kantenwerkzeuge: Die Suche nach Innenecken hält ihre vier Sekunden ein (Issue #1812)

Commit im Fork: `85796115b` auf dem Zweig `fix-1812-inner-corner-budget`

Zusammenfassung:
- Die Analyse aus der Meldung stimmt. Die Zeitgrenze von vier Sekunden galt nur für den zweiten Schritt, die Suche davor lief immer bis zum Ende.
- Jetzt gilt sie auch für die Suche. Die Rundung wird rechtzeitig mit der richtigen Meldung abgelehnt (im Test 71 s auf 18 s).
Hinweis: Die Fase am Behälter mit zwei Etiketten ist aus einem anderen Grund noch langsam.

Prüfungen: Typprüfung grün, Tests 6017, eigene e2e-Tests 1. Der Zweig ist Stefans neuester Stand plus genau dieser eine Commit. Die ganze e2e-Reihe lief mit allen elf Korrekturen zusammen.
