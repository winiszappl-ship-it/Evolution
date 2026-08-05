import { Simulation } from './sim/simulation.js';
import { Camera } from './render/camera.js';
import { Renderer } from './render/renderer.js';
import { HUD } from './ui/panels.js';
import { Screens } from './ui/screens.js';
import { el, openModal, closeModal, isModalOpen, modalDismissable, toast } from './ui/dom.js';
import * as store from './persist/store.js';
import { DEFAULT_PARAMS } from './world/worldgen.js';
import { defaultDesign } from './bio/seed.js';
import { findSeedSpot } from './bio/seedspot.js';
import { TILE } from './world/world.js';
import { TICKS_PER_YEAR } from './world/climate.js';
import { bus } from './core/bus.js';

class App {
  constructor() {
    this.SPEEDS = [1, 5, 20, 100, 1000];
    this.canvas = document.getElementById('view');
    this.settings = store.getSettings();
    this.speed = 1;
    this.paused = true;
    this.sim = null;
    this.camera = null;
    this.renderer = null;
    this.screens = new Screens(this);
    this.lastFrame = performance.now();
    this.stepBudgetMs = 11;
    this.achievedSpeed = 0;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
    this.hud = new HUD(this);

    bus.on('achievement', (a) => toast(a.title, a.desc));
    bus.on('chronicle', (e) => {
      if (e.important && e.kind !== 'achievement') {
        toast(kindLabel(e.kind), e.text, e.kind === 'extinction' || e.kind === 'disaster' ? 'bad' : 'warn');
      }
    });

    this.boot();
  }

  // ---------------------------------------------------------------- start

  boot() {
    // Nie ma czego wczytywać. Każde uruchomienie to nowa planeta — w tle menu
    // toczy się świat, który istnieje wyłącznie teraz.
    const params = { ...DEFAULT_PARAMS, seed: 'menu-' + Math.floor(Math.random() * 99999) };
    this.attach(new Simulation(params));
    const spot = this.findSeedSpot('photo');
    this.sim.seed(defaultDesign(), spot.x, spot.y);
    this.camera.setTarget(spot.x, spot.y);
    this.camera.tzoom = this.camera.fitZoom() * 2.4;

    this.paused = false;
    this.speed = 5;
    this.screens.mainMenu();
    requestAnimationFrame((t) => this.frame(t));
  }

  attach(sim) {
    this.sim = sim;
    this.camera = new Camera(sim.world, this.canvas);
    if (this.renderer) this.renderer.setSim(sim, this.camera);
    else this.renderer = new Renderer(this.canvas, sim, this.camera);
    this.renderer.overlay = this.settings.overlay || 'none';
    this.renderer.selected = null;
  }

  newWorld(params) {
    this.attach(new Simulation(params));
    this.paused = false;
    this.speed = 1;
    this.sim.chronicle.record('world', `Powstał świat o ziarnie „${params.seed}". Jeszcze nic w nim nie żyje.`, true);
    toast('Świat gotowy', 'Planeta istnieje. Życia na niej nie ma.');
  }

  applySettings(s) {
    this.settings = { ...this.settings, ...s };
    store.setSettings(this.settings);
    document.getElementById('hud').classList.toggle('hidden', !this.settings.showUI);
    document.getElementById('hint').classList.toggle('hidden', !this.settings.showUI);
  }

  // ---------------------------------------------------------------- pętla

