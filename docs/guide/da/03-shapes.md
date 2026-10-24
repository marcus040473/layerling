---
title: Placering og justering af former
summary: Formbiblioteket, dimensioner med tal og håndtag, farve, rotation, spids og snoing.
---

Enhver del i layerling starter med en form. Af dem bygger du alt andet: former supplerer hinanden, skærer hinanden ud eller samles til en ny form.

## Tilføj en form

Klik på {{ui:editor.addShape}} i båndet. Formbiblioteket åbnes.

![Formbiblioteket. Hvert lille billede er gengivet fra formens virkelige geometri.](shot:shape-menu)

Biblioteket lukker efter hver form, du vælger. Med titellinjen flytter du det derhen, hvor det ikke dækker det sted, du sigter mod, for eksempel over panelet Egenskaber; et dobbeltklik på titellinjen sætter det tilbage under sin knap, og hvor du lod det stå, husker browseren. Nålen i titellinjen holder biblioteket åbent, mens du sætter flere former efter hinanden. Med kanter og hjørner trækker du dens størrelse op, så bred og høj, som din skærm tillader; den husker browseren også, og et dobbeltklik på en kant sætter den tilbage. Trækker du biblioteket smalt, udelader det navnene og viser kun billederne; navnet vises, når du peger på en form.

Vælg en form. Den hænger nu på din musemarkør og lander hvor du klikker. Flyt den over en form og den lægger sig ned på fladen under markøren, også skrå, ligesom Cruise i Tinkercad; over den tomme plade lander den på arbejdsplanet. [[Esc]] annullerer placering. Et værktøj der venter på et klik, såsom målebåndet, vinkelmåleren, en note, {{ui:camera.placeWorkplane}}, {{ui:editor.tool.layFlat}} eller kantværktøjerne, slås fra når du vælger en form, så klikket placerer formen. Den anden vej, hvis du slår et af disse værktøjer til, lægger formen sig ned igen. Hvis du hellere vil have formen til at dukke op i midten af pladen, kan du slå placering ved klik fra i indstillingerne (område {{ui:workspace.appearance}}, kontakt {{ui:workspace.cruise}}).

Hvad biblioteket tilbyder:

- **Basiske former:** {{ui:shape.box}}, {{ui:shape.roundedBox}}, {{ui:shape.cylinder}}, {{ui:shape.slot}}, {{ui:shape.ellipse}}, {{ui:shape.polygon}} (tre til fireogtyve sider), {{ui:shape.sphere}}, {{ui:shape.cone}}, {{ui:shape.pyramid}} (med tre til fireogtyve sider, så også tresidet), {{ui:shape.wedge}}, {{ui:shape.roundRoof}}, {{ui:shape.halfSphere}} og {{ui:shape.torus}}.
- **Rør:** {{ui:shape.tube}} og {{ui:shape.bentTube}}, lavet af op til tolv lige stykker med bøjninger ind imellem, og {{ui:shape.loft}} fra ét omrids til et andet, for eksempel fra firkant til rundt.
- **Dekorative former:** {{ui:shape.star}}, {{ui:shape.heart}} og {{ui:shape.crescent}}.
- **Bogstaver:** {{ui:shape.text}}, også langs en cirkelbue. Mere i [Tekst](chapter:text).
- **Mekanik:** {{ui:shape.thread}} (gevindstang, skrue, møtrik og gevindhul), {{ui:shape.spring}}, {{ui:shape.gear}} og {{ui:shape.knurl}} til greb. Mere i [Gevind og mekanik](chapter:threads-and-mechanics).
  Gridfinity-bakke og -grundplader vælger du med {{ui:shape.gridfinity}}.
- **Til konstruktioner:** det print-in-place {{ui:shape.hinge}}, {{ui:shape.dovetail}}, {{ui:shape.teardrop}} til vandrette huller, {{ui:shape.counterbore}} og {{ui:shape.countersink}} til skruehoveder og {{ui:shape.ruler}}, som kun er et måleværktøj og aldrig vises i en eksport.

