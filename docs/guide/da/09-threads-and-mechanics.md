---
title: Gevind, tandhjul og andre dele
summary: Skruer, møtrikker og gevindhuller der passer sammen, plus tandhjul, fjeder, bøjet rør, svalehale, dråbehul, forsænkning og undersænkning.
---

Ud over basisformerne rummer biblioteket nogle dele der ellers ville være kedelige at bygge selv. Dem kan du ændre bagefter i deres indstillinger.

## Gevind

Vælg {{ui:shape.thread}} i formbiblioteket. Under {{ui:inspector.threadRole}} bestemmer du hvad det skal være:

- **{{ui:thread.rod}}:** en cylinder med gevind, for eksempel en skrue uden hoved.
- **{{ui:thread.screw}}:** med hoved. Du vælger {{ui:inspector.threadHead}}: {{ui:thread.headCylinder}}, {{ui:thread.headCountersunk}} eller {{ui:thread.headHex}}.
- **{{ui:thread.nut}}:** den matchende møtrik.
- **{{ui:thread.bore}}:** et gevindhul. Det er et hul. Træk det ind i en del, gruppér begge, og delen har et indvendigt gevind.

![En skrue med cylinderhoved. Til højre: type og hovedform, længere nede størrelse, deling og profil.](shot:thread-screw)

Du vælger størrelsen under {{ui:prop.threadSize}} fra en liste: metrisk fra M2 til M24, tomme-størrelserne UNC og UNF fra No. 4 til 1 tomme, og rørgevindene G1/16 til G4. Vælger du {{ui:thread.customSize}}, sætter du selv {{ui:prop.diameter}} og {{ui:prop.pitch}}. For en tomme- eller G-størrelse beder feltet om {{ui:prop.threadsPerInch}} i stedet for delingen i millimeter.

Listen grupperer størrelserne efter serie, og en linje under feltet navngiver serien af den størrelse du valgte, med eksempler du kender fra hverdagen:

- **M, metrisk grov:** det ISO metriske grove gevind til ISO 261, som på standardskruer og -møtrikker.
- **UNC, US tomme grov:** kamera- og stativskruen er 1/4"-20 UNC (ISO 1222), større stativhoveder bruger 3/8"-16 UNC.
- **UNF, US tomme fin:** samme diametre som UNC med en finere deling (ASME B1.1).
- **G, rørgevind:** en bruseslange forbinder med G1/2, en vaskemaskine-indløbsslange med G3/4. En havelok ender i G3/4, mindre haner i G1/2; det er der tap-koblingen på et klik-på-slangesystem skrues på.

G-størrelserne er de parallelle Whitworth-rørgevind til ISO 228-1, der findes på fittings til vand, gas, hydraulik og pneumatik. Størrelsen navngiver røret, ikke gevindet: en G1 måler 33,249 mm over gevindet. At vælge en G-størrelse sætter profilen til {{ui:thread.profileWhitworth}}, og at vælge en metrisk eller tomme-størrelse sætter den tilbage til {{ui:thread.profileV}}. En {{ui:thread.profileTrapezoidal}} eller {{ui:thread.profileRound}} profil du selv har valgt bevares. Standarden definerer kun gevindet, så hovedet på en skrue og en møtrik på en G-størrelse får de samme proportioner som på en diameter du selv har sat. De koniske rørgevind R, Rc og Rp er ikke medtaget.

Flere indstillinger:

