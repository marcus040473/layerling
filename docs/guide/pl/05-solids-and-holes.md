---
title: Bryły i otwory
summary: Jak z prostych kształtów powstają otwory, rowki i kieszenie i jak później zmienić grupę.
---

To najważniejsza idea w layerling i szybko ją opanujesz: **każdy kształt jest albo bryłą, albo otworem.** Bryła zostaje. Otwór to narzędzie, które usuwa materiał.

## Bryła czy otwór

Zaznacz kształt i kliknij w jego ustawieniach {{ui:inspector.solid}} albo {{ui:inspector.hole}}. Klawiaturą jest szybciej: [[H]] zmienia zaznaczenie w otwór, [[S]] z powrotem w bryłę. Oba polecenia są też w menu otwieranym prawym kliknięciem na bryle. Otwór jest pokazywany jako przezroczysty, żebyś widział, gdzie leży. [[T]] robi bryłę przezroczystą, na przykład żeby zajrzeć do obudowy, a drugie naciśnięcie przywraca ją do nieprzezroczystej. Działa na całe zaznaczenie: jeśli któraś bryła jest już przezroczysta, wszystkie stają się nieprzezroczyste, w przeciwnym razie wszystkie stają się przezroczyste.

Dopóki nic nie jest zgrupowane, z otworem nic się nie dzieje. Po prostu leży i pokazuje, gdzie coś później zniknie.

![Walec jest otworem. Wystaje nad górną ścianę sześcianu, żeby przeciąć go na wylot.](shot:hole-before)

## Grupowanie

Zaznacz bryły i otwory, a potem kliknij {{ui:editor.tool.group}} ([[Ctrl]]+[[G]]). Teraz otwory usuwają materiał z brył, których dotykają. Zostaje jeden nowy kształt.

![Wynik: sześcian z otworem na wylot.](shot:hole-after)

Tak powstają:

- **Otwory na wylot:** walec jako otwór przechodzący przez bryłę.
- **Rowki:** wydłużony prostopadłościan jako otwór przy krawędzi.
- **Kieszenie:** otwór, który nie przechodzi na wylot.
- **Gwinty w części:** otwór gwintowany jako otwór, zobacz [Gwinty i mechanika](chapter:threads-and-mechanics).

Jeśli w grupie jest kilka brył, łączą się. Dwie bryły, które się stykają, stają się jedną częścią.

Z grupą możesz postępować jak z kształtem: przesuwać, obracać, kolorować, grupować dalej. {{ui:editor.tool.ungroup}} ([[Ctrl]]+[[Shift]]+[[G]]) ją rozwiązuje i pojedyncze części wracają.

### Grupa jako otwór

Cała grupa też może być bryłą albo otworem. Obowiązuje prosta zasada:

- Jeśli grupa składa się tylko z brył (albo tylko z otworów), przełączasz ją w całości, a jej części idą za nią.
- Jeśli zawiera jedno i drugie, na przykład sześcian z otworem, każda część zachowuje własny stan. Cała grupa staje się wtedy narzędziem, ale otwór zostaje otworem.

## Zestaw

Czasem części mają tylko trzymać się razem, nie stając się jednym, na przykład białe logo na czarnej płytce do druku wielokolorowego. Do tego służy {{ui:editor.tool.bundle}} ([[Ctrl]]+[[B]]), jak w Tinkercadzie. Zestaw przesuwa się, obraca i zmienia rozmiar jak kształt, ale nic się nie scala:

- Każda część zachowuje swój kolor i zostaje bryłą albo otworem.
- Otwory niczego nie wycinają.
- W eksporcie STL, 3MF lub OBJ każda część jest osobną bryłą, a w 3MF i OBJ ze swoim kolorem.

{{ui:editor.tool.ungroup}} ([[Ctrl]]+[[Shift]]+[[G]]) rozkłada zestaw z powrotem, a [[E]] otwiera go do edycji jak grupę. Fazowanie, zaokrąglenie i drążenie nie działają na zestawie, bo nie jest on jedną bryłą: w tym celu go zgrupuj albo pracuj na jego częściach po kolei. Gdy zgrupujesz zestaw z innymi częściami, jego otwory wycinają te części, ale nadal nie własne bryły zestawu, jak w Tinkercadzie. Dlatego na przykład kołek z otworem obok niego można jako zestaw używać raz po raz. Jeśli otwór w zestawie ma wycinać także własne bryły zestawu, rozłóż zestaw i zgrupuj jego części ([[Ctrl]]+[[G]]).