Du får en trekant på to måder: {{ui:shape.polygon}} med tre sider er en ligebenet trekant, Tinkercads "Roof", og {{ui:shape.wedge}} er en retvinklet trekant. Begge er ægte trekantede prismer. For et trekantet hul, kopier formen, gør kopien mindre, markér den som et hul og justér den med {{ui:editor.tool.centerOnWorkplane}} eller {{ui:editor.tool.align}}. Begge arbejder med formens begrænsningsboks, den mindste kasse der omslutter den, så en halveret firkant stadig tæller som en hel firkant. Kommandosøgningen ([[Ctrl]]+[[K]]) finder også begge former under "triangle" eller "roof".

{{ui:shape.slot}} kan være smallere i den ene ende end den anden, for eksempel til en afskærmning over en rem mellem to remskiver. Under {{ui:inspector.properties}} sæt {{ui:prop.slotSmallEnd}}; den store ende er lige så bred som kapslen, og siderne løber lige fra den ene bue til den anden. {{ui:prop.slotCentreDistance}} er afstanden mellem de to buers centre, det er hvor langt fra hinanden remskiverne er. Skift den lille ende og centerafstanden bevares, kapslen bliver længere eller kortere. Den spidse kapsel forbliver også en eksakt form, til runder og STEP.

## Formens indstillinger

Så snart en form er valgt, vises dens indstillinger til højre. Øverst er navnet; blyanten ved siden af ({{ui:outliner.rename}}) lader dig taste et nyt. [[Enter]] beholder det, [[Esc]] annullerer, og et tomt navn bringer formens standardnavn tilbage. Længere til højre, hængelåsen låser formen mod utilsigtet flytning og øjet skjuler den. Pilen yderst til venstre folder indstillingerne ned til deres titellinje.
Kortene nedenfor folder ud og ind ved et klik på deres titel ({{ui:inspector.properties}}, {{ui:inspector.position}}, {{ui:inspector.rotation}}, {{ui:inspector.taper}}, {{ui:inspector.twist}} og kortene til de særlige former); layerling husker hvilke du lod åbne, til næste form og næste besøg.

Indstillingerne sidder docket ved højre kant. Hvis de dækker noget du vil se, så træk dem i deres titellinje og de flyder hvor du slipper dem; de bliver der for den næste form også. Slip dem tilbage øverst til højre, eller dobbeltklik titellinjen, og de docker igen. Mens de flyder eller er foldet ned, flytter snap-trinnet sig fra bunden af indstillingerne til nederst til højre på arbejdsplanet.

![Indstillingerne for en cylinder: solid eller hul, diameter og højde som tal og som skyder.](shot:editor-overview)

