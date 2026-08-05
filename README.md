# EVOLUTION

Symulator ewolucji, w którym nie ma zaprogramowanych organizmów.

Nie znajdziesz tutaj gotowych zwierząt, roślin, drapieżników, kończyn, oczu ani
zachowań. Silnik zna tylko prawa świata: fizykę, chemię, klimat i bilans
energii. Wszystko, co żyje, musi powstać samo — przez mutacje DNA i dobór
naturalny.

Gracz tworzy planetę, projektuje pierwszą komórkę i od tej chwili już tylko
obserwuje. Nie ma zwycięstwa, nie ma zakończenia, nie ma cofania czasu.

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

Uwaga: świat zapisuje się w `localStorage` przeglądarki, osobno dla każdej
domeny. Zapisy z `localhost` nie przeniosą się na adres `github.io` — genomy
da się jednak przenieść ręcznie przez eksport i import w Banku DNA.

## Sterowanie

| Klawisz | Działanie |
|---|---|
| `Spacja` | pauza / wznowienie |
| `1` … `5` | tempo 1×, 5×, 20×, 100×, 1000× |
| `Tab` | ukryj lub pokaż interfejs |
| `Esc` | menu główne |
| `[` `]` | poziom przybliżenia: świat → biom → organizm → budowa → komórki |
| `C` `E` `B` `L` `N` | kronika, encyklopedia, bank DNA, laboratorium, nowa komórka |
| `F` | śledź zaznaczony organizm |

Kółko myszy przybliża w miejsce kursora, przeciągnięcie przesuwa mapę,
kliknięcie zaznacza organizm, podwójne kliknięcie zaczyna go śledzić.

## Jak to działa

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

### Świat decyduje, co się opłaca

Kafel mapy ma skończoną pulę światła, minerałów i martwej materii organicznej.
Minerały i materia organiczna dzielą się sprawiedliwie między wszystkich
mieszkańców kafla — o kolejności nie decyduje pozycja w tablicy.

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

### Zapis to świat i populacje, nie chwila

Zapisywane są: ziarno, stan chemiczny mapy (binarnie, nie jako JSON z
liczbami), klimat, pełna historia gatunków, kronika, osiągnięcia oraz
reprezentatywna próbka żywego DNA wraz z liczebnościami populacji. Przy
wczytaniu populacje są odtwarzane z tych przedstawicieli.

To nie są te same osobniki co przed zapisem — to ta sama populacja. Konkretne
ciała są i tak tylko chwilowym stanem, a pamięć przeglądarki ma twardy limit.

## Struktura projektu

```
index.html, styles.css     interfejs
src/core/                  generator liczb losowych, szum, magistrala zdarzeń
src/world/                 generowanie terenu, biomy, klimat, chemia kafli
src/bio/                   DNA, mutacje, morfogeneza, układ nerwowy, organizm,
                           gatunki, projekt pierwszej komórki
src/sim/                   pętla symulacji, katastrofy, kronika, osiągnięcia
src/render/                kamera i rysowanie
src/ui/                    panele, ekrany, elementy interfejsu
src/persist/               zapis świata i Bank DNA w pamięci przeglądarki
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
```

Test interfejsu wymaga Playwrighta — uruchamia prawdziwą przeglądarkę, przechodzi
przez wszystkie ekrany i zgłasza każdy błąd konsoli.

## Czego tu nie ma i nie będzie

Cofania czasu. Zwycięstwa. Punktacji. Drzewka technologii. Gotowych gatunków do
odblokowania. Bilansowania rozgrywki pod kątem „ciekawości".

Ewolucja jest ciekawa sama z siebie albo wcale. Autor tej gry też nie wie, co
wyewoluuje w twoim świecie po milionie taktów.
