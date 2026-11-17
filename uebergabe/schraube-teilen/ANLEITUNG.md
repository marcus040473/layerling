# Schraube längs teilen und flach legen (17.11.2026)

Eine stehend gedruckte Schraube bricht bei der ersten richtigen Last entlang ihrer Schichten. Liegend gedruckt ist das Gewinde um ein Vielfaches stabiler. Layerling teilt die Schraube dafür mit einem Klick und legt beide Hälften richtig hin.

## 1 – Der Knopf

![Knopf](bilder/E1-knopf.webp)

Schraube oder Gewindestange wählen, in den Eigenschaften nach unten:

1. **Hinweis**: was passiert.
2. **Mit Passstück**: an (Standard) = V-Nut in beiden Hälften und ein Vierkant dazu. Ab etwa M6; bei dünneren Gewinden steht dort „zu dünn“, die Schraube wird ohne Passstück geteilt.
3. **Längs teilen und flach legen**.

## 2 – Das Ergebnis

![Ergebnis](bilder/E2-ergebnis.webp)

1. **Hälfte 1** und 2. **Hälfte 2**: durch die Achse geteilt, jede liegt auf ihrer Schnittfläche – genau da, wo die Schraube stand. Die Gewindeflanken steigen ohne Stützen vom Druckbett auf.
3. **Passstück**: ein Vierkant, so lang wie die Nut minus 0,3 mm an jedem Ende, mit dem Spiel deines Druckers (sonst 0,15 mm je Seite).

Die Meldung oben nennt die Maße des Passstücks. **Rückgängig** holt die Schraube mit allen Einstellungen zurück.

## 3 – Die Nut

![Nut](bilder/E3-nut.webp)

Hier ist Hälfte 1 nur fürs Bild umgedreht:

1. **V-Nut** entlang der Achse in der Schnittfläche. Ihre Flanken stehen 45° schräg, sie druckt also als Teil der Unterseite, ohne Brücke. Sie hört vor den Fasen und (bei Schrauben) vor dem Boden des Innensechskants auf.
2. **Die andere Hälfte** hat dieselbe Nut.
3. **Das Passstück** kommt hinein: Es richtet die Hälften beim Kleben aus und versteift die Fuge.

## Zusammenbauen

- Passstück in eine Hälfte legen, Kleber (z. B. Sekundenkleber) auf die Schnittfläche, zweite Hälfte drauf, eine Minute andrücken.

## Für KI-Helfer (MCP)

Neues Werkzeug `layerling_split_bolt` mit `id`, `key` (Standard an) und `keyPlay`. Antwort: die Teile, `keySide`, `keyLength`, bei dünnen Gewinden `keyLeftOut`.