- **{{ui:prop.threadHand}}:** {{ui:thread.right}} eller {{ui:thread.left}}.
- **{{ui:prop.threadProfile}}:** {{ui:thread.profileV}} er standardprofilen på metriske og tomme-gevind, {{ui:thread.profileWhitworth}} det Whitworth-rørgevindenes: 55° med rundede toppe og rødder. {{ui:thread.profileTrapezoidal}} og {{ui:thread.profileRound}} har flade toppe og rødder. Det printer som regel mere pålideligt, fordi der ikke opstår tynde spidser.
- **{{ui:thread.profileCustom}}:** En trapez du selv former, med en flad top og en flad rod af samme bredde. {{ui:prop.threadFlankAngle}} er vinklen mellem de to flanker af en tand: 60° er det skarpe V-gevind, 30° det trapezformede gevind, og ved 90° eller mindre er ingen flanke fladere end 45°, så gevindet printer uden støtte. {{ui:prop.threadDepth}} og {{ui:prop.threadCoreDiameter}} er ét mål sagt på to måder: kernediameteren er diameteren minus to gange dybden, og ændring af den ene ændrer den anden. En ny egen profil starter med V-gevindets dybde ved 60°. Dybden har grænser der afhænger af vinklen og delingen: ikke smallere end en tiendedel af delingen, ikke dybere end 40 % af diameteren, og ikke så dyb at de to flanker optager mere end ni tiendedele af delingen. Ændrer du delingen, følger dybden proportionalt; skalerer du gevindet, gør dybden også. Spillet og faserne virker som med de andre profiler. Gennem MCP-broen er profilen `custom` med `threadFlankAngle` og `threadDepth`.
- **{{ui:prop.clearance}}:** For møtrik og gevindhul, det rum der sikrer at et printet par faktisk kan drejes. Jo grovere din printer arbejder, jo mere clearance har parret brug for. Det er det ekstra rum hen over diameteren, og mellemrummet mellem flankerne af et V-gevind er kun omkring halvdelen, så et printet par har brug for mere end man skulle tro: nye møtrikker starter på 0,4 mm, 0,3 er stramt og 0,5 løst. Print et testpar først. Stænger og skruer har deres eget clearance her, som gør bolten så meget tyndere i diameter. Det er sat til 0. Hvilken side der får rummet afhænger af hvad du parrer:
  - **Printet skrue og printet møtrik:** lad skruen være på 0 og giv møtrikken rummet (de 0,4 mm den starter med).
  - **Rigtig skrue i printet møtrik eller gevindhul:** den printede side tager det hele, så møtrikken beholder sine 0,4 mm. En strammere 0,3 mm er et forsøg værd hvis skruen vakler.
  - **Printet skrue i rigtig møtrik:** den rigtige møtrik har intet spil, så skruen skal være tyndere: 0,3 til 0,4 mm her, lige så meget som en printet møtrik ville have.
- **{{ui:prop.axialClearance}}:** For møtrik og gevindhul, spil langs aksen, oven i {{ui:prop.clearance}}. Hver tand på møtrikken gøres så meget tyndere, diameteren bevares. Grunden: {{ui:prop.clearance}} virker kun på diameteren og åbner flankerne på et V-gevind til omkring 0,58 af dets værdi. Den der vil have luft mellem flankerne er nødt til at åbne diameteren og får sidelæns slør for det. Spillet langs aksen skiller de to ad. Det er sat til 0, så et gemt gevind ændres ikke, og det går højst op til en femtedel af delingen, fordi der over det ikke ville være noget tilbage af møtrikkens tænder. Feltet findes kun for møtrik og gevindhul; stang og skrue beholder deres eget clearance. Mere nedenunder under "Gevind til 3D-print".
- **{{ui:prop.threadChamferTop}}, {{ui:prop.threadChamferBottom}}, {{ui:prop.headChamfer}} og {{ui:prop.rimChamfer}}:** Faser i enderne så gevindet starter rent og hovedet ikke har nogen skarp kant. Hver ende af en stang, møtrik eller gevindhul har sin egen fas, så toppen kan være lang og bunden kort eller ingen. En skrue har kun én ved spidsen, mærket {{ui:prop.chamfer}}. På en møtrik eller gevindhul er fasen det rum munden åbner ud over yderdiameteren; keglen løber ved 45 grader ned til gevindkernen, så der ikke efterlades nogen hylde ved yderdiameteren.