  frame(now) {
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    if (this.sim) {
      if (!this.paused) this.runSteps();
      this.camera.update(dt);
      this.sim.setFocus(this.camera.x, this.camera.y, this.camera.viewRadius(), this.camera.zoom / this.camera.fitZoom());
      this.renderer.draw(dt);
      if (this.settings.showUI) this.hud.update();
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  /**
   * Im szybciej gracz chce przewinąć czas, tym mniej sensu ma liczenie
   * pojedynczych mięśni. Budżety szczegółowości kurczą się wraz z tempem —
   * przy 1000× cały świat idzie w tryb zbiorczy.
   */
  applyDetailBudget() {
    const s = this.paused ? 1 : this.speed;
    const max = this.settings.maxDetail || 220;
    if (s <= 5) { this.sim.maxFullDetail = max; this.sim.maxPointDetail = 850; }
    else if (s <= 20) { this.sim.maxFullDetail = Math.round(max * 0.3); this.sim.maxPointDetail = 420; }
    else if (s <= 100) { this.sim.maxFullDetail = 0; this.sim.maxPointDetail = 200; }
    else { this.sim.maxFullDetail = 0; this.sim.maxPointDetail = 0; }
  }

  runSteps() {
    const target = this.speed;
    const budget = target >= 100 ? 16 : this.stepBudgetMs;
    this.applyDetailBudget();
    const t0 = performance.now();
    let done = 0;
    while (done < target) {
      this.sim.step(1);
      done++;
      if (performance.now() - t0 > budget) break;
    }
    this.achievedSpeed = done;
  }

  // ---------------------------------------------------------------- sterowanie

  setSpeed(s) {
    if (s === 0) { this.paused = true; }
    else { this.speed = s; this.paused = false; }
    this.hud.syncButtons();
  }

  togglePause() { this.paused = !this.paused; this.hud.syncButtons(); }

  setOverlay(key) {
    this.renderer.overlay = key;
    this.renderer.overlayDirty = true;
    this.settings.overlay = key;
    store.setSettings(this.settings);
    this.hud.syncButtons();
  }

  select(o) {
    this.renderer.selected = o;
    this.hud.updateRight();
  }

  bindInput() {
    const c = this.canvas;
    let dragging = false, moved = 0, lx = 0, ly = 0;

    c.addEventListener('pointerdown', (e) => {
      dragging = true; moved = 0; lx = e.clientX; ly = e.clientY;
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      moved += Math.abs(dx) + Math.abs(dy);
      this.camera.panBy(dx, dy);
      lx = e.clientX; ly = e.clientY;
    });
    c.addEventListener('pointerup', (e) => {
      dragging = false;
      if (moved < 5 && this.sim) {
        const o = this.renderer.pick(e.clientX * devicePixelRatio, e.clientY * devicePixelRatio);
        this.select(o);
        if (o && e.detail >= 2) { this.camera.follow = o; this.camera.tzoom = Math.max(this.camera.tzoom, 22); }
      }
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.pow(1.0016, -e.deltaY);
      this.camera.zoomAt(e.clientX * devicePixelRatio, e.clientY * devicePixelRatio, f);
    }, { passive: false });

    document.getElementById('panelLeft').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      switch (b.dataset.act) {
        case 'playpause': this.togglePause(); break;
        case 'addcell': this.screens.cellSetup(); break;
        case 'lab': this.screens.lab(); break;
        case 'bank': this.screens.dnaBank(); break;
        case 'encyclopedia': this.screens.encyclopedia(); break;
        case 'chronicle': this.screens.chronicle(); break;
        case 'menu': this.screens.mainMenu(); break;
      }
    });

    document.getElementById('modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal' && modalDismissable()) closeModal();
    });

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Escape') {
        if (isModalOpen()) { if (modalDismissable()) closeModal(); }
        else this.screens.mainMenu();
        return;
      }
      if (isModalOpen()) return;
      switch (e.code) {
        case 'Space': e.preventDefault(); this.togglePause(); break;
        case 'Tab':
          e.preventDefault();
          this.applySettings({ showUI: !this.settings.showUI });
          break;
        case 'KeyC': this.screens.chronicle(); break;
        case 'KeyE': this.screens.encyclopedia(); break;
        case 'KeyB': this.screens.dnaBank(); break;
        case 'KeyL': this.screens.lab(); break;
        case 'KeyN': this.screens.cellSetup(); break;
        case 'KeyF': if (this.renderer.selected) this.camera.follow = this.renderer.selected; break;
        case 'Digit1': this.setSpeed(1); break;
        case 'Digit2': this.setSpeed(5); break;
        case 'Digit3': this.setSpeed(20); break;
        case 'Digit4': this.setSpeed(100); break;
        case 'Digit5': this.setSpeed(1000); break;
        case 'BracketLeft': this.camera.goToLevel(this.camera.level - 1); break;
        case 'BracketRight': this.camera.goToLevel(this.camera.level + 1); break;
      }
    });
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(innerWidth * dpr);
    this.canvas.height = Math.floor(innerHeight * dpr);
    this.canvas.style.width = innerWidth + 'px';
    this.canvas.style.height = innerHeight + 'px';
    if (this.camera) this.camera.resize();
  }

  // ---------------------------------------------------------------- interwencje

  /**
   * Wybór miejsca zasiewu. To decyzja gracza, nie preferencja silnika, ale
   * powinna opierać się na tym, co w danym miejscu faktycznie działa.
   * Ocena patrzy na potencjał kafla, a nie na chwilową porę dnia — inaczej
   * zasiew w nocy wybierałby los.
   */
  findSeedSpot(source) {
    return findSeedSpot(this.sim.world, this.sim.climate, this.sim.rng, source);
  }

  findBiomeSpot(biomeId) {
    const w = this.sim.world;
    for (let a = 0; a < 3000; a++) {
      const i = this.sim.rng.int(w.W * w.H);
      if (w.biome[i] === biomeId) {
        return { x: (i % w.W) * TILE + TILE / 2, y: ((i / w.W) | 0) * TILE + TILE / 2 };
      }
    }
    return { x: w.widthUnits / 2, y: w.heightUnits / 2 };
  }

  /**
   * Wprowadza do świata jeden organizm z zachowanego DNA. Zawsze jeden —
   * populacja może rosnąć wyłącznie przez rozmnażanie tego, co już żyje.
   * `source` to genom albo funkcja, która go zwraca.
   */
  introduceGenome(source, x, y) {
    if (!this.sim) return false;
    const g = typeof source === 'function' ? source() : source.clone();
    if (!g) return false;
    const px = x ?? this.sim.rng.float(0, this.sim.world.widthUnits);
    const py = y ?? this.sim.rng.float(0, this.sim.world.heightUnits);
    const o = this.sim.introduce(g, px, py, null, 'player');
    if (!o) {
      toast('Nie udało się', 'Świat osiągnął limit organizmów.', 'warn');
      return false;
    }
    this.sim.chronicle.record('life', 'Do świata wprowadzono organizm z zachowanego DNA.');
    toast('Wprowadzono DNA', 'Jeden organizm trafił do świata. Reszta zależy od niego.');
    return true;
  }

  focusSpecies(sp) {
    if (!sp || sp.count === 0) return;
    this.camera.setTarget(sp.cx, sp.cy);
    this.camera.tzoom = Math.max(this.camera.tzoom, 4);
    const found = this.sim.organisms.find(o => o.speciesId === sp.id);
    if (found) this.select(found);
  }

  saveOrganismDNA(o) {
    const sp = this.sim.species.get(o.speciesId);
    this.dnaSaveDialog(o.genome, sp ? sp.name : `osobnik ${o.id}`,
      `świat ${this.sim.world.params.seed}, rok ${Math.floor(this.sim.year)}`);
  }

  saveSpeciesDNA(sp) {
    this.dnaSaveDialog(sp.founderGenome, sp.name,
      `świat ${this.sim.world.params.seed}, gatunek powstał w roku ${Math.floor(sp.born / TICKS_PER_YEAR)}`);
  }

  dnaSaveDialog(genomeOrData, defName, origin) {
    const data = genomeOrData.serialize ? genomeOrData.serialize() : genomeOrData;
    const nameInput = el('input', { type: 'text', value: defName });
    const colInput = el('input', { type: 'text', value: '', placeholder: 'np. drapieżniki, linia A' });
    openModal(el('div', {},
      el('h2', { text: 'Zapisz DNA' }),
      el('p', { class: 'lead', text: 'Zapisany genom można wypuścić do dowolnego świata, także po milionach lat.' }),
      el('div', { class: 'field' }, el('label', {}, el('span', { text: 'Nazwa' })), nameInput),
      el('div', { class: 'field' }, el('label', {}, el('span', { text: 'Kolekcja' })), colInput),
      el('div', { class: 'actions' },
        el('button', {
          class: 'primary', text: 'Zapisz', onclick: () => {
            store.saveDNA({
              name: nameInput.value || defName, collection: colInput.value.trim(),
              origin, genome: data,
            });
            closeModal();
            toast('DNA zapisane', nameInput.value || defName);
          },
        }),
        el('button', { class: 'ghost', text: 'Anuluj', onclick: closeModal }))));
  }
}

function kindLabel(kind) {
  return ({
    life: 'Życie', species: 'Nowy gatunek', extinction: 'Wymieranie',
    disaster: 'Katastrofa', world: 'Świat', record: 'Rekord',
  })[kind] || 'Wydarzenie';
}

window.addEventListener('error', (e) => {
  console.error(e.error || e.message);
});

const app = new App();
window.evolution = app;
