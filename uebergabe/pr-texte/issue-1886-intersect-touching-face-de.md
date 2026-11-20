**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Intersect: two parts that also touch along a flat face no longer bring that face along as a paper-thin layer (Issue #1886)“
Auf Deutsch: Schnittmenge: Berühren sich zwei Teile zusätzlich an einer ebenen Fläche, bleibt keine hauchdünne Schicht mehr (Issue #1886)

Commit im Fork: `b9b251e5f` auf dem Zweig `ccr-2ebd5732-18byw4`

Zusammenfassung:
- Nachgestellt: Kugel in einem Quader, geschnitten mit einem zweiten Quader, der genau aufliegt. Die Berührfläche blieb als Haut ohne Dicke übrig.
- Jetzt wird so eine Haut entfernt. Das echte Ergebnis bleibt unverändert (gleiches Volumen).
Hinweis: Die Datei aus der Meldung fehlt. Falls die Schicht dort wirklich 0,001 mm dick ist, hilft diese Korrektur nicht.

Prüfungen: Typprüfung grün, Tests 6004, e2e 1650. Geprüft zusammen mit den anderen Korrekturen vom 20.11. auf einem Zweig auf Stefans Stand 1.166.0; die Testzahlen stammen von dort.