## Część wspólna

{{ui:editor.tool.intersect}} zostawia tylko to, co dwie lub więcej brył mają wspólnego. Połóż na sobie dwa nachodzące na siebie kształty, zaznacz oba i kliknij ten przycisk. Tak z walca i prostopadłościanu powstaje element z jednym bokiem okrągłym, a drugim prostym. Grupa liczy się tak, jak wygląda, razem z otworami. Jeśli zaznaczony jest też otwór, zostaje to, co wszystkie bryły mają wspólnego ze wszystkimi otworami. Jeśli kształty nie mają nic wspólnego, nic się nie zmienia, a komunikat o tym informuje. Obok {{ui:editor.tool.intersectPreview}} pokazuje część wspólną, zanim ją zastosujesz: zaznaczone kształty stają się przezroczyste, a to, co mają wspólnego, jest rysowane na zielono. Zaznaczaj i przesuwaj każdy kształt osobno, a zielona część za nim podąża. {{ui:editor.tool.intersect}} ją stosuje, [[Esc]] zamyka podgląd.

## Wycinanie jednej bryły z drugiej

Przy częściach, które mają do siebie pasować, wał w tulei albo śruba w obudowie, robisz jedną część i wycinasz ją z drugiej. Zaznacz obie bryły i kliknij {{ui:editor.tool.cutOut}} w obszarze {{ui:editor.group.combine}} albo kliknij prawym przyciskiem i wybierz to tam. Panel podaje część, która zostaje, i bryłę, która dostaje wnękę; layerling bierze mniejszą za część, a {{ui:cutOut.swap}} to odwraca. {{ui:cutOut.clearance}} powiększa wnękę wokół części o tyle: 0 pasuje dokładnie, 0,2 mm to zwykły luz dla wydrukowanego pasowania. {{ui:cutOut.apply}} wycina kopię części z drugiej bryły i zostawia samą część tam, gdzie jest. Wynikiem jest grupa: {{ui:editor.tool.ungroup}} znów rozdziela wycięcie. Luz wymaga, żeby część była dokładną bryłą, jak przy narzędziu {{ui:editor.tool.offset}}, którego to używa.

## Edycja grupy

Jeśli otwór wyszedł za mały, nie musisz rozwiązywać grupy i budować jej od nowa. Zaznacz grupę i kliknij {{ui:group.edit}} w jej ustawieniach, ikonę folderu na liście obiektów albo naciśnij [[E]]. Dwukrotne kliknięcie grupy robi to samo, jak w Tinkercadzie, także na zestawie. Jeśli wolisz tego uniknąć, wyłącz w ustawieniach {{ui:workspace.doubleClickOpensGroup}}. Część zaczyna się przesuwać dopiero wtedy, gdy wskaźnik przesunie się o kilka pikseli, więc drżące kliknięcie albo dwuklik jej nie poruszy. Części leżą teraz osobno i zmieniasz je każdym narzędziem: powiększasz otwór, przesuwasz bryłę, dodajesz otwór.

![Grupa w trakcie edycji: pasek na dole zawiera Anuluj i Gotowe, a lista obiektów pokazuje części.](shot:open-group)

Na dole obrazu pojawia się pasek. {{ui:group.done}} odbudowuje grupę z jej nazwą, kolorem i stanem bryły albo otworu. {{ui:common.cancel}} przywraca ją bez zmian.

Jeśli jedna z części sama jest grupą, możesz ją edytować w ten sam sposób, i tak dalej, tak głęboko, jak sięga Twój projekt. Pasek pokazuje, gdzie jesteś, na przykład „Wspornik › Tuleja śruby”. {{ui:group.done}} i {{ui:common.cancel}} zawsze kończą najgłębiej położoną grupę i wracają o jeden poziom wyżej. Dopóki jesteś wewnątrz grupy, możesz edytować tylko grupy spośród jej części. Aby edytować inną, najpierw zakończ bieżącą.

W przeciwieństwie do {{ui:editor.tool.ungroup}}, który rozkłada grupę na dobre, edycja zachowuje grupę: jej nazwa i ustawienia zostają, a przyciskiem {{ui:common.cancel}} zawsze możesz wrócić.