- **{{ui:inspector.solid}} eller {{ui:inspector.hole}}:** En solid bliver, et hul tager materiale væk. Et klik på {{ui:inspector.solid}} åbner farverne; dine egne farver du blander der venter under {{ui:inspector.recentColors}} bagefter, de seneste otte. Mere i [Solider og huller](chapter:solids-and-holes). Knappenålen i rækken {{ui:inspector.keptColors}} gemmer den valgte farve for altid: Den står i en række for sig, nyere farver skubber den aldrig ud, og den samme nål slipper den igen; op til 21 farver gemmes i denne browser.
- **{{ui:inspector.transparent}}:** Lader dig se igennem formen, for eksempel for at finde en form bag den.
- **{{ui:inspector.multicolor}}:** Kun for en gruppe; [[Shift]]+[[M]] slår den til. Slået til vises hver del af gruppen i sin egen farve, også i en gruppe der er skåret med huller til én form (væggene et hul efterlader tager farven på den form de er skåret ind i). At vælge en farve for gruppen slår det fra og farver hele gruppen. Bundter beholder altid deres deles farver. I en 3MF-eksport beholder hver del sin farve, så sliceren kan mappe delene til filamenter; OBJ bærer farverne på sine punkter, så kanten mellem to farver er lidt grovere der.
- **{{ui:inspector.properties}}:** Dimensionerne og alt hvad der hører til denne form. For en cylinder diameter, højde og antal sider. For et tandhjul tænderne, for en fjeder vindingerne. En værdi du har flyttet væk fra dens standard får en lille pil ved siden af sit navn: et klik tager kun den værdi tilbage, uanset hvad du ellers har gjort siden, i modsætning til Fortryd. Trukket med musen snapper en længdes skyder til snap-trinnet, så en højde bliver i hele millimeter (ikke med gitteret fra, og ikke på korte skydere); en tastet værdi og piletasterne på skyderen forbliver nøjagtige. {{ui:inspector.saveDefaults}} nederst gør de aktuelle værdier til startværdier for denne formtype (det samme som {{ui:workspace.shapeDefaults}} i indstillingerne), og {{ui:inspector.resetDefaults}} går tilbage til appens egne.
  For et rundt rør eller en ring er det {{ui:prop.outerDiameter}}, {{ui:prop.innerDiameter}} (til en bøsning på en aksel med kendt størrelse) og vægtykkelsen: to af dem giver den tredje, i den rækkefølge du taster dem. Den ydre diameter bevarer boringen og ændrer væggen, den indre diameter bevarer den ydre og ændrer væggen, og en boring bredere end røret får den ydre diameter til at vokse med væggen. Rørets længde er dets højde. Et rør der ikke er rundt, efter at du har trukket en af dets sider, har siderne Længde og Bredde i stedet for den ene ydre diameter; der forbliver væggen, når du ændrer bredden.
- **{{ui:inspector.makeEllipse}}:** Kun på en cylinder. En cylinder er altid rund: den har én diameter, og hvert håndtag ændrer begge sider sammen. For en oval, klik her og den bliver til en {{ui:shape.ellipse}} - den samme form, hvis længde og bredde du så sætter én ad gangen. En cylinder med fas, rund eller væg, eller en vendt eller grupperet, kan ikke ændres på denne måde; tag {{ui:shape.ellipse}} fra starten til dem.
- **{{ui:inspector.taper}}:** Forskellige størrelser foroven og forneden, for eksempel til en hældning eller en tragt.
- **{{ui:inspector.twist}}:** Snoer toppen mod bunden eller flytter den sideværts. Det giver snoede søjler og hældende tårne.

![En gruppe af en orange blok, en blå pind og et hul, skåret til én form. Med Multicolor slået til, forbliver pinden blå, blokken orange, og hullets vægge tager blokkens farve.](shot:group-multicolor)

Spids og snoing virker på næsten alle former. Kun tandhjulet, gevindet, fjederen, riflingen, hængslet, pyramiden, bøjede rør, dråbehullet, skruehovedskærerne og linealen udelader dem: de har faste mål af deres egne eller, som pyramiden, en top af sin egen i forvejen.

![En kegle hvis topradius og højde blev ændret: en lille pil ved hver tager værdien tilbage, og de to knapper nederst gemmer eller nulstiller formens standarder.](shot:property-reset)

{{ui:inspector.saveDefaults}} husker det, du har ændret på denne form, som start for hver ny form af samme slags: målene, formens indstillinger og dens farve. Farv en cylinder grøn og tryk på knappen, så er hver cylinder, du tilføjer bagefter, grøn; de andre slags beholder deres egne farver. {{ui:inspector.resetDefaults}} stiller slagsen tilbage til det, programmet starter den med. Hvilke slags der har egne standarder, er markeret i indstillingerne under {{ui:workspace.shapeDefaults}}. Et nyt design, du starter fra startsiden, begynder også med dem; værdierne huskes i denne browser.

En spids eller hældende kasse, cylinder, ellipse, polygon, rør eller ring bevarer sin eksakte form, og det samme gør kapslen, stjernen, hjertet, halvmånen, svalehalen og en rundet kasse uden rundede top- og bundkanter: fas og rund virker på den som på den almindelige form, og STEP-eksporten skriver den. Det samme gælder for en snoet form: dens tværsnit drejer nøjagtigt når det stiger, og siderne snor sig jævnt fra bund til top.

