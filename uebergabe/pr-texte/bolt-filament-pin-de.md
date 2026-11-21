**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Split a screw: pieces of 1.75 mm filament as the pins (Discussion #1851)“
Auf Deutsch: Schraube teilen: Stücke aus 1,75-mm-Filament als Stifte

Zweig im Fork: `bolt-filament-pin-pr` (der ältere Zweig `bolt-filament-pin` ist damit überholt)

Zusammenfassung:
- Neuer Schalter „Filament als Stifte (1,75 mm)“ beim Längsteilen einer Schraube. Geht ab M4.
- Ein Stück Filament liegt in einer Rinne längs im Gewinde, je zur Hälfte in beiden Hälften. Es richtet die Hälften quer aus. Bei langen Gewinden sind es zwei kurze Stücke.
- Hat der Kopf Platz, kommt ein zweites Stück quer in den Kopf und richtet auch längs aus. Sonst sagt die Meldung: Enden bündig schieben, bis der Kleber hält.
- Die Meldung nennt die Längen zum Abschneiden, zum Beispiel bei M5 × 30 mit Sechskantkopf 4,5 mm und 21,5 mm.

Was gegenüber dem ersten Bau geändert wurde: Bei kleinen Zylinder- und Senkköpfen passte das Stück im Kopf gar nicht oder war nur 1,5 mm lang. Die Texte versprachen trotzdem, dass es längs ausrichtet. Das ist jetzt ehrlich gelöst (siehe oben). Die Längen stehen in halben Millimetern statt in Zehnteln.

Prüfungen: Typprüfung grün, Tests 6098, e2e zum Schraubenteilen 38. Im Browser ausprobiert, nicht gedruckt.
Hinweis: Bei M4 nimmt die Rinne etwa 45 % vom Kern weg. Stefan kann entscheiden, ob es erst ab M5 angeboten wird.
