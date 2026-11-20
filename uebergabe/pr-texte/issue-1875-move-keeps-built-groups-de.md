**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Moving with the arrow keys and undoing a move no longer build every Multicolor group of the design again (Issue #1875)“
Auf Deutsch: Verschieben mit den Pfeiltasten und Rückgängig bauen nicht mehr alle mehrfarbigen Gruppen neu (Issue #1875)

Commit im Fork: `c6db822b6` auf dem Zweig `ccr-2ebd5732-18byw4`

Zusammenfassung:
- Bei jedem Tastendruck, Rückgängig und Wiederholen wurden alle mehrfarbigen Gruppen des Entwurfs neu aufgebaut, nicht nur das bewegte Teil. Mit der Maus war das nicht so.
- Jetzt bleiben unveränderte Gruppen erhalten. Im Test mit 36 solchen Gruppen: von etwa 4 Sekunden auf etwa eine halbe.
Hinweis: Die Datei des Melders ließ sich nicht prüfen. Hat sein Entwurf keine mehrfarbigen Gruppen, liegt es bei ihm an etwas anderem.

Prüfungen: Typprüfung grün, Tests 6004, e2e 1650. Geprüft zusammen mit den anderen Korrekturen vom 20.11. auf einem Zweig auf Stefans Stand 1.166.0; die Testzahlen stammen von dort.