At skifte et gevind mellem {{ui:thread.rod}} og {{ui:thread.bore}} bevarer dets længde. En møtrik og en skrue starter fra deres standardmål.
- **{{ui:prop.quality}}:** Hvor fint gevindet beregnes. Højere er mere nøjagtigt, men langsommere.

Printede gevind er et emne for sig. Lav skrue-møtrik-parret som test før du printer en stor del, og justér clearance til din printer.

## Gevind til 3D-print

Et printet gevind har brug for luft to steder, og de virker forskelligt:

- **Clearance i diameteren ({{ui:prop.clearance}}):** gør møtrikken bredere. Skruen får så halvdelen af værdien som luft på hver side, 0,2 mm ved 0,4 mm. Gevindet drejer let, men skruen kan vakle sidelæns.
- **Spil langs aksen ({{ui:prop.axialClearance}}):** gør møtrikkens tænder tyndere. Skruen kan så bevæge sig frem og tilbage langs aksen med den værdi når den ikke er strammet. Der er ingen ekstra luft til siden for det.

Tilsammen giver de mellemrummet mellem flankerne: omkring 0,58 gange clearance i diameteren plus spillet langs aksen. Et eksempel for 0,3 mm mellemrum: det krævede før 0,5 mm i diameteren, det er 0,25 mm luft på hver side. Nu gør 0,2 mm i diameteren (0,1 mm på hver side) og 0,2 mm langs aksen det, og mellemrummet er 0,32 mm.

**Konsekvenser at kende**

- **Skruen har spil langs aksen.** Uden belastning kan den bevæge sig frem og tilbage med den værdi. For fastgørelser, låg og kabinetter er det ligegyldigt; for en gevindstang der skal positionere præcist er det ikke, så hold den lille eller på 0 der.
- **Møtrikkens tænder bliver tyndere.** Med 0,3 mm ved en deling på 1,75 mm er hver tand næsten en tredjedel tyndere på midten og så klart mindre stærk. For tungt belastede dele brug en grovere gevind i stedet.
- **Mere at beregne.** Tandformen får ekstra punkter, så gevindet har flere trekanter og tager lidt længere at beregne.
- **Ingen ægte bue i STEP-eksporten for Whitworth-profilen.** Et {{ui:thread.profileWhitworth}}-gevind med spil langs aksen går til kantværktøjet og STEP-eksporten som en tandform lavet af lige stykker, ikke med de sande cirkelbuer. Ved 0 forbliver alt som før.

**Tips**

1. **Et testpar først.** En skrue og en møtrik, kun 4 til 6 mm høje hver, tager et par minutter. Print tre par med forskelligt spil side om side og tag det der drejer let og ikke vakler.
2. **Start med værdier der ofte passer.** Clearance i diameteren 0,2 til 0,3 mm og spil langs aksen 0,2 mm. Hvis skruen vakler sidelæns, sænk clearance i diameteren; hvis den klemmer, hæv spillet langs aksen. Hvis du hellere vil undvære spillet langs aksen, brug 0,4 mm i diameteren som før.
3. **Spillet langs aksen bør være mindst en laghøjde.** Det der ligger under ét lag opløser printeren ikke. Ved en laghøjde på 0,2 mm er 0,2 mm et godt udgangspunkt; ved 0,1 mm er mindre nok.
4. **Print skrue og møtrik stående.** Aksen peger opad, så hver omgang ligger i hele lag og flankerne kommer rene ud. Liggende synker flankerne.
5. **Fine delinger er svære.** Under omkring 1 mm deling fusionerer omgangene ofte. Et grovere gevind, eller en {{ui:thread.profileTrapezoidal}}-profil med flade toppe, printer mere pålideligt end et fint V-gevind.
6. **Undgå tynde spidser.** V-gevindet har en smal spids som printeren næsten ikke rammer med sin dysebredde. {{ui:thread.profileTrapezoidal}}- og {{ui:thread.profileRound}}-profilerne har fladere tænder.
7. **Afgrat og kør det ind.** De første omgange er ofte stive fordi små rester fra printet står på flankerne. Drej det frem og tilbage et par gange og det kører lettere. Fasen ved starten hjælper med at skrue det i.
8. **En anden printer eller filament.** Spillet afhænger af printeren, materialet og dysen. Print testparret igen når du ændrer en af delene.

