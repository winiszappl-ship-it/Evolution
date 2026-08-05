# EVOLUTION

Symulator ewolucji, w którym nie ma zaprogramowanych organizmów.

Nie znajdziesz tutaj gotowych zwierząt, roślin, drapieżników, kończyn, oczu ani
zachowań. Silnik zna tylko prawa świata: fizykę, chemię, klimat i bilans
energii. Wszystko, co żyje, musi powstać samo — przez mutacje DNA i dobór
naturalny.

Gracz tworzy planetę, projektuje pierwszą komórkę i od tej chwili już tylko
obserwuje. Nie ma zwycięstwa, nie ma zakończenia, nie ma cofania czasu — i nie
ma zapisu. Każda planeta istnieje raz.

## Uruchomienie

Projekt nie ma zależności ani kroku budowania. Wymaga jedynie serwera plików,
bo korzysta z modułów ES.

```bash
python3 -m http.server 8000
# albo: npx http-server -p 8000
```

Następnie otwórz `http://localhost:8000`.

### GitHub Pages

Projekt nadaje się na GitHub Pages bez żadnych zmian: nie ma kroku budowania,
wszystkie ścieżki są względne, a stan zapisuje się w pamięci przeglądarki.
W ustawieniach repozytorium wystarczy wybrać *Pages → Deploy from a branch*,
wskazać gałąź i katalog `/ (root)`.

Plik `.nojekyll` wyłącza przetwarzanie przez Jekyll — statyczne pliki mają
trafiać do przeglądarki takie, jakie są.

Uwaga: Bank DNA leży w `localStorage` przeglądarki, osobno dla każdej domeny.
Kolekcja z `localhost` nie pojawi się pod adresem `github.io` — genomy da się
przenieść ręcznie przez eksport i import w Banku DNA.

## Sterowanie

| Klawisz | Działanie |
|---|---|
| `Spacja` | pauza / wznowienie |
| `1` … `5` | tempo 1×, 5×, 20×, 100×, 1000× |
| `Tab` | ukryj lub pokaż interfejs |
| `Esc` | menu główne |
| `[` `]` | poziom przybliżenia: świat → biom → organizm → budowa → komórki |
| `C` `E` `B` `L` `N` | kronika, encyklopedia, Bank DNA, laboratorium, nowa komórka |
| `F` | śledź zaznaczony organizm |

Kółko myszy przybliża w miejsce kursora, przeciągnięcie przesuwa mapę,
kliknięcie zaznacza organizm, podwójne kliknięcie zaczyna go śledzić.

## Jak to działa

### Życie powstaje tylko z życia

Silnik nie potrafi powołać organizmu ani komórki. Nie ma w nim żadnej ścieżki,
która tworzyłaby żywe ciało z niczego — ani przy wczytywaniu zapisu, ani przy
odtwarzaniu populacji, ani przy żadnym zdarzeniu świata.

Komórka może powstać wyłącznie przez podział innej komórki, w trakcie rozwoju
zarodkowego. Organizm może powstać wyłącznie przez rozmnożenie innego
organizmu. Każdy nosi zapis swojego pochodzenia: wskazanie rodzica oraz
założyciela całej swojej linii.

Jedynym wyjątkiem jest ręka gracza. Gracz może zasiać pierwszą komórkę —
dokładnie jedną — wypuścić jeden organizm z Banku DNA albo skopiować istniejące
ciało. To akt z zewnątrz, spoza praw tego świata, i jest odnotowywany w kronice
jako osobny początek życia. Cała reszta populacji musi z tego jednego ciała
wyrosnąć przez podziały.

Reguła jest pilnowana testem: `node tools/biogeneza.js` sprawdza po tysiącach
pokoleń, że każdy żyjący organizm ma wcześniej istniejącego rodzica i że cała
populacja wywodzi się z tej jednej zasianej komórki. Sprawdza też, że w silniku
nie istnieje żadna droga odtworzenia świata z danych.

### DNA opisuje budowanie, nie zbudowane

Genom to lista genów regulacyjnych w postaci reguł warunkowych:

