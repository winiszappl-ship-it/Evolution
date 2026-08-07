import { el, openModal, closeModal, toast, slider, confirmBox } from './dom.js';
import { formatNumber, hsl, clamp } from '../core/util.js';
import { MAP_SIZES, DEFAULT_PARAMS, generateTerrain } from '../world/worldgen.js';
import { BIOME_DEF } from '../world/biomes.js';
import { CELL_DESIGN_DEF, ENERGY_SOURCES, DESIGN_BUDGET, designCost, defaultDesign } from '../bio/seed.js';
import { TICKS_PER_YEAR } from '../world/climate.js';
import { Genome } from '../bio/genome.js';
import { geneStrip, speciesSummaryRows } from './panels.js';
import * as store from '../persist/store.js';

const yr = (t) => (t / TICKS_PER_YEAR).toFixed(1);

export class Screens {
  constructor(app) { this.app = app; }

  // ------------------------------------------------------------- menu główne
  mainMenu() {
    const app = this.app;
    const has = !!app.sim;
    const box = el('div', {},
      el('h1', { text: 'EVOLUTION' }),
      el('p', { class: 'lead', text: 'Laboratorium ewolucji. Nie ma tu zwycięstwa, końca ani zapisu — planeta istnieje tak długo, jak długo na nią patrzysz.' }),
      el('div', { class: 'menu-list' },
        has ? el('button', { onclick: () => closeModal() }, 'Wróć do świata', el('small', { text: `rok ${formatNumber(app.sim.year)}, ${app.sim.organisms.length} organizmów` })) : null,
        el('button', { onclick: () => this.worldSetup() }, 'Nowa Symulacja', el('small', { text: 'Ustal warunki początkowe i wygeneruj planetę' })),
        el('button', { onclick: () => this.dnaBank() }, 'Bank DNA', el('small', { text: 'Zachowane genomy i kolekcje' })),
        el('button', { onclick: () => this.encyclopedia() }, 'Encyklopedia Gatunków', el('small', { text: 'Wszystko, co kiedykolwiek żyło w tym świecie' })),
        el('button', { onclick: () => this.lab() }, 'Laboratorium', el('small', { text: 'Eksperymenty na żywym świecie' })),
        el('button', { onclick: () => this.settings() }, 'Ustawienia', el('small', { text: 'Interfejs i wydajność' })),
        el('button', { onclick: () => this.exit() }, 'Wyjście', el('small', { text: 'Zakończ ten świat na zawsze' }))));
    openModal(box, { dismissable: has });
  }

  exit() {
    const app = this.app;
    confirmBox('Zakończyć?',
      'Tego świata nie da się zapisać ani odtworzyć. Zamknięcie go kończy jego '
      + 'historię na zawsze. Genomy, które chcesz zachować, zapisz wcześniej w Banku DNA.',
      () => {
        app.paused = true;
        openModal(el('div', {},
          el('h1', { text: 'EVOLUTION' }),
          el('p', { class: 'lead', text: 'Ta planeta się skończyła. Następna będzie inna.' }),
          el('div', { class: 'actions' },
            el('button', { class: 'primary', text: 'Wróć do menu', onclick: () => this.mainMenu() }))),
          { dismissable: false });
      }, 'Zakończ ten świat');
  }

