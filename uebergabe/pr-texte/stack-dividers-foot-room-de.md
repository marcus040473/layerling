**Deutsch zum Verstehen (nicht posten)**

Titel (englisch, so in den PR eintragen): „Hollow: the dividers of a stackable box end under the foot of the box above, so that box stands on the rim“
Auf Deutsch: Aushöhlen: Die Trenner einer stapelbaren Box enden unter dem Fuß der oberen Box

Zweig im Fork: `fix-stack-dividers-foot-room`

Zusammenfassung:
- Bei einer stapelbaren Box mit Trennern gingen die Trenner bis zum Rand. Der Fuß der oberen Box stand deshalb auf den Trennern statt in der Öffnung, die Boxen ließen sich nicht stapeln.
- Jetzt enden die Trenner unter dem Fuß (bei 3 mm Fuß: 3,25 mm unter dem Rand). Eine niedriger eingestellte Höhe bleibt.
- Oben fehlt kein Kranz: Bei „Stapeln mit Fuß“ bleibt der Rand absichtlich glatt.

Prüfungen: Typprüfung grün, Tests 6013, e2e-Tests zu Aushöhlen und Trennern 87. Die ganze e2e-Reihe lief auf diesem Zweig nicht.
Hinweis: Der Höhen-Regler für die Trenner geht im Fenster weiter bis zum Rand, der Wert wird einfach begrenzt.