```
jeśli <sygnał> <większy|mniejszy> <próg>   →   <działanie>
```

Sygnałem może być stężenie jednego z pięciu morfogenów, wiek zarodkowy,
pokolenie komórki, jej odległość od środka ciała, liczba sąsiadów lub jej
rozmiar. Działaniem — podział pod danym kątem, wydzielenie morfogenu,
specjalizacja, wzrost, utworzenie dodatkowego wiązania, apoptoza, zakończenie
podziałów albo wypuszczenie neurytu.

Każda komórka czyta ten sam genom osobno i reaguje wyłącznie na to, co czuje
lokalnie. Kształt organizmu nikt nie zapisuje — jest skutkiem ubocznym tysięcy
takich lokalnych decyzji. Ta sama zmiana genu daje inny efekt w innym miejscu
ciała, dlatego mutacje mogą tworzyć nowe struktury, a nie tylko przestawiać
istniejące.

Mutacje obejmują zmianę wartości, delecję genu, insercję, duplikację fragmentu,
inwersję kolejności i rzadką duplikację całego genomu. Tempo mutacji jest
zapisane w samym DNA i również podlega doborowi.

### Komórka ma zdolności, nie rolę

Komórka może rozwinąć dziesięć fizycznych zdolności: fotosyntezę, trawienie,
wchłanianie, kurczliwość, sztywność, receptory, przewodzenie sygnału, magazyn
energii, pancerz i rozrodczość. Każda coś kosztuje w każdym takcie.

Nigdzie w kodzie nie ma pojęcia rośliny, roślinożercy ani drapieżnika.
Organizm, który zdobywa energię ze światła, jest opisywany jako fotosyntetyk
dopiero po fakcie — na podstawie tego, skąd faktycznie wzięła się jego energia.
Ten sam organizm może w kolejnym pokoleniu żywić się padliną, jeśli mutacja
przestawi jego komórki na trawienie.

Drapieżnictwo nie jest osobnym systemem. Komórka zdolna do trawienia, która
dotyka cudzej tkanki, po prostu ją trawi. Czy nazwiemy to polowaniem,
pasożytnictwem czy padlinożerstwem, zależy od tego, co ta tkanka robiła
wcześniej.

### Ruch wynika z sił, nie z animacji

Ciało jest układem punktów materialnych połączonych sprężynami. Wiązanie, przy
którym leży komórka kurczliwa, staje się mięśniem: jego długość spoczynkowa
zmienia się wraz z sygnałem z układu nerwowego.

Nie ma żadnych animacji ani zaprogramowanych chodów. Przemieszczenie bierze się
z dwóch nieliniowości: anizotropowego oporu ośrodka (opór w poprzek osi komórki
jest większy niż wzdłuż, tak jak u prawdziwych pływaków) oraz tarcia Coulomba o
podłoże. Dzięki nim cykliczne odkształcanie ciała daje ruch postępowy.

Lot nie jest cechą, którą można włączyć. Jest bilansem: jeśli praca mięśni
wytwarza siłę nośną większą niż ciężar ciała w danej grawitacji, organizm
odrywa się od podłoża.

### Układ nerwowy powstaje z anatomii

Neuronami stają się komórki, które rozwinęły zdolność przewodzenia. Połączenia
tworzą się między tymi, które leżą w zasięgu swoich wypustek — a zasięg też jest
zapisany w genie. Wagi synaps wynikają z parametrów genu, który daną komórkę
wyspecjalizował, więc mutacja tego genu zmienia zachowanie.

Receptory czytają świat w miejscu, w którym fizycznie się znajdują. Organizm z
dwoma receptorami światła po dwóch stronach ciała odbiera różne wartości i
dzięki temu może wykształcić fototaksję — ale tylko jeśli dobór ją nagrodzi.
Nigdzie nie ma reguły „płyń do światła".

Neurony mogą wyewoluować własny rytm (komórki rozrusznikowe) oraz plastyczność
hebbowską. Organizm bez neuronów może mieć wyłącznie łuk odruchowy: receptor
połączony bezpośrednio z mięśniem.

### Pokarm leży w konkretnym miejscu