  // ------------------------------------------------------------- nowy świat
  worldSetup() {
    const app = this.app;
    const p = { ...DEFAULT_PARAMS, seed: randomSeed() };
    const preview = el('canvas', { width: 288, height: 208, style: { width: '100%', borderRadius: '9px', border: '1px solid var(--line)', imageRendering: 'pixelated' } });
    const info = el('div', { class: 'hint', text: '' });
    let timer = null;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => drawPreview(preview, info, p), 180);
    };

    const seedInput = el('input', { type: 'text', value: p.seed, oninput: (e) => { p.seed = e.target.value; refresh(); } });
    const sizeSel = el('select', { onchange: (e) => { p.size = e.target.value; refresh(); } },
      Object.values(MAP_SIZES).map(s => el('option', { value: s.key, selected: s.key === p.size }, `${s.name} (${s.w}×${s.h})`)));

    const box = el('div', {},
      el('h2', { text: 'Nowa planeta' }),
      el('p', { class: 'lead', text: 'Te wartości są jedynym, co ustalasz na trwałe. Reszta wydarzy się sama.' }),
      el('div', { class: 'split' },
        el('div', {},
          el('div', { class: 'field' }, el('label', {}, el('span', { text: 'Ziarno świata' })),
            el('div', { style: { display: 'flex', gap: '6px' } }, seedInput,
              el('button', { class: 'mini-btn nowrap', text: 'Losuj', onclick: () => { p.seed = randomSeed(); seedInput.value = p.seed; refresh(); } }))),
          el('div', { class: 'field' }, el('label', {}, el('span', { text: 'Rozmiar mapy' })), sizeSel),
          slider('Temperatura', p.temperature, -25, 45, 1, 'Średnia globalna. Skrajności ograniczają, gdzie życie w ogóle da radę.', v => { p.temperature = v; refresh(); }, v => `${v}°C`),
          slider('Wilgotność', p.humidity, 0, 1, 0.01, 'Wpływa na lasy, bagna i pustynie.', v => { p.humidity = v; refresh(); }, v => `${Math.round(v * 100)}%`),
          slider('Ilość wody', p.water, 0.05, 0.92, 0.01, 'Ile powierzchni pokrywają oceany.', v => { p.water = v; refresh(); }, v => `${Math.round(v * 100)}%`),
          slider('Ilość światła', p.light, 0.15, 2.2, 0.05, 'Jasność gwiazdy. Grzeje i pozwala widzieć — energii już nie daje.', v => { p.light = v; }, v => `${v.toFixed(2)}×`)),
        el('div', {},
          preview, info,
          slider('Poziom tlenu', p.oxygen, 0.01, 0.6, 0.01, 'Wysoki tlen przyspiesza metabolizm.', v => { p.oxygen = v; }, v => `${Math.round(v * 100)}%`),
          slider('Grawitacja', p.gravity, 0.15, 3, 0.05, 'Decyduje, jak trudno oderwać się od podłoża.', v => { p.gravity = v; }, v => `${v.toFixed(2)} g`),
          slider('Promieniowanie', p.radiation, 0, 1.5, 0.05, 'Zwiększa tempo mutacji — i liczbę nieudanych potomków.', v => { p.radiation = v; }, v => `${v.toFixed(2)}`))),
      el('div', { class: 'actions' },
        el('button', { class: 'primary', text: 'Stwórz świat', onclick: () => { closeModal(); app.newWorld(p); this.cellSetup(true); } }),
        el('button', { class: 'ghost', text: 'Wstecz', onclick: () => this.mainMenu() })));

    openModal(box, { dismissable: !!app.sim });
    drawPreview(preview, info, p);
  }

  // ------------------------------------------------------------- pierwsza komórka
  cellSetup(first = false) {
    const app = this.app;
    const design = defaultDesign();
    const costLabel = el('b', { text: '' });
    const budgetInfo = el('div', { class: 'lead' });
    const startBtn = el('button', { class: 'primary', text: 'Zasiej życie' });

    const sync = () => {
      const c = designCost(design);
      costLabel.textContent = `${c.toFixed(1)} / ${DESIGN_BUDGET}`;
      budgetInfo.textContent = c > DESIGN_BUDGET
        ? 'Przekroczono budżet punktów. Coś trzeba obniżyć.'
        : 'Każdy parametr kosztuje. To ostatni moment, w którym decydujesz o czymkolwiek w tej linii.';
      budgetInfo.style.color = c > DESIGN_BUDGET ? 'var(--bad)' : '';
      startBtn.disabled = c > DESIGN_BUDGET;
    };

    const fields = Object.entries(CELL_DESIGN_DEF).map(([k, d]) =>
      slider(d.label, design[k], d.min, d.max, 1, d.hint, v => { design[k] = v; sync(); }));

    const srcBox = el('div', { class: 'field' },
      el('label', {}, el('span', { text: 'Źródło energii' })),
      el('select', { onchange: (e) => { design.source = e.target.value; sync(); } },
        ENERGY_SOURCES.map(s => el('option', { value: s.key, selected: s.key === design.source }, s.label))),
      el('span', { class: 'hint', id: 'srcHint', text: ENERGY_SOURCES[0].hint }));
    srcBox.querySelector('select').addEventListener('change', (e) => {
      const s = ENERGY_SOURCES.find(x => x.key === e.target.value);
      srcBox.querySelector('#srcHint').textContent = s ? s.hint : '';
    });

    startBtn.addEventListener('click', () => {
      closeModal();
      const cam = app.camera;
      const spot = app.findSeedSpot(design.source);
      const first = app.sim.seed(design, spot.x, spot.y);
      // pierścień wokół pierwszej komórki — inaczej gracz jej po prostu nie znajdzie
      if (first && app.renderer) app.renderer.selected = first;
      cam.setTarget(spot.x, spot.y);
      cam.tzoom = 6;
      app.paused = false;
      app.hud.syncButtons();
      toast('Życie zasiane',
        'Jedna komórka. Wszystko, co powstanie dalej, musi pochodzić od niej.');
    });

    openModal(el('div', {},
      el('h2', { text: 'Pierwsza komórka' }),
      budgetInfo,
      el('div', { class: 'row' }, el('span', { text: 'Wykorzystane punkty' }), costLabel),
      el('div', { class: 'form-grid', style: { marginTop: '14px' } }, fields, srcBox),
      el('p', { class: 'hint', style: { marginTop: '16px' } },
        'Nie projektujesz wyglądu ani zachowania. Ustalasz tylko fizyczne właściwości komórki startowej. Kształt, ruch i sposób życia muszą powstać przez mutacje.'),
      el('div', { class: 'actions' }, startBtn,
        el('button', { class: 'ghost', text: first ? 'Zostaw świat pusty' : 'Anuluj', onclick: () => { closeModal(); if (first) toast('Świat bez życia', 'Możesz zasiać komórkę w dowolnej chwili.'); } }))),
      { dismissable: true });
    sync();
  }

  // ------------------------------------------------------------- encyklopedia
  encyclopedia(tab = 'species') {
    const app = this.app, sim = app.sim;
    if (!sim) return this.mainMenu();
    const content = el('div');
    const tabs = el('div', { class: 'tabs' },
      [['species', 'Gatunki'], ['tree', 'Drzewo rodowe'], ['ach', 'Osiągnięcia']].map(
        ([k, label]) => el('button', { class: k === tab ? 'on' : '', text: label, onclick: () => this.encyclopedia(k) })));

    if (tab === 'species') {
      const all = Array.from(sim.species.list.values()).sort((a, b) => (b.count - a.count) || (b.peak - a.peak));
      content.appendChild(all.length ? el('table', { class: 'data' },
        el('tr', {}, el('th', { text: 'Gatunek' }), el('th', { text: 'Stan' }),
          el('th', { class: 'num', text: 'Osobniki' }), el('th', { class: 'num', text: 'Szczyt' }),
          el('th', { class: 'num', text: 'Powstał' }), el('th', { text: 'Odżywianie' }),
          el('th', { text: 'Pozycja' }), el('th', { text: 'Biom' }),
          el('th', { class: 'num', text: 'Komórki' })),
        all.slice(0, 260).map(s => el('tr', { class: 'clickable', onclick: () => this.speciesDetail(s) },
          el('td', {}, el('span', { class: 'dot', style: { background: hsl(s.hue, 0.7, 0.6) } }), s.name),
          el('td', { text: s.count > 0 ? 'żyje' : 'wymarły' }),
          el('td', { class: 'num', text: String(s.count) }),
          el('td', { class: 'num', text: String(s.peak) }),
          el('td', { class: 'num', text: yr(s.born) }),
          el('td', { text: s.dominantDiet().label }),
          el('td', { text: s.trophic || '—' }),
          el('td', { text: s.mainBiome() }),
          el('td', { class: 'num', text: s.avg.cells.toFixed(1) }))))
        : el('div', { class: 'empty', text: 'Żaden gatunek jeszcze nie powstał.' }));
    } else if (tab === 'tree') {
      content.appendChild(this.buildTree(sim));
    } else {
      const list = Array.from(sim.chronicle.achievements.values()).sort((a, b) => a.tick - b.tick);
      content.appendChild(list.length ? el('div', { class: 'log' },
        list.map(a => el('div', { class: 'entry achievement' },
          el('div', { class: 'when', text: `rok ${yr(a.tick)}` }),
          el('b', { text: a.title }), el('div', { text: a.desc }))))
        : el('div', { class: 'empty', text: 'Świat nie zrobił jeszcze nic, co warto byłoby nazwać.' }));
    }

    openModal(el('div', {},
      el('h2', { text: 'Encyklopedia gatunków' }),
      tabs, content,
      el('div', { class: 'actions' },
        el('button', { class: 'ghost', text: 'Zamknij', onclick: closeModal }))));
  }

  buildTree(sim) {
    const roots = Array.from(sim.species.list.values()).filter(s => !s.parent || !sim.species.list.has(s.parent));
    const wrap = el('div', { class: 'tree' });
    const walk = (s, depth) => {
      if (depth > 40) return;
      wrap.appendChild(el('div', {
        class: 'node' + (s.count === 0 ? ' extinct' : ''),
        onclick: () => this.speciesDetail(s),
      },
        '  '.repeat(depth) + (depth ? '└─ ' : ''),
        el('span', { class: 'dot', style: { background: hsl(s.hue, 0.7, 0.6) } }),
        `${s.name} · rok ${yr(s.born)} · ${s.count > 0 ? s.count + ' osobników' : 'wymarły'}`));
      for (const cid of s.children) {
        const c = sim.species.get(cid);
        if (c) walk(c, depth + 1);
      }
    };
    for (const r of roots) walk(r, 0);
    if (!roots.length) wrap.appendChild(el('div', { class: 'empty', text: 'Drzewo jest jeszcze puste.' }));
    return wrap;
  }

  speciesDetail(sp) {
    const app = this.app, sim = app.sim;
    const genome = Genome.deserialize(sp.founderGenome);
    const box = el('div', {},
      el('h2', {}, el('span', { class: 'dot', style: { background: hsl(sp.hue, 0.7, 0.6) } }), sp.name),
      el('p', { class: 'lead', text: `${sp.dominantDiet().label} · ${sp.mainBiome()} · linia ${sp.depth} pokoleń od założyciela` }),
      el('div', { class: 'split' },
        el('div', {}, speciesSummaryRows(sp, sim)),
        el('div', {},
          el('h4', { style: { color: 'var(--dim)', fontSize: '11px', textTransform: 'uppercase' }, text: 'DNA założyciela' }),
          geneStrip(genome, 140),
          el('div', { class: 'hint', text: `${genome.genes.length} genów, tempo mutacji ${genome.params.mutRate.toFixed(3)}` }),
          sp.notes.length ? el('div', { class: 'section' },
            el('h4', { text: 'Notatki' }),
            sp.notes.slice(-6).map(n => el('div', { class: 'hint', text: '· ' + n })))
            : null)),
      el('div', { class: 'actions' },
        el('button', { text: 'Zapisz w Banku DNA', onclick: () => { app.saveSpeciesDNA(sp); } }),
        el('button', { text: 'Wprowadź do świata', onclick: () => { app.introduceGenome(genome); closeModal(); } }),
        sp.count > 0 ? el('button', { text: 'Pokaż na mapie', onclick: () => { closeModal(); app.focusSpecies(sp); } }) : null,
        el('button', { class: 'ghost', text: 'Wstecz', onclick: () => this.encyclopedia() })));
    openModal(box);
  }

  // ------------------------------------------------------------- bank DNA
  dnaBank() {
    const app = this.app;
    const entries = store.listDNA().sort((a, b) => b.saved - a.saved);
    const cols = store.collections();
    const filter = { collection: '' };
    const table = el('div');

    const render = () => {
      table.innerHTML = '';
      const list = entries.filter(e => !filter.collection || e.collection === filter.collection);
      if (!list.length) { table.appendChild(el('div', { class: 'empty', text: 'Bank jest pusty. Zapisz DNA z panelu organizmu lub z encyklopedii.' })); return; }
      table.appendChild(el('table', { class: 'data' },
        el('tr', {}, el('th', { text: 'Nazwa' }), el('th', { text: 'Kolekcja' }),
          el('th', { class: 'num', text: 'Geny' }), el('th', { text: 'Pochodzenie' }), el('th', { text: '' })),
        list.map(e => el('tr', {},
          el('td', { text: e.name }),
          el('td', { text: e.collection || '—' }),
          el('td', { class: 'num', text: String(e.genome?.genes?.length ?? 0) }),
          el('td', { class: 'hint', text: e.origin || '—' }),
          el('td', {},
            app.sim ? el('button', { class: 'mini-btn', text: 'Wypuść', onclick: () => { app.introduceGenome(Genome.deserialize(e.genome)); } }) : null,
            ' ',
            el('button', { class: 'mini-btn', text: 'Eksport', onclick: () => exportJSON(e.name, e) }),
            ' ',
            el('button', { class: 'mini-btn', text: '✕', onclick: () => { store.deleteDNA(e.id); this.dnaBank(); } }))))));
    };

    const colSel = el('select', { onchange: (e) => { filter.collection = e.target.value; render(); } },
      el('option', { value: '' }, 'Wszystkie kolekcje'),
      cols.map(c => el('option', { value: c }, c)));

    openModal(el('div', {},
      el('h2', { text: 'Bank DNA' }),
      el('p', { class: 'lead', text: 'Zachowane genomy można wypuścić do dowolnego świata — także takiego, w którym nigdy nie żyły.' }),
      el('div', { style: { maxWidth: '260px', marginBottom: '12px' } }, colSel),
      table,
      el('div', { class: 'actions' },
        el('button', { text: 'Importuj plik', onclick: () => importJSON(() => this.dnaBank()) }),
        el('button', { class: 'ghost', text: 'Zamknij', onclick: () => app.sim ? closeModal() : this.mainMenu() }))));
    render();
  }

  // ------------------------------------------------------------- laboratorium
  lab() {
    const app = this.app, sim = app.sim;
    if (!sim) return this.mainMenu();
    const bank = store.listDNA();
    const state = { biome: -1, dna: bank[0]?.id || '' };

    const biomeSel = el('select', { onchange: e => state.biome = parseInt(e.target.value, 10) },
      el('option', { value: '-1' }, 'Dowolne miejsce'),
      BIOME_DEF.map(b => el('option', { value: String(b.id) }, b.name)));

    const dnaSel = el('select', { onchange: e => state.dna = e.target.value },
      bank.length ? bank.map(e => el('option', { value: e.id }, `${e.name} (${e.genome?.genes?.length ?? 0} genów)`))
        : el('option', { value: '' }, 'Bank DNA jest pusty'));

    const place = (genomeFactory) => {
      const spot = state.biome >= 0 ? app.findBiomeSpot(state.biome) : null;
      app.introduceGenome(genomeFactory, spot ? spot.x : null, spot ? spot.y : null);
    };

    openModal(el('div', {},
      el('h2', { text: 'Laboratorium' }),
      el('p', { class: 'lead', text: 'Możesz zasiać życie, ale nie możesz nim pokierować. Każde wprowadzenie to jeden organizm — populacja musi odrosnąć sama.' }),
      el('div', { class: 'split' },
        el('div', {},
          el('div', { class: 'field' }, el('label', {}, el('span', { text: 'Miejsce wprowadzenia' })), biomeSel),
          el('div', { class: 'field' }, el('label', {}, el('span', { text: 'Genom z banku' })), dnaSel)),
        el('div', {},
          el('h4', { style: { color: 'var(--dim)', fontSize: '11px', textTransform: 'uppercase' }, text: 'Statystyki świata' }),
          el('div', { class: 'row' }, el('span', { text: 'Organizmy' }), el('span', { text: formatNumber(sim.organisms.length) })),
          el('div', { class: 'row' }, el('span', { text: 'Gatunki żywe' }), el('span', { text: String(sim.species.aliveCount) })),
          el('div', { class: 'row' }, el('span', { text: 'Gatunki kiedykolwiek' }), el('span', { text: String(sim.species.list.size) })),
          el('div', { class: 'row' }, el('span', { text: 'Największe pokolenie' }), el('span', { text: formatNumber(sim.stats.maxGeneration) })),
          el('div', { class: 'row' }, el('span', { text: 'Biomasa' }), el('span', { text: formatNumber(sim.stats.biomass) })),
          el('div', { class: 'row' }, el('span', { text: 'Epoki życia' }), el('span', { text: String(sim.epochs + 1) })),
          el('div', { class: 'row' }, el('span', { text: 'Tlen atmosfery' }), el('span', { text: `${(sim.world.globalOxygen * 100).toFixed(1)}%` })))),
      el('div', { class: 'actions' },
        el('button', { class: 'primary', text: 'Nowa pierwsza komórka', onclick: () => { closeModal(); this.cellSetup(); } }),
        el('button', { text: 'Losowe DNA', onclick: () => place(() => randomGenomeFor(sim)) }),
        el('button', {
          text: 'Wypuść z banku', onclick: () => {
            const e = store.listDNA().find(x => x.id === state.dna);
            if (!e) return toast('Brak DNA', 'Bank jest pusty.', 'warn');
            place(() => Genome.deserialize(e.genome));
          },
        }),
        el('button', { class: 'ghost', text: 'Zamknij', onclick: closeModal }))));
  }

  // ------------------------------------------------------------- kronika
  chronicle(filter = 'all') {
    const app = this.app, sim = app.sim;
    if (!sim) return this.mainMenu();
    const kinds = [['all', 'Wszystko'], ['life', 'Życie'], ['species', 'Gatunki'],
    ['extinction', 'Wymierania'], ['achievement', 'Osiągnięcia'], ['record', 'Rekordy']];
    const tabs = el('div', { class: 'tabs' },
      kinds.map(([k, l]) => el('button', { class: k === filter ? 'on' : '', text: l, onclick: () => this.chronicle(k) })));

    const entries = sim.chronicle.entries.filter(e => filter === 'all' || e.kind === filter).slice().reverse();
    openModal(el('div', {},
      el('h2', { text: 'Kronika świata' }),
      el('p', { class: 'lead', text: 'Czasu nie da się cofnąć ani zapisać. Można go tylko przeczytać, póki ten świat trwa.' }),
      tabs,
      entries.length ? el('div', { class: 'log' },
        entries.map(e => el('div', { class: 'entry ' + e.kind + (e.important ? ' important' : '') },
          el('div', { class: 'when', text: `rok ${yr(e.tick)}` }),
          el('div', { text: e.text }))))
        : el('div', { class: 'empty', text: 'Jeszcze nic się nie wydarzyło.' }),
      el('div', { class: 'actions' },
        el('button', { class: 'ghost', text: 'Zamknij', onclick: closeModal }))));
  }

  // ------------------------------------------------------------- ustawienia
  settings() {
    const app = this.app;
    const s = { ...app.settings };
    openModal(el('div', {},
      el('h2', { text: 'Ustawienia' }),
      el('div', { class: 'form-grid' },
        el('div', {},
          slider('Maksymalna liczba organizmów z pełną fizyką', s.maxDetail, 20, 600, 10,
            'Wyższa wartość daje dokładniejszą fizykę kosztem płynności.', v => s.maxDetail = v)),
        el('div', {},
          el('label', { class: 'field' },
            el('span', {}, el('input', {
              type: 'checkbox', checked: s.showUI,
              onchange: e => s.showUI = e.target.checked,
            }), ' Pokazuj interfejs')),
          el('p', { class: 'hint', text: 'Tab ukrywa interfejs w każdej chwili. Esc otwiera menu.' }),
          el('p', { class: 'hint', text: 'Świat nie jest nigdzie zapisywany. Trwały jest wyłącznie Bank DNA.' }))),
      el('div', { class: 'actions' },
        el('button', {
          class: 'primary', text: 'Zapisz ustawienia',
          onclick: () => { app.applySettings(s); closeModal(); toast('Zapisano', 'Ustawienia zaktualizowane.'); },
        }),
        el('button', { class: 'ghost', text: 'Wstecz', onclick: () => app.sim ? closeModal() : this.mainMenu() }))));
  }
}

