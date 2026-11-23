Titel: Deckel: Noch einmal für eine Kiste mit Magneten oder Schrauben gemacht, ersetzt er sie und stellt keine Zapfen in die alten Taschen (Diskussion #1985)

## Zusammenfassung

- Diskussion #1985: Wurde für eine Kiste, die schon Pfosten und Taschen von einem früheren Deckel hatte, noch einmal ein Deckel gemacht, hielt das Werkzeug jede alte Tasche für eine Öffnung. Ein Steckdeckel bekam in jeder Tasche einen Zapfen (als Ring, weil der Rand eine Wandstärke hat). Mit Schrauben nach Magneten wurden die neuen Löcher dort geschnitten, wo die breiten Magnet-Taschen noch offen lagen. Die Kiste hatte dann beides.
- Ein Deckel, der selbst Magnete oder Schrauben mitbringt, ersetzt jetzt, was der frühere Deckel in den Ecken gelassen hat, samt Pfosten: Die Gruppe des Deckels wird geöffnet wie beim Auflösen einer Gruppe, die alten Pfosten und Taschen bleiben weg, und die Kiste wird mit den neuen gruppiert. Kiste und Deckel sehen aus wie bei einer Kiste, die nie einen Deckel hatte.
- Ein Deckel ohne Magnete und Schrauben lässt die Kiste, wie sie ist, und wird so berechnet, als wären die alten Taschen zu: Sein Rand geht um die Pfosten herum und bleibt aus den Taschen draußen.
- Wurde die Kiste nach dem ersten Deckel noch einmal gruppiert (zum Beispiel mit einem Loch für ein Kabel), wird die innere Gruppe ohne die alten Teile neu gebaut. Die äußere Gruppe behält ihre Kennung, ihren Namen und ihr Loch.
- Die alten Teile werden an ihren Kennungen erkannt (`lidCornerPart`), so wie das Scharnier eines früheren Deckels. Die Kennungen von Pfosten, Taschen und Scharnierknöcheln beginnen jetzt mit der ersten Kennung des Körpers (`localIdBase`): Ein Körper, der einmal aus einer Gruppe gelöst wurde, hat eine abgeleitete Kennung, und beim Gruppieren ging das Merkmal dahinter verloren. Die Teile wurden dann nicht wiedergefunden.
- Ein Satz mehr bei `layerling_make_lid` im MCP-Werkzeug und in den drei `SKILL.md`. Keine neuen Texte in der Oberfläche.

## Prüfungen

- [x] `npm run typecheck`
- [x] `npm test` (6460 bestanden)
- [x] `npm run test:e2e` (1719 bestanden)
- [x] `npm run guide`, `npm run i18n:status`
- [x] Von Hand im Editor geprüft: eine Kiste 60 x 60 x 50, oben offen ausgehöhlt, ein Steckdeckel mit Magneten 10 x 3 mm, dann einer mit M3-Schrauben, dann einer ohne beides
- Neu: `tests/e2e/lidAgain.e2e.ts` (echte Rechenkerne, gruppiert wie im Editor: Schrauben nach Magneten und Magnete nach Schrauben ergeben dieselbe Kiste und denselben Deckel wie bei einer frischen Kiste; ein einfacher Deckel hat einen Rand und lässt die Taschen leer; eine Kiste, die danach mit einem Kabelloch gruppiert wurde) und `tests/unit/lidCornerParts.test.ts`. Beide schlagen ohne die Änderung fehl.

## Hinweise

- Eine Kiste, deren Kanten nach dem ersten Deckel abgerundet wurden, ist ein einziges Netz mit seiner Geschichte, ohne Teile zum Nachsehen: Dort wird der Deckel wie bisher gemacht. Das gilt auch für eine Kiste, deren erster Deckel vor dieser Änderung aus einem Körper mit abgeleiteter Kennung gemacht wurde.
- Die anderen Teile, die ein früherer Deckel dazugibt (Wangen für Verschlüsse, Klick-Mulden, eine Fingermulde), bleiben wie bisher in der Kiste. Ein Scharnier wird weiter mit seiner Meldung abgelehnt.
- Nicht gebaut: Zapfen in den Ecken als dritte Wahl neben Magneten und Schrauben, wie in der Diskussion gefragt. Das würde dieselben Ecken und Pfosten nutzen. Ich baue es gern, wenn es gewünscht ist.