Kantværktøjet tager et gevind som dets eksakte form. Du kan fase eller runde den del der bærer det med gevindet allerede på plads, eller kanterne på et skruehoved, se [Bryd kanter og hul former](chapter:edges-and-hollowing). At beregne et gevinds kanter tager et stykke tid: et par sekunder for en M6, omkring et halvt minut for et G1/2-rørgevind. Den hurtigste vej til at bryde kanten på et skruehoved er stadig hovedfasen i egenskaberne.

## Tandhjul

{{ui:shape.gear}} kommer som {{ui:gear.spur}}, {{ui:gear.helical}}, {{ui:gear.herringbone}} og {{ui:gear.bevel}}, og som {{ui:gear.internal}} og {{ui:gear.rack}} (længere nede). Nye tandhjul har {{ui:gear.profileInvolute}} under {{ui:prop.gearProfile}}: tænder med evolvente flanker, som tandhjulsgeneratorer og ingeniører bruger dem. Sådanne tænder ruller rent på hinanden. Du sætter antallet af {{ui:prop.teeth}} og {{ui:prop.gearModule}}, og størrelsen følger: udvendig diameter er modul × (tænder + 2), delecirkel modul × tænder. Nye tandhjul starter ved modul 2. To tandhjul griber når de har samme modul og samme {{ui:prop.gearPressureAngle}} (normalt 20°) og deres centre står (tænder + tænder) × modul / 2 fra hinanden. Vælg begge tandhjul og egenskabspanelet giver den centerafstand og hvor langt fra hinanden centrene er nu. Hvis en tand så møder en tand i stedet for en mellemrum, drej et af tandhjulene med en halv tand, det er 180° divideret med dets antal tænder. {{ui:prop.gearBacklash}} tager lidt af tænderne så et printet par ikke binder. Værdien er for parret, og hvert tandhjul tager halvdelen; 0,2 mm er et godt udgangspunkt, 0 giver det nøjagtige tandhjul. Under delecirklen løber flanken lige ned til roden og er ikke underskåret som en fræser ville gøre det. Det passer til print, men et meget lille pinion under omkring 17 tænder kan gnide lidt ved roden.

Et helisk tandhjul tilføjer {{ui:prop.helixAngle}}. Med evolvente tænder er det den sande helixvinkel på delecirklen: to heliske tandhjul griber når de har samme modul og samme vinkel, én positiv og den anden negativ. {{ui:gear.herringbone}} er to heliske halvdele der drejer den modsatte vej: tænderne løber den ene vej op til halv højden og tilbage efter den, som en pil. Det har to fordele ved 3D-print: tandhjulet centrere sig selv på sin aksel, og det har intet aksialt tryk, fordi kræfterne i de to halvdele ophæver hinanden. Et helisk tandhjul skubber derimod sidelæns langs sin akse. Du sætter {{ui:prop.helixAngle}} og {{ui:prop.helixQuality}} som for det heliske tandhjul; vinklen gælder for hver halvdel. To kongegear griber når de har samme modul og samme vinkel med modsatte fortegn, én positiv og den anden negativ. Der er ingen rille i midten, som på fræsede kongegear: de to halvdele løber ind i hinanden uden et trin. Kantværktøjet og STEP-eksporten tager kongehjulet som et trekantnet, ikke som en eksakt form.

Det koniske tandhjul tager de evolvente tænder og gør dem mindre mod toppen. Det er en tilnærmelse, ikke et præcist udregnet konisk par.