At taste er mere nøjagtigt end at trække. Alle talfelter tager millimeter, men også procenter: tast "50 %" ind i en bredde på 40 mm og du får 20 mm. De beregner også: "15*3", "120-2*4" eller "(40+2)/2" giver 45, 112 og 21; x virker i stedet for *. Feltet husker beregningen, i egenskabspanelet såvel som i dimensionsboksene omkring den valgte form: klik ind i det igen senere og formlen står der i stedet for tallet, så længe værdien stadig passer til den, og du ændrer den på stedet, "(140+2)/2" bliver til "(40+6)/2". Træk formen i et håndtag eller skalér den og formlen passer ikke mere, så feltet viser kun tallet igen. I et talfelt, du har klikket på, ændrer musehjulet og tasterne [[↑]] og [[↓]] værdien et trin, med [[Shift]] et større trin og med [[Alt]] et finere.

### Vælg farver

Et klik på {{ui:inspector.solid}} i egenskaberne for en form åbner farvekortet, med overskriften {{ui:inspector.shapeColor}}. Øverst viser det hexværdien af den farve, formen har nu. Under det ligger palettens færdige farver; et klik på en farver formen og lukker kortet.

{{ui:inspector.custom}} åbner browserens farvevælger, til en farve af dine egne. Hvad den tilbyder afhænger af browseren: i Chrome og Edge har den et farvefelt, en skyder for nuancen, en pipette der tager en farve fra hvor som helst på skærmen, og værdien som HEX, RGB eller HSL, som du skifter mellem med pilene ved siden af den. Farven tæller, når du lukker vælgeren eller klikker uden for den.

En farve af dine egne, du blander der, venter bagefter under {{ui:inspector.recentColors}}, de seneste otte. Knappenålen i rækken {{ui:inspector.keptColors}} gemmer den valgte farve for altid: den står i en række for sig, nyere farver skubber den aldrig ud, og den samme nål slipper den igen; op til 21 farver gemmes i denne browser. Nålen er til farver af dine egne, palettens farver er altid der. Med flere farver valgt, eller med et hul, er der ingen enkelt farve at gemme.

Farverne i arbejdsområdet i indstillingerne har deres egen enklere vælger, med et farvefelt, en række færdige farver og et felt til hexværdien; se [Indstillingerne](chapter:view-and-workplane).

## Hvor rund er rund? Antal sider

Runde former som cylinder, kegle, rør, ellipse eller boringer har kontakten {{ui:prop.sidesFollowSize}} og skyderen {{ui:prop.sides}} i deres egenskaber. {{ui:shape.torus}} har to skydere: {{ui:prop.torusSides}} rundt om ringen og {{ui:prop.torusSteps}} rundt om røret. De følger størrelsen der også indtil du holder dem, så en stor torus viser ingen flader. Årsagen: til visning og til STL, 3MF og OBJ tegner layerling en cirkel som en polygon af mange små sider. Jo flere sider, jo glattere er den, og jo flere trekanter bruger den.

**Hvor antallet af sider betyder noget**

- **I eksporten til sliceren** (STL, 3MF, OBJ). En cylinder med få sider ankommer der som en polygon.
- **Når former og huller kombineres.** En boring skåret af et hul med få sider er kantet i den færdige del. Det inkluderer skruehuller.
- **I visningen.** Mange meget fine former sænker editoren.

**Hvor det ikke betyder noget**

