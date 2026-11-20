**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Shared folder: a design's picture is found on another computer too, where the sync changed the file's time (Issue #1874)“
Auf Deutsch: Geteilter Ordner: Das Vorschaubild wird auch auf dem anderen Rechner gefunden (Issue #1874)

Commit im Fork: `550f4699c` auf dem Zweig `ccr-2ebd5732-18byw4`

Zusammenfassung:
- Der Bildname hängt an der Dateizeit, und die Synchronisierung verändert diese Zeit leicht. Deshalb fand der zweite Rechner das Bild nicht.
- Jetzt wird ersatzweise das Bild derselben Datei mit gleicher Größe genommen. Die Prüfung auf gleichzeitiges Speichern bleibt unverändert.
Hinweis: Der PHP-Speicher hat dieselbe Stelle und ist noch nicht angepasst.

Prüfungen: Typprüfung grün, Tests 6004, e2e 1650. Geprüft zusammen mit den anderen Korrekturen vom 20.11. auf einem Zweig auf Stefans Stand 1.166.0; die Testzahlen stammen von dort.