{{ui:gear.profileRound}} er runde tænder lavet af buer, som Tinkercads Useful gear: spids og mellemrum løber ind i hinanden uden et hjørne. Små tandhjul printer mere tilgivende på den måde og drejer lettere, og på en knop giver tænderne et behageligt greb. Runde tænder sættes også af {{ui:prop.teeth}}, {{ui:prop.gearModule}} og {{ui:prop.gearBacklash}}; de har ingen trykvinkel. De står lavere end evolvente tænder, så den udvendige diameter er modul × (tænder + 1,2). Runde tandhjul med samme modul griber, ved samme centerafstand som evolvente; med et evolvent tandhjul passer de ikke.

{{ui:gear.profileSimple}} er de lige tænder alle tandhjul havde før. Der sætter du {{ui:prop.toothSize}} og {{ui:prop.toothWidth}} i hånden. Ældre designs beholder dem indtil du ændrer tandformen. Alle tre tandformer har {{ui:prop.centerHole}}.

{{ui:gear.internal}} har sine tænder der peger indad: en ring som et mindre tandhjul kører inden i, som det yderste hjul i et planetgear. Du sætter det som et evolvent eller rundt tandhjul med {{ui:prop.teeth}}, {{ui:prop.gearModule}} og {{ui:prop.gearBacklash}}, plus {{ui:prop.gearRim}}, ringen uden om tænderne. Dets udvendige diameter er modul × (tænder + 2,5) plus to gange rimen, med runde tænder modul × (tænder + 1,7). Et tandhjul med samme modul kører i det når dets centrum står (ringtænder − dets tænder) × modul / 2 fra ringens centrum; vælg begge og egenskabspanelet giver den afstand. Til et planetgear: ringtænder = soltænder + 2 × planetænder, for eksempel 30 = 12 + 2 × 9. Et ringgear har intet centerhul, det er selve ringen. Mellem 26 og 33 tænder er dets spidser op til en kvart modul kortere, fordi en lille kant ellers ville dannes ved delecirklen; gribning påvirkes ikke.

{{ui:gear.rack}} er tandhjulet med uendelig radius: en stang med tænder langs den ene side, hvis flanker er lige linjer ved trykvinklen med evolvente tænder. Dens bredde (langs X) er tænder × deling, delingen er π × modul, så racks af samme modul står på linje ende mod ende, hver ende i et mellemrum. Dens længde (langs Y) er stangens tykkelse og fri, så længe tænderne og en halv millimeter stang er der. Tænderne peger fremad, mod startsidevisningens beskuer; drej racken som du har brug for. Et tandhjul med samme modul ruller på det når dets centrum står dets tænder × modul / 2 foran delelinjen; delelinjen ligger et modul bag tandspidserne, 0,6 modul med runde tænder. Ringgear og rack kommer med evolvente og med runde tænder, ikke med simple; at skifte tandhjulstype bevarer modulet.

Kantværktøjet og STEP-eksporten tager hvert tandhjul som dets eksakte form, evolvente flanker som glatte kurver. Et helisk tandhjul på et ovalt fodaftryk forbliver et trekantnet, og det samme gør et helisk tandhjul med evolvente tænder fra omkring 31 tænder. Små tænder begrænser hvor meget kanterne kan rundes: på et tandhjul med simple tænder, 30 mm over med 12 tænder er det flade mellem to tænder ved foden kun omkring 0,65 mm bredt, så at runde hver kant virker op til omkring 0,5 mm, og på et konisk tandhjul, hvis top er mindre, op til omkring 0,4 mm. Et helisk tandhjuls tænder hælder, hvilket gør det flad smallere på tværs af dets skrånende kanter: jo større helixvinklen mod tandhjulets højde er, jo mindre er den runding der passer. Kanterne på dets to flade ender kan rundes, men at fase kun de kanter fejler i CAD-kernen; rund dem, eller fas alle kanter sammen ved en mindre størrelse, såsom 0,2 mm.

## Fjedre

