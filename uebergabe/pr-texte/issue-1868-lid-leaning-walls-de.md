**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Lid: a lip follows an opening that narrows below the rim, a cap's rim a body that widens there (Issue #1868)“
Auf Deutsch: Deckel: Der Rand folgt einer Öffnung, die nach unten enger wird (Issue #1868)

Commit im Fork: `bd4fc42e6` auf dem Zweig `fix-1868-lid-leaning-walls`

Zusammenfassung:
Das ist die schräge Kapsel aus #1868, bei der Stefan dich gefragt hat.
- Bisher ging der Deckelrand vom oberen Rand gerade nach unten. Bei schrägen Wänden stand er in der Wand, der Deckel passte nicht.
- Jetzt wird der Körper alle 0,25 mm geschnitten und der Rand folgt der Wand, mit dem eingestellten Spiel auf ganzer Höhe. Das gilt auch für Deckel, die außen übergreifen.
- Die Klick-Noppen und ihre Mulden sitzen dort, wo die Wand auf ihrer Höhe wirklich ist.
- Bei geraden Wänden bleibt alles genau wie vorher.
Hinweise: Die Datei aus der Meldung ließ sich nicht öffnen, nachgestellt an einem runden Topf. Wird die Öffnung nach unten weiter, bleibt der Rand absichtlich gerade.

Prüfungen: Typprüfung grün, Tests 6013, eigene e2e-Tests 3. Der Zweig ist Stefans neuester Stand plus genau dieser eine Commit. Die ganze e2e-Reihe lief mit allen elf Korrekturen zusammen.
