**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Intersect: two parts that also touch along a flat face no longer bring that face along as a paper-thin layer (Issue #1886)“
Auf Deutsch: Schnittmenge: Berühren sich zwei Teile zusätzlich an einer ebenen Fläche, bleibt keine hauchdünne Schicht mehr (Issue #1886)

Commit im Fork: `a422902df` auf dem Zweig `fix-1886-intersect-touching-face`

Zusammenfassung:
- Nachgestellt: Kugel in einem Quader, geschnitten mit einem zweiten Quader, der genau aufliegt. Die Berührfläche blieb als Haut ohne Dicke übrig.
- Jetzt wird so eine Haut entfernt. Das echte Ergebnis bleibt unverändert (gleiches Volumen).
Hinweis: Die Datei aus der Meldung fehlt. Falls die Schicht dort wirklich 0,001 mm dick ist, hilft diese Korrektur nicht.

Prüfungen: Typprüfung grün, Tests 6013, eigene e2e-Tests 6. Der Zweig ist Stefans neuester Stand plus genau dieser eine Commit. Die ganze e2e-Reihe lief mit allen elf Korrekturen zusammen.