// ---------------------------------------------------------------- pomocnicze

function randomSeed() {
  const a = ['pra', 'neo', 'kryo', 'tera', 'abis', 'orion', 'wega', 'sylwa', 'tetyda', 'lampr'];
  const b = ['dawn', 'mar', 'gea', 'nox', 'vita', 'kalos', 'ferra', 'lumen'];
  return a[Math.floor(Math.random() * a.length)] + '-' + b[Math.floor(Math.random() * b.length)]
    + '-' + Math.floor(Math.random() * 9000 + 1000);
}

function drawPreview(canvas, info, params) {
  const t = generateTerrain(params);
  const ctx = canvas.getContext('2d');
  canvas.width = t.W; canvas.height = t.H;
  const img = ctx.createImageData(t.W, t.H);
  const counts = new Map();
  for (let i = 0; i < t.W * t.H; i++) {
    const b = BIOME_DEF[t.biome[i]];
    counts.set(b.name, (counts.get(b.name) || 0) + 1);
    const shade = b.water ? 1 - t.depth[i] * 0.55 : 0.72 + (t.elevation[i] - t.seaLevel) * 0.9;
    const [h, sa, l] = b.color;
    const rgb = hslToRgbLocal(h / 360, sa, clamp(l * shade, 0.03, 0.92));
    img.data[i * 4] = rgb[0]; img.data[i * 4 + 1] = rgb[1]; img.data[i * 4 + 2] = rgb[2]; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([n, c]) => `${n} ${Math.round(c / (t.W * t.H) * 100)}%`).join(' · ');
  info.textContent = top;
}

function hslToRgbLocal(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [Math.round(hue2rgb(p, q, h + 1 / 3) * 255), Math.round(hue2rgb(p, q, h) * 255), Math.round(hue2rgb(p, q, h - 1 / 3) * 255)];
}

function randomGenomeFor(sim) {
  return Genome.random(sim.rng, 4 + sim.rng.int(9));
}

function exportJSON(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${String(name).replace(/[^\w-]+/g, '_')}.dna.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importJSON(done) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = () => {
    const f = input.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        const list = Array.isArray(data) ? data : [data];
        for (const e of list) {
          if (!e.genome) continue;
          delete e.id;
          store.saveDNA(e);
        }
        toast('Zaimportowano', `${list.length} wpisów DNA.`);
        done();
      } catch (err) {
        toast('Błąd importu', String(err.message || err), 'bad');
      }
    };
    r.readAsText(f);
  };
  input.click();
}