- **Til STEP-eksporten.** Den skriver den runde form, ikke polygonen.
- **Til fas og rund** ({{ui:editor.tool.chamfer}}, {{ui:editor.tool.fillet}}) så længe formen forbliver rund. Det er tilfældet når du ikke har sat et antal sider, når antallet er mindst formens standard, eller når polygonen afviger højst {{value:EXACT_ROUND_TOLERANCE}} mm fra cirklen. Standarden er {{value:ROUND_FROM_SIDES}} sider for cylinder, ellipse, rør og kegle, {{value:ROUND_FROM_ROOF_SIDES}} for {{ui:shape.roundRoof}}, {{value:ROUND_FROM_SPHERE_STEPS}} trin for {{ui:shape.sphere}}, {{value:ROUND_FROM_HALF_SPHERE_STEPS}} for {{ui:shape.halfSphere}}, {{value:ROUND_FROM_TORUS_SIDES}} sider og {{value:ROUND_FROM_TORUS_STEPS}} trin for {{ui:shape.torus}}, og en {{ui:prop.quality}} på {{value:ROUND_FROM_BENT_TUBE_QUALITY}} for et rundt {{ui:shape.bentTube}}.
- **For et gevind, en fjeder eller et helisk tandhjul.** Kantværktøjet og STEP-eksporten tager dens eksakte form; dens {{ui:prop.quality}} sætter kun hvor fint den tegnes.

**Hvor det betyder noget igen**

- **Til fas og rund på en form med få sider.** Hvis du sætter antallet af sider under standarden, tager kantværktøjet formen som den er tegnet: en cylinder med 6 sider forbliver en sekskantet stang, og runding løber rundt om dens seks kanter. Sådan kan du for eksempel bygge en møtriklomme med rundede hjørner. For en rund form, lad {{ui:prop.sidesFollowSize}} stå til.

**Sådan bruger du det**

- **Lad {{ui:prop.sidesFollowSize}} stå til.** Så vælger layerling antallet af sider ud fra diameteren så polygonen afviger højst {{value:ROUND_DEVIATION_TOLERANCE}} mm fra den sande cirkel, langt under hvad en printer opløser. Små former får mindst {{value:MIN_AUTOMATIC_SIDES}} sider, store flere.
- **Færre sider** tager du når du vil have en polygon med vilje (men der er {{ui:shape.polygon}} til det) eller når editoren bliver langsom med meget mange runde former.
- **Flere sider** har du næsten aldrig brug for. Kun på meget store runde dele, når du ser kanter i STL'en.
- **For dele du kun behandler med kanter eller giver videre som STEP,** betyder antallet af sider ikke noget.

## Arbejde med håndtagene

Ved siden af indstillingerne er der håndtag på selve formen:

- **Hjørnerne og kanterne** gør formen større eller mindre. Hold [[Shift]] mens du trækker et hjørne for at skalere bredde, dybde og højde sammen og bevare proportionerne; hold [[Alt]] for at skalere fra midten i stedet for det modsatte hjørne. Uden et tastatur, eller hvis du ikke vil holde en tast nede, så slå {{ui:inspector.keepProportions}} til øverst i egenskaberne: så bevarer hjørnerne altid proportionerne, og at taste én af bredde, dybde eller højde skalerer de to andre med den samme faktor. Indstillingen huskes.
  Trækker du en kant forbi den modsatte side, vokser formen stadig der, på den anden side af den kant. Pilen øverst gør det samme under bunden.
- **Pilen øverst** ændrer højden, håndtaget **i midten** løfter eller sænker formen.
- **De buede pile** roterer den.
- **Tallene** ved siden af formen viser dimensionerne. Et klik på én åbner et felt hvor du taster det tal du vil have. Med [[Enter]] vokser formen fra den kant der er modsat tallet, som når du trækker; med [[Alt]]+[[Enter]] vokser den omkring sin midte, så en form der var justeret med en anden forbliver justeret. Det gælder for bredde og længde; højden vokser altid opad fra undersiden. Felterne i egenskaberne til højre bevarer midten uden en tast. I et felt i egenskaberne, du har klikket på, ændrer musehjulet også værdien: en enhed pr. tak, ti gange så meget med [[Shift]], en tiendedel med [[Ctrl]] og en hundrededel med [[Alt]]. Et felt, du ikke har klikket på, overlader hjulet til panelet, som ruller.
- Et **klik på et hjørne** (uden at trække) åbner bredde og dybde sammen. Tast den første, tryk [[Tab]] for den anden og [[Enter]] for at anvende begge. [[Esc]] annullerer.

