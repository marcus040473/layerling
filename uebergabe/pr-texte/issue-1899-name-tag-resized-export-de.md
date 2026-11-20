**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Export: a resized name tag keeps its text on the plate (Issue #1899)“
Auf Deutsch: Export: Ein in der Größe verändertes Namensschild behält seinen Text auf der Platte (Issue #1899)

Commit im Fork: `56938273a` auf dem Zweig `ccr-2ebd5732-18byw4`

Zusammenfassung:
- Ein Namensschild besteht aus Textschichten. Die Ansicht streckt sie gemeinsam, der Export baute aber jede Schicht einzeln neu als Text. Dadurch waren die Schichten im Slicer verschieden groß und der Text lag nicht mehr auf der Platte.
- Jetzt wird ein verändertes Namensschild so exportiert, wie die Ansicht es zeigt. Ein unverändertes bleibt wie bisher.
- Betraf auch STL und OBJ, nicht nur 3MF.
Hinweise: Bemalung auf einer Textschicht eines veränderten Schilds wird nicht übernommen. Nicht in Bambu Studio geöffnet.

Prüfungen: Typprüfung grün, Tests 6004, e2e 1650. Geprüft zusammen mit den anderen Korrekturen vom 20.11. auf einem Zweig auf Stefans Stand 1.166.0; die Testzahlen stammen von dort.
