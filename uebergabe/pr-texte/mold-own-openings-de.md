**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Mold: a switch to set the pour opening and the vents oneself, with a click on the part (Discussion #1806)“
Auf Deutsch: Gussform: ein Schalter, um Einguss und Entlüftungen selbst zu setzen, mit einem Klick auf das Teil

Zweig im Fork: `mold-own-openings`

Zusammenfassung:
- Neuer Schalter „Öffnungen selbst setzen“ bei der zweiteiligen Gussform. Aus: alles wie bisher.
- An: Einguss und Entlüftungen werden nicht mehr von selbst gesetzt. Ein Klick auf das Urmodell setzt eine Öffnung, vorher wählst du „Einguss“ oder „Entlüftung“. Ein Klick auf den Stab einer Öffnung nimmt sie wieder weg.
- Im Fenster steht die Liste der Öffnungen, dazu „Alle entfernen“ und „Die vorgeschlagenen übernehmen“ als Startpunkt.
- Eine Öffnung neben dem Urmodell wird weggelassen und gemeldet. Ohne Einguss steht ein Hinweis da.

Prüfungen: Typprüfung grün, Tests 6106, Gussform-e2e 26. Im Browser ausprobiert (zwei Bilder im PR). Die ganze e2e-Reihe lief auf diesem Zweig nicht.
Hinweise: Ein Klick neben das Urmodell schließt das Fenster wie bisher, die gesetzten Öffnungen sind dann weg. Wechselt man die Öffnungsrichtung, passen die gesetzten Stellen nicht mehr.