Uwaga: zaokrąglenia i fazki nałożone na **całą** grupę przepadają przy odbudowie. Pasek o tym informuje.

## Dzielenie

{{ui:editor.tool.split}} w sekcji {{ui:editor.group.modify}} przecina zaznaczenie na dwie części płaszczyzną, na przykład część za dużą na stół drukarki albo taką, do której wnętrza chcesz zajrzeć. Zaznacz jedną lub więcej brył albo otworów i kliknij ten przycisk. Półprzezroczysta płaszczyzna pokazuje dokładnie, gdzie pójdzie cięcie, a biała linia zaznacza je na samych bryłach, tam, gdzie spotyka je płaszczyzna. Nic się nie zmienia, dopóki go nie zastosujesz.

- {{ui:split.orientation}}: **X** robi pionowe cięcie między lewą a prawą stroną, **Y** między przodem a tyłem, **Z** poziome cięcie między górą a dołem. Osie są nazwane tak jak na karcie Pozycja, z Z w górę. Płaszczyzna zaczyna równolegle do płaszczyzny roboczej, więc na płycie bazowej od Z.
- {{ui:split.workplane}}: {{ui:split.workplaneParallel}} kładzie płaszczyznę równolegle do płaszczyzny roboczej, {{ui:split.workplaneAcrossX}} i {{ui:split.workplaneAcrossY}} ustawiają ją prostopadle, w poprzek jej kierunku X lub Y. Jeśli początek płaszczyzny roboczej przecina zaznaczenie, płaszczyzna przechodzi przez niego, w przeciwnym razie przez środek. Tak kładziesz płaszczyznę roboczą klawiszem [[W]] na pochyłej ścianie i tniesz dokładnie tam, bez kręcenia suwakami obrotu.
- {{ui:split.position}}: miejsce, w którym przecina płaszczyzna, ustawiane suwakiem albo wpisywane. Zaczyna na środku. Możesz też przeciągnąć grot strzałki na płaszczyźnie, a płaszczyzna przesuwa się wzdłuż strzałki co 0,1 mm.
- {{ui:split.pickFace}}, przycisk obok położenia, kładzie płaszczyznę na ścianie: kliknij go, potem kliknij ścianę. Orientacja, oba obroty i położenie ustawiają się odpowiednio. Podczas wybierania niebieska płaszczyzna pod wskaźnikiem pokazuje, którą ścianę weźmie. Działa też ściana bryły, która nie jest zaznaczona, żeby wyrównać do niej cięcie, ale płaszczyzna zostaje w obrębie zaznaczenia. [[Esc]] przerywa wybieranie i zostawia płaszczyznę tam, gdzie była.
- Dwa suwaki obrotu poniżej obracają płaszczyznę wokół pozostałych dwóch osi, do 180° w każdą stronę, do cięcia pod kątem. Można je łączyć.

{{ui:split.apply}} albo [[Enter]] wykonuje cięcie, [[Esc]] anuluje (podczas wybierania ściany pierwsze [[Esc]] tylko przerywa wybieranie). Każdy obiekt, który przecina płaszczyzna, staje się dwiema zamkniętymi bryłami, nazwanymi według swojej strony, na przykład „Prostopadłościan (Z+)” i „Prostopadłościan (Z-)”. Obiekty, których nie przecina, zostają bez zmian. Otwór staje się dwoma otworami, a wydrążona bryła zachowuje swoją wnękę. Obie połowy zostają tam, gdzie były. Do druku połóż każdą na ścianie cięcia przez {{ui:editor.tool.layFlat}}.

Połowy są zwykłymi siatkami: ustawienia takie jak liczba boków walca albo napis tekstu znikają, więc ustaw je wcześniej. [[Ctrl]]+[[Z]] przywraca oryginał jednym krokiem. Zablokowanych i ukrytych obiektów nie da się podzielić.

## Rozdzielanie części

Jeśli kształt składa się z kilku oddzielnych kawałków, na przykład tekst z pojedynczych liter, {{ui:inspector.separateParts}} dzieli go na niezależne kształty. Ta pozycja jest też w menu otwieranym prawym kliknięciem na kształcie.

> **Wskazówka:** Zawsze rób otwory trochę dłuższe niż część, przez którą mają przejść. Jeśli otwór kończy się dokładnie na równo ze ścianą, czasem zostaje cieniutka błonka. Milimetr zapasu załatwia sprawę.