Martwe ciało nie rozpływa się po kaflu — zostaje okruchem tam, gdzie padło.
Ma położenie, więc jego stężenie maleje płynnie z odległością.

To pozornie drobna różnica, ale bez niej ruch nie mógł się do niczego przydać.
Kafel ma dwanaście jednostek szerokości, a organizm dwie: oba jego receptory
mieściły się w tym samym kaflu i odczytywały identyczną liczbę. Gradientu nie
było, więc nie było czego porównać ani w którą stronę płynąć. Okruch daje
receptorom po dwóch stronach ciała wartości różniące się o kilkadziesiąt
procent — i dopiero to jest informacja, na której dobór może pracować.

Pokarm trzeba dosięgnąć fizycznie: z odległości kilku jednostek nie da się go
pobrać. Trawienie okruchu jest za to szybkie i wydajne, więc znalezienie ciała
naprawdę się opłaca. Kto nie znajdzie — głoduje.

Rozpuszczona materia organiczna została w polu kafla jako osobny, uboższy
zasób. Jest wszędzie po trochu i nie trzeba po nią iść — to nisza dla tych,
którzy filtrują, zamiast szukać.

Okruchy powstają wyłącznie ze śmierci. Jedynym wyjątkiem jest pierwotna materia
organiczna leżąca na planecie, zanim cokolwiek zaczęło żyć — jednorazowe
wyposażenie świata, nie źródło produkujące bez końca. Nikt niezjedzony okruch
rozkłada się na minerały, więc obieg materii domyka się nawet bez padlinożerców.

### Ciało kosztuje energię, którą trzeba mieć

Rozwój zarodkowy płaci za każdą komórkę i za każdy przyrost jej rozmiaru.
Płaci z tego, co rodzic przekazał potomkowi — a nie z niczego. Gdy energii
zabraknie, rozwój po prostu zatrzymuje się w połowie i rodzi się mniejsze ciało,
niż zapowiadało DNA.

Bez tego prawa wielokomórkowość pojawiała się skokiem: jednokomórkowy rodzic
potrafił urodzić trzynastokomórkowe dziecko w jednym pokoleniu, bo ciało
składało się za darmo. Teraz taki skok jest niemożliwy — na trzynaście komórek
trzeba najpierw mieć trzynaście komórek energii. Wielkość rośnie stopniowo,
przez linie, które kolejno stać na coraz większe potomstwo.

### Świat decyduje, co się opłaca

Kafel mapy ma skończoną pulę światła, minerałów i rozpuszczonej materii
organicznej. Dzielą się sprawiedliwie między wszystkich mieszkańców kafla —
o kolejności nie decyduje pozycja w tablicy.

Światło dzieli się inaczej: większe ciało przechwytuje większą jego część.
To jedyny powód, dla którego opłaca się rosnąć, i jedyne, czego potrzeba, by
z jednokomórkowców zaczęły powstawać większe formy.

Obieg materii jest zamknięty. Martwe organizmy stają się detrytusem, detrytus
rozkłada się na minerały, minerały wracają do fotosyntezy. Wymieranie w jednym
miejscu użyźnia glebę w innym.

### Katastrofy nie są skryptem

Pożar wybucha tam, gdzie jest sucho, ciepło i jest co palić — i rozprzestrzenia
się według tych samych warunków. Epidemia potrzebuje gęstej i genetycznie
jednolitej populacji. Erupcje, susze, powodzie i uderzenia ciał niebieskich
zdarzają się losowo, ale ich skutki wynikają ze stanu świata, a nie z gotowego
scenariusza.

### Gatunek to rozejście się populacji, nie upływ czasu

Punkt odniesienia gatunku podąża za jego żywą populacją. Dzięki temu powolna
zmiana całej linii nie tworzy sztucznie nowych gatunków — nowy gatunek powstaje
dopiero wtedy, gdy potomek odbiega od tego, czym jego gatunek jest *teraz*.
Populacja odcięta od reszty rozchodzi się szybciej, bo izolacja geograficzna
obniża próg.

