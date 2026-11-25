**Deutsch zum Verstehen (nicht posten)**

Titel: „Make exact: a whole library sphere comes out as one exact sphere (Making Layers, by mail)“

Worum es geht: Stefans Mail „Exakt machen: ganze Kugel wird abgelehnt“. Eine Kugel aus der Bibliothek, als STL
exportiert und wieder eingelesen, ließ sich nicht exakt machen.

Was jetzt anders ist:
- **Über 200.000 Dreiecke:** Der Worker gibt seine eigene Grenze (400.000) jetzt an die Rechnung weiter. Vorher galt dort
  stillschweigend 200.000, deshalb kam die Meldung „Flächen ergeben keinen geschlossenen Körper“.
- **„Maximum call stack size exceeded“:** Bei sehr vielen Punkten lief der Speicher für Funktionsaufrufe über. Die
  betroffenen Stellen zählen jetzt Schritt für Schritt durch.
- **Kugel wird nicht als Ganzes erkannt:** Rund um die Pole liegen sehr schmale Dreiecke fast flach nebeneinander. Die
  wurden als kleine ebene Flächen genommen und nie der Kugel zugeschlagen. Jetzt gehören sie zur Kugel.
- **„makeArcEdge: construction failed“:** Ein Netz, das rundum eine einzige Kugel ist, wird jetzt direkt als echte Kugel
  des CAD-Kerns gebaut, mit einer einzigen Fläche. Kugeln, die doch in Stücke geschnitten werden müssen (z. B. eine Kugel
  mit flacher Unterseite oder eine Halbkugel), klappen jetzt auch zuverlässiger.

Vorher/Nachher mit dem echten Netz der Bibliothekskugel:
- 64 Schritte, 50 mm: vorher 16.128 Einzelflächen, jetzt 1 Kugelfläche
- 128 Schritte (20, 40, 100 mm): vorher rund 64.800 Einzelflächen nach etwa 100 Sekunden, jetzt 1 Kugelfläche in einer
  halben Sekunde
- 256 Schritte: vorher Absturz, jetzt 1 Kugelfläche in etwa 5 Sekunden

Prüfungen: alle grün (Tests 6853, e2e 1884). Neue Tests nachgebaut wie in der Mail, sie scheitern ohne die Änderung.
Hinweis: Ganz grobe Kugeln (12 Schritte) bleiben wie bisher eckig, das ist gewollt.