Når en form først er vendt med rette vinkler, for eksempel lagt på siden med {{ui:editor.tool.layFlat}}, navngives felterne i egenskaberne efter den retning hvert mål nu løber i: {{ui:prop.height}} er hvad der går op, {{ui:prop.width}} løber langs X og {{ui:prop.length}} langs Y. At taste højden af en form der ligger ned ændrer derfor det lodrette mål, og dens underside bliver på pladen. En form der hælder i en hvilken som helst anden vinkel viser sine egne mål i felterne, og en bemærkning nedenunder siger det.

Uden musen, brug tastaturet: piletasterne flytter markeringen med ét snap-trin (0,1 mm når gitteret er fra), med [[Shift]] med fem, eller med ti hvis du sætter {{ui:workspace.gridMajorEvery}} til {{ui:workspace.gridMajorSteps|10}} i indstillingerne under {{ui:workspace.appearance}}: så langt som den næste mørkere linje, som i Tinkercad. De følger visningen: [[→]] flytter til hvor skærmens højre er, [[↑]] væk fra dig, også efter at have vendt pladen. Skub en form ud af billedet og visningen følger med. [[Ctrl]]+[[↑]] og [[Ctrl]]+[[↓]] hæver og sænker den. [[R]] roterer 45°, [[Shift]]+[[R]] 22,5°. [[D]] lægger markeringen ned på arbejdsplanet.

Håndtagene trækker en form så stor som din plade, mindst 220 mm bred og dyb. At taste et tal i egenskaberne går ud over det, og en form der er lavet så stor krymper ikke tilbage når du griber den igen. Et loft af dit eget per form sættes i indstillingerne under {{ui:workspace.shapeDefaults}} med {{ui:workspace.customLimit}}.

Snap-trinnet er nederst til højre i editoren og kan ændres når som helst.

## Kopiering og duplikering

{{ui:editor.tool.copy}}, {{ui:editor.tool.paste}} og {{ui:editor.tool.duplicate}} er i båndet ({{ui:editor.group.clipboard}}). [[Ctrl]]+[[D]] duplikerer en markering. layerling husker hvordan du sidst flyttede eller roterede kopien og anvender det samme igen ved næste duplikering. Det giver en række huller eller trin i få tastetryk. For regelmæssige arrangementer er der også mønsteret, beskrevet i [Valg og arrangering](chapter:select-and-arrange).

> **Tip:** Hvis en form nægter at tage den størrelse du vil have, er det ofte grænserne for nye former. Under {{ui:workspace.shapeDefaults}} i indstillingerne bestemmer du hvordan hver form starter og hvor stor den må blive.

## Egne former

En holder, et greb eller en grundplade du har brug for igen og igen kommer i {{ui:myShapes.title}}. De sidder øverst i formbiblioteket, over {{ui:myShapes.basicShapes}}, og folder sig væk med deres pil.

1. Vælg en eller flere former, huller, grupper eller en importeret model inkluderet.
2. Åbn formbiblioteket og klik på {{ui:myShapes.saveSelection}}. Indtast et navn og bekræft med {{ui:common.save}}.
3. I et hvilket som helst design indsætter et klik på flisen formen, som enhver anden form. Du kan også trække flisen ind på arbejdsplanet; den lander så dér hvor du slap. Formen hænger derefter på markøren som enhver anden: Den følger den, også over andre legemers flader, et klik sætter den ned, [[Esc]] lægger den væk.

Flere former kommer tilbage sammen, placeret som de stod i forhold til hinanden, og forbliver valgbare én ad gangen. [Noter](chapter:measuring-and-notes) der er sat fast på de gemte former kommer med og kommer tilbage lukket, sat fast på de indsatte; frie noter og referencepunkter bliver i designet. Blyanten på en flis omdøber den, skraldespanden fjerner den efter at have spurgt. Former der allerede er indsat i designs forbliver som de er.

