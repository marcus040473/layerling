**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Shared folder: a design's picture is found on another computer too, where the sync changed the file's time (Issue #1874)“
Auf Deutsch: Geteilter Ordner: Das Vorschaubild wird auch auf dem anderen Rechner gefunden (Issue #1874)

Commit im Fork: `f6b320179` auf dem Zweig `fix-1874-shared-thumbnail-sync`

Zusammenfassung:
- Der Bildname hängt an der Dateizeit, und die Synchronisierung verändert diese Zeit leicht. Deshalb fand der zweite Rechner das Bild nicht.
- Jetzt wird ersatzweise das Bild derselben Datei mit gleicher Größe genommen. Die Prüfung auf gleichzeitiges Speichern bleibt unverändert.
Hinweis: Der PHP-Speicher hat dieselbe Stelle und ist noch nicht angepasst.

Prüfungen: Typprüfung grün, Tests 6026. Der Zweig ist Stefans neuester Stand plus genau dieser eine Commit. Die ganze e2e-Reihe lief mit allen elf Korrekturen zusammen.
