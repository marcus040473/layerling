# Für Marcus: so machst du mit GitHub Copilot weiter (Stand 11.11.2026)

Bis Donnerstag, 12.11., 5 Uhr, ist dein Claude-Guthaben für diese Woche aufgebraucht. Bis dahin kann GitHub Copilot
weitermachen. Alles, was Copilot wissen muss, liegt in deinem Fork
**github.com/marcus040473/layerling** auf dem Zweig `main`:

- `.github/copilot-instructions.md`: die Regeln. Copilot liest sie von selbst.
- `uebergabe/UEBERGABE.md`: was fertig ist, was offen ist und auf welchem Zweig (für Copilot, auf Englisch).
- `uebergabe/LIESMICH-MARCUS.md`: diese Anleitung.
- `uebergabe/pr-texte/`: fertige PR-Texte.
- `uebergabe/werkzeuge/`: ein Hilfsprogramm zum Zusammenführen.

## Was offen ist

| | Was | Zweig | Stand |
|---|---|---|---|
| A | Hinweistexte Schiebedeckel (#1497) | `slide-lid-hints` | **Fertig.** Du öffnest nur noch den PR (siehe unten). |
| B | Schnapp-Scharnier (#1520) | `hinge-snap` | Gebaut, die Prüfungen fehlen noch. |
| C | Muster auf Bereichen einer Fläche (#1579) | `texture-regions` | Etwa halb fertig. |
| D | Stefans 1.156.3 und 1.156.4 in deine Variante | `marcus` | Deine Variante ist bei 1.156.2. |
| E | Vier neue Bitten von Stefan (#1594, #1607, #1573, #1587) | – | Wartet auf deine Entscheidung. |

## A: PR an Stefan öffnen (ohne Copilot, 1 Minute)

Öffne die Datei `uebergabe/pr-texte/slide-lid-hints-link.txt` und kopiere den langen Link in den Browser. Titel und Text
sind schon eingefüllt. Drück auf „Create pull request“. Das ist derselbe Schritt wie oben auf deiner Statusseite.

## So gibst du Copilot einen Auftrag

Für Aufträge braucht Copilot den „Coding Agent“. Den gibt es in den bezahlten Copilot-Abos. Je nach Ansicht geht es so:

1. Öffne **github.com/copilot/agents**. Falls diese Seite nicht da ist, gehst du in deinem Fork auf
   „Issues“ → „New issue“.
2. Wähle das Repo **marcus040473/layerling** und, wenn gefragt, den **Zweig aus der Tabelle oben** (bei B also
   `hinge-snap`). Wichtig: nicht `main`.
3. Füge den passenden Auftrag von unten ein. Bei einem Issue: Issue anlegen und rechts unter „Assignees“ **Copilot**
   eintragen.
4. Copilot arbeitet dann eine Weile allein und öffnet am Ende einen **Pull Request in deinem Fork**. Der geht nicht zu
   Stefan.
5. Schau oben im PR, ob er in den richtigen Zweig geht („into hinge-snap“ und nicht „into main“). Wenn die Prüfungen
   grün sind, drückst du „Merge“. Wenn du unsicher bist, lass ihn liegen. Ich schaue ihn mir ab Donnerstag an.

**Nie** einen PR bei Stefan (henmedia) von Copilot öffnen lassen. Das machst du weiter selbst, wenn alles fertig ist.

## Aufträge zum Kopieren

Die Aufträge sind auf Englisch, weil Copilot so am besten arbeitet. Antworten wird er dir auf Deutsch.

### B: Schnapp-Scharnier fertig prüfen (Zweig `hinge-snap`)
```
Read .github/copilot-instructions.md and uebergabe/UEBERGABE.md (on main), section B.
Work on branch hinge-snap only. Run npm ci, npm run copy:occt, then npm run typecheck, npm test, npm run test:e2e,
npm run guide and npm run i18n:status. Fix every failure in the snap-on hinge code without disabling tests.
Then write the PR text for Stefan (English, his template) into uebergabe/pr-texte/hinge-snap.md and a German
translation into uebergabe/pr-texte/hinge-snap-de.md in the same pull request. Open the pull request against hinge-snap.
Do not open anything on henmedia/layerling. Explain to me in German, short and simple, what you did.
```

### D: Stefans neue Version in deine Variante (Zweig `marcus`)
```
Read .github/copilot-instructions.md and uebergabe/UEBERGABE.md (on main), section D.
Work on branch marcus only. Add the remote upstream https://github.com/henmedia/layerling, fetch tags and merge
v1.156.4 into marcus (merge, never rebase). Resolve conflicts as section D says, keep the docked tool windows,
look for doubled code afterwards. Then npm ci, npm run copy:occt, npm run typecheck and the full npm test must be green.
Commit message in German starting with "merge: Stefans 1.156.4 – ". Open the pull request against marcus.
Explain to me in German, short and simple, what you did and which conflicts there were.
```

### C: Muster-Bereiche weiterbauen (Zweig `texture-regions`)
Das ist der größte Brocken. Mach ihn mit Copilot nur, wenn B und D gut geklappt haben. Sonst lass ihn für mich bis
Donnerstag liegen.
```
Read .github/copilot-instructions.md and uebergabe/UEBERGABE.md (on main), section C.
Work on branch texture-regions only. Continue the work in progress: finish the MCP handler in LayerlingEditor.tsx,
finish drawing a region on a face in the view, keep regions editable and removable, add the guide paragraph in
15 languages and real tests (remove tests/unit/surfaceTextureRegionsExplore.test.ts or make it a real test).
Do not change the rule that the Texture Mask is only for convex bodies. Run all five checks until green.
Open the pull request against texture-regions. Explain to me in German, short and simple, what you did and what is
still missing.
```

## Die vier neuen Bitten von Stefan (E)

Erst entscheiden, dann bauen. Mein Vorschlag:
- **#1594** (Gewinde am Schraubdeckel tiefer ansetzen) und **#1607** (gewählte Flächen beim Muster zeigen): klein und
  passend. Ja.
- **#1573** (Muster-Maske einklappen): betrifft vor allem Stefans Ansicht. Erst kurz mit Stefan klären.
- **#1587** (Schiebe-Riegel): größerer Bau. Später.

## Ab Donnerstag

Sag mir im Chat, was Copilot gemacht hat (oder schick mir die Links zu seinen PRs). Ich prüfe es, mache weiter, baue
die Demo und lege die PR-Texte für Stefan auf deine Statusseite. Der tägliche Bericht kommt weiter jeden Morgen um
6 Uhr. Bis das Guthaben wieder da ist, kann er ausfallen.