{{ui:shape.spring}} har {{ui:prop.turns}} og en {{ui:prop.wire}}. Sammen med højden bestemmer de hvor blød fjederen er. {{ui:prop.springHand}} sætter hvilken vej wiren løber: {{ui:spring.right}} som en almindelig trykfjeder, eller {{ui:spring.left}}.

Kantværktøjet og STEP-eksporten tager en fjeder som dens eksakte form: en rund wire langs en helix, skåret firkantet i begge ender. Du kan runde eller fase de to wire-ender, for eksempel.

## Bøjede rør

Et {{ui:shape.bentTube}} består af op til tolv sektioner: et lige stykke efterfulgt af en bøjning. For hver sætter du {{ui:prop.bentTubeSegmentLength}}, {{ui:prop.bentTubeBendAngle}}, {{ui:prop.bentTubeBendRadius}} og {{ui:prop.bentTubeRoll}}. Den sektion du redigerer er fremhævet med orange på røret, så du kan følge rækkefølgen. En rullevinkel på 0° bøjer inden for arbejdsplanets plan, ved 90° bøjer røret opad. Profilen kan være rund, firkantet, sekskantet eller ottekantet, indersiden ligeledes, eller helt solid. Hvis røret løber ind i sig selv, advarer layerling dig.

## Loft

{{ui:shape.loft}} forbinder et omrids forneden med et foroven, som et loft i Fusion: en slangeadapter fra én diameter til en anden, en firkantet blæser på en rund kanal, et stativ der bliver rundt mod toppen. For hver ende vælger du {{ui:prop.loftBottomOutline}} og {{ui:prop.loftTopOutline}}: {{ui:loft.round}}, {{ui:loft.rectangle}} med {{ui:prop.loftBottomCorner}}, eller {{ui:loft.polygon}} med dets antal hjørner, plus bredden og længden af hver ende og højden. {{ui:prop.loftOffsetX}} og {{ui:prop.loftOffsetZ}} flytter topenden sidelæns for en skrå overgang; bundenden bliver hvor den er.

{{ui:prop.loftWall}} laver en slange åben i top og bund. Åbningen er mindre med væggen i begge ender, målt over; hvor væggen hælder er den lidt tyndere. Træk rammen større og begge ender vokser med, mens hjørneradius og væg beholder deres størrelse.

{{ui:prop.loftSmooth}} gør overgangen glat. Ved 0 løber siderne lige fra bunden til toppen, som på en kegle. Ved 100 forlader de begge ender lige op og ændrer størrelse ind imellem langs en S-kurve: en slangeadapter der blødt udvider sig fra et smalt til et bredt rør, i stedet for at løbe som en tragt. Ind imellem blander skyderen de to. En glat overgang virker sammen med {{ui:prop.loftWall}}, en snoing, en hældning og et sidelæns offset; et rør med en væg forbliver åbent i begge ender. Det er en eksakt form som den lige, så dens kanter kan fases og rundes, men den bygges gennem flere sektioner og tager lidt længere at beregne.

{{ui:prop.loftTwist}} drejer sektionen jævnt om den lodrette på vej op, op til 360° hver vej; siderne snor sig så rundt. {{ui:prop.loftTiltX}} og {{ui:prop.loftTiltZ}} hælder topenden, op til 45°: en positiv værdi hæver dens forkant eller dens højre side. Sektionerne ind imellem hælder med deres andel, så væggen løber glat ind i hældningen. Det højeste punkt bliver ved den satte højde. Hvis højden senere bliver så lille at den hældende ende ville nå under pladen, giver hældningen efter indtil den passer. En bøjning langs en sti, såsom et rørbøjning, er ikke noget loftet gør.

Loftet er en eksakt form, snoet og hældende også: dens kanter kan fases og rundes, og STEP-eksporten bevarer det. Tilføj en flange med skruehuller som sædvanligt og gruppér dem.

## Hængsel