Historia zapamiętuje datę powstania, wymarcia, przodka, potomne linie, biomy
występowania i DNA założyciela. Wymarłe ślepe zaułki bez potomstwa i bez
liczącej się populacji są z czasem usuwane — reszta zostaje na zawsze.

### Trzy poziomy szczegółowości

Świat dzieli się na sektory. W pobliżu kamery liczona jest pełna fizyka komórek
i mięśni. Dalej organizmy są punktami z uproszczonym napędem różnicowym,
wyliczonym z tej samej aktywności mięśni. Najdalej sektory dostają rzadkie,
zbiorcze aktualizacje, a chemia kafli nadganiana jest analitycznie dopiero
wtedy, gdy znów staje się istotna.

Jest to kompromis: ruch organizmu podlega pełnej fizyce tylko wtedy, gdy ktoś
na niego patrzy albo gdy coś się w jego sektorze dzieje. Prędkość zmierzona
podczas pełnej symulacji jest zapamiętywana i wykorzystywana w trybie
uproszczonym, więc dobór wciąż działa na rzeczywiste zdolności ruchowe.

Budżety szczegółowości kurczą się wraz z żądanym tempem. Przy 1000× cały świat
przechodzi w tryb zbiorczy, bo nikt i tak nie ogląda wtedy pojedynczych mięśni.
Górny pasek pokazuje tempo faktycznie osiągnięte, a nie żądane.

### Świata nie da się zapisać

Nie ma zapisu planety i nie ma jej wczytywania. Zamknięcie karty kończy historię
tego świata na zawsze.

To nie jest brak funkcji, tylko ta sama zasada, co zakaz cofania czasu.
Wczytanie zapisu byłoby cofnięciem czasu tylnymi drzwiami: pozwalałoby
powtórzyć wymieranie, sprawdzić drugie rozgałęzienie, obejść skutki suszy.
Świat, który da się przeładować, przestaje być jednorazowy — a to jego
jednorazowość jest tu jedyną stawką.

Trwały zostaje wyłącznie Bank DNA, bo genom to informacja, a nie stan świata.
Zapisany genom można wypuścić do dowolnej przyszłej planety — jako jeden
organizm, który musi sobie w niej poradzić sam.

## Struktura projektu

```
index.html, styles.css     interfejs
src/core/                  generator liczb losowych, szum, magistrala zdarzeń
src/world/                 teren, biomy, klimat, chemia kafli, okruchy pokarmu
src/bio/                   DNA, mutacje, morfogeneza, układ nerwowy, organizm,
                           gatunki, projekt pierwszej komórki
src/sim/                   pętla symulacji, katastrofy, kronika, osiągnięcia
src/render/                kamera i rysowanie
src/ui/                    panele, ekrany, elementy interfejsu
src/persist/               Bank DNA i ustawienia w pamięci przeglądarki
tools/                     testy i profilowanie poza przeglądarką
```

## Narzędzia

```bash
node tools/headless.js 20 moje-ziarno   # przebieg silnika bez przeglądarki
node tools/seeds.js 12 8                # czy życie utrzymuje się w 8 światach
node tools/energy.js                    # bilans energetyczny jednej komórki
node tools/profile.js 6                 # gdzie schodzi czas w takcie
node tools/uitest.mjs                   # test interfejsu w przeglądarce
node tools/pagestest.mjs                # czy działa serwowany z podkatalogu
node tools/biogeneza.js 5               # czy nic nie powstaje z niczego
node tools/pokarm.js 12                 # czy pokarm daje powód do ruchu
```

Test interfejsu wymaga Playwrighta — uruchamia prawdziwą przeglądarkę, przechodzi
przez wszystkie ekrany i zgłasza każdy błąd konsoli.

## Czego tu nie ma i nie będzie

Cofania czasu. Zapisu świata. Zwycięstwa. Punktacji. Drzewka technologii.
Gotowych gatunków do odblokowania. Bilansowania rozgrywki pod kątem
„ciekawości".

Ewolucja jest ciekawa sama z siebie albo wcale. Autor tej gry też nie wie, co
wyewoluuje w twoim świecie po milionie taktów.