{{ui:myShapes.title}} lever i denne browser, adskilt fra designsene, og er der igen næste gang du starter. {{ui:dashboard.backupAll}} på startsiden sikkerhedskopierer dem med designsene, og åbning af sikkerhedskopien bringer begge tilbage. For kun at tage formerne til en anden browser, {{ui:myShapes.backup}} (pil ned) gemmer dem som en ZIP-fil og {{ui:myShapes.load}} (pil op) bringer dem tilbage der. {{ui:myShapes.load}} tager også enkelte `.lyl`-designs; hver bliver til en form. Former der allerede er der, tilføjes ikke to gange.

### Mapper

Mange egne former sorteres bedre i mapper. {{ui:myShapes.newFolder}} (mappen med plus ved siden af {{ui:myShapes.saveSelection}}) beder om et navn og laver en mappe øverst; mappen med plus på en mappe, {{ui:myShapes.newSubfolder}}, laver en mappe inden i den. Mapper går tre niveauer ned: En mappe på tredje niveau rummer former, men ikke flere mapper. Mapper står over de former, der ikke ligger i nogen mappe, sorteret efter navn, og foldes ud og sammen med deres pil; tallet ved en mappe tæller formerne i den og i mapperne under den. Når du gemmer, vælger du mappen i listen ved siden af navnet; med {{ui:myShapes.noFolder}} bliver formen øverst.

Mappen med pilen på en flise flytter formen til en anden mappe, eller ud igen med {{ui:myShapes.noFolder}}. Blyanten ved en mappe omdøber den, skraldespanden sletter den efter at have spurgt, sammen med mapperne og formerne i den. En mappe kan ikke selv flyttes: Lav den nye, hvor den hører hjemme, og flyt formerne derhen. En sikkerhedskopi beholder mapperne, og når den indlæses, kommer formerne tilbage på samme sted. På serveren er mapperne mapper i `Custom shapes`.

### Egne former på serveren

Med [delt serverlager](chapter:files-and-saving) slået til viser sektionen to grupper: {{ui:myShapes.onServer}} og {{ui:myShapes.inBrowser}}. Når du gemmer vælger du hvor formen skal hen; serveren er valgt til at starte med. Der ligger den i mappen `Custom shapes`, som en `.lyl`-fil for sig selv med et billede, klar på hver enhed der når serveren. Skyen på en browser-flis lægger den form på serveren; den gemmes så ikke to gange.
 Dens mapper er mapper inde i `Custom shapes`. Hver side har mapper af sine egne, og en form flytter mellem mapperne på sin side.

Mappen `Custom shapes` vises også på startsiden. Åbn en form der som et design, redigér den, og den gemmes automatisk som ethvert design på serveren; næste indsættelse tager den nye version. Da serverlageret ikke har login, ser alle der når serveren de samme former.

## Vikle rundt om en cylinder

Skal et mønster, en logo eller bogstaver på en kop, en dåse eller et rør? Læg det først fladt på pladen, som en importeret SVG eller som tekst for eksempel, som det skal se ud oppefra. Vikl det så rundt om en cylinder i formens indstillinger under {{ui:inspector.wrapCylinder}}:

1. Åbn {{ui:inspector.wrapCylinder}} og indtast {{ui:inspector.wrapDiameter}} på cylindervæggen, såsom yderdiameteren på din kop. Tiendedele millimeter virker også, såsom 63,5.
2. Klik på {{ui:inspector.wrapApply}}. Hvad der løb fra venstre til højre løber nu rundt om cylinderen, bagkanten bliver toppen, og tykkelsen står ud af væggen.
3. Vælg den viklede form og cylinderen og centrér begge, venstre mod højre og for mod bag. Midten af den viklede form er cylinderens akse, så det sidder så præcis på væggen.

Til en gravering, slå {{ui:inspector.wrapInward}} til: tykkelsen går så ind i væggen. Gør formen til et hul, centrér den og gruppér den med cylinderen.

En form der allerede er viklet, er et mesh af det viklede og kan ikke vikles igen: fortryd viklingen, eller vikl den flade original igen med en anden diameter.

Resultatet er et mesh som en importeret model. Fortryd lægger formen fladt ud igen; for en anden diameter, fortryd først og vikl igen. Det kan ikke gå længere end én gang rundt om cylinderen; så navngiver layerling den mindste diameter der passer.