{{ui:shape.hinge}} printer i ét stykke og bevæger sig bagefter (print-in-place): to blade der ligger åbne fladt på pladen, med skiftende led på én akse mellem dem. Pinden hører til det bagerste blad og løber med spil gennem det forreste blads led. Du sætter {{ui:prop.hingeLength}}, {{ui:prop.hingeOpenWidth}} og {{ui:prop.hingeKnuckleDiameter}}, plus antallet af {{ui:prop.hingeKnuckles}} (ulige, så pinden holdes i begge ender), {{ui:prop.hingePinDiameter}} og {{ui:prop.hingeLeafThickness}}.

{{ui:prop.hingeClearance}} er mellemrummet mellem de bevægelige dele: omkring pinden, mellem leddene og foran bladene. Med 0,4 mm løsner en veljusteret printer sig normalt med et lille twist; hvis delene fusionerer, hæv det, hvis det vakler for meget, sænk det. Print hængslet liggende som det ser ud på pladen, uden støtte. Du kan tilføje huller til bladene eller gruppere dem ind i en større del, såsom et låg.

## Rifling

{{ui:shape.knurl}} er et rundt greb med riller hele vejen rundt, til knopper, fingerhjul og værktøjshåndtag. Under {{ui:prop.knurlPattern}} vælger du {{ui:knurl.straight}}, riller langs aksen som på en kontrolknop, {{ui:knurl.diamond}}: to skrånende rækker af riller krydser til små diamanter, eller {{ui:knurl.round}}: riller og rygge langs aksen som en blød bølge af buer, et behageligt greb uden skarpe rygge. Runde riller forbliver smallere end halvdelen af delingen, ellers ville rygge bule ud ved foden; en for stor dybde giver efter. Du sætter {{ui:prop.diameter}} og {{ui:prop.height}}, antallet af {{ui:prop.knurlCount}} og {{ui:prop.knurlDepth}}; for krydset rifling også {{ui:prop.knurlAngle}} til aksen. {{ui:prop.knurlChamfer}} bryder begge ender ved 45 grader, som på en drejet knop; 0 lader dem være skarpe.

Lige og rund rifling er eksakte former, så deres kanter kan brydes og rundes. Krydset rifling forbliver et net, fordi det som eksakt form ville tage næsten et minut at beregne med 30 riller. Til en knop på en aksel, gruppér rilringen med et hul, såsom et {{ui:shape.thread}} sat som gevindhul. Riller smallere end 0,4 mm printer næsten ingen printer rent, og layerling sætter dem ikke tættere end 0,8 mm rundt om grebet: et tyndt greb får færre af dem.

## Svalehale

{{ui:shape.dovetail}} er samlingen hvor to dele låser ind i hinanden og kun kan skydes sammen sidelæns. Du sætter bredden ved den brede ende, {{ui:prop.dovetailNeckWidth}} og længden af halen. Kopiér halen til den anden side og gør kopien til et hul: {{ui:prop.dovetailClearance}} giver så lidt spil så samlingen ikke klemmer efter print.

> **Tip:** Et gevindhul skærer ind i den del det overlapper når det grupperes. Så placér det lidt ind i materialet i stedet for kun at røre overfladen.

## Dråbehul

Dråbehullet er et hul der er rundt i den ene ende og spidst tilspidset i den anden. Det bruges til boringer der står vandret i en 3D-printet del, fordi det spidse øverste giver mindre overhæng end et lige hul ville have. Det er et hul som ethvert andet: læg det i din form og gruppér.

## Forsænkning og undersænkning

{{ui:shape.counterbore}} er et hul med en bred, plan forsænkning i toppen, til en skrue med et unbrakonav. {{ui:shape.countersink}} er et hul der konusformes ned fra toppen, til en skrue med undersænket hoved. Begge er huller, og i indstillingerne sætter du hovedets diameter, skaftets diameter, dybden af forsænkningen eller konusvinklen.

> **Tip:** Ligesom gevindhuller, så læg forsænkninger og undersænkninger lidt ind i materialet når de overlapper en kant af den del de er i, ellers skærer de ikke helt.
