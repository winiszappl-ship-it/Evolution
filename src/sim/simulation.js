import { World, TILE, SECTOR_TILES } from '../world/world.js';
import { Climate, TICKS_PER_YEAR } from '../world/climate.js';
import { Organism, DETAIL, resetOrgSeq, MINERAL_RATE, ABSORB_RATE, DIGEST_RATE } from '../bio/organism.js';
import { Genome } from '../bio/genome.js';
import { SpeciesRegistry } from '../bio/species.js';
import { Chronicle, Watcher } from './chronicle.js';
import { Disasters } from './disasters.js';
import { genomeFromDesign, randomGenome, defaultDesign } from '../bio/seed.js';
import { RNG } from '../core/rng.js';
import { clamp, TAU } from '../core/util.js';
import { bus } from '../core/bus.js';

export const MAX_ORGANISMS = 1600;   // sufit; faktyczny limit skaluje się z rozmiarem mapy
export const MAX_FULL_DETAIL = 220;
export const MAX_POINT_DETAIL = 850;
const POOL_INTERVAL = 16;
const HASH_CELL = TILE;
const MAX_NEIGHBORS = 24;
const SAVE_SAMPLE = 500;   // ilu przedstawicieli DNA trafia do zapisu

/**
 * Symulacja. Nie zna pojęcia gatunku roślinnego ani zwierzęcego, nie wybiera
 * zwycięzców i nie równoważy rozgrywki. Wykonuje tylko trzy rzeczy:
 * przepuszcza czas przez świat, pozwala organizmom działać w granicach fizyki
 * i zapisuje, co z tego wyszło.
 */
export class Simulation {
  constructor(params) {
    this.world = new World(params);
    this.climate = new Climate(this.world);
    this.species = new SpeciesRegistry();
    this.chronicle = new Chronicle();
    this.watcher = new Watcher(this.chronicle);
    this.disasters = new Disasters(this.world, this.climate, this.chronicle);
    this.rng = new RNG(this.world.seedNum ^ 0x5eed);
    this.organisms = [];
    this.hash = new Map();
    this.focus = { x: this.world.widthUnits / 2, y: this.world.heightUnits / 2, r: 400, zoom: 1 };
    this.stats = {
      organisms: 0, species: 0, fullDetail: 0, pointDetail: 0, births: 0, deaths: 0,
      avgCells: 0, avgNeurons: 0, maxGeneration: 0, biomass: 0,
    };
    // Pojemność świata rośnie z jego rozmiarem, ale ma twardy sufit —
    // poza nim symulacja przestałaby nadążać za obserwatorem.
    this.maxOrganisms = clamp(Math.round(this.world.W * this.world.H * 0.13), 600, 2600);
    this.maxFullDetail = MAX_FULL_DETAIL;
    this.maxPointDetail = MAX_POINT_DETAIL;
    this.poolInterval = POOL_INTERVAL;
    this.lastRecount = -1e9;
    this.epochs = 0;
    this.senseBuf = new Float64Array(64);
  }

  get year() { return this.climate.tick / TICKS_PER_YEAR; }
  get tick() { return this.climate.tick; }

  // ---------------------------------------------------------------- interwencje

  /** Gracz zasiewa pierwszą komórkę. Od tej chwili nie ma już wpływu na linię. */
  seed(design, x, y, count = 1) {
    const results = [];
    for (let i = 0; i < count; i++) {
      const g = genomeFromDesign(design || defaultDesign(), this.rng.float(0, 360));
      const px = x ?? this.rng.float(0, this.world.widthUnits);
      const py = y ?? this.rng.float(0, this.world.heightUnits);
      // rozrzut na kilka kafli — inaczej założyciele od razu zacieniają siebie
      const o = this.introduce(g, px + this.rng.gauss(0, 36), py + this.rng.gauss(0, 36));
      if (o) results.push(o);
    }
    if (results.length) {
      const first = this.organisms.length === results.length;
      this.chronicle.record('life',
        first ? 'Powstała pierwsza komórka. Świat przestał być martwy.'
          : 'Gracz zasiał nową linię komórkową.', first);
      this.chronicle.unlock('firstcell', 'Pierwsza komórka', 'Życie pojawiło się na tej planecie.');
      if (!first) this.epochs++;
    }
    return results;
  }

  seedRandom(x, y) {
    const g = randomGenome(this.rng);
    const o = this.introduce(g,
      x ?? this.rng.float(0, this.world.widthUnits),
      y ?? this.rng.float(0, this.world.heightUnits));
    if (o) this.chronicle.record('life', 'Do świata trafiła komórka o losowym DNA.');
    return o;
  }

  /** Wprowadzenie dowolnego genomu — używane też przez Bank DNA. */
  introduce(genome, x, y, energy = null) {
    if (this.organisms.length >= this.maxOrganisms) return null;
    const px = clamp(x, 2, this.world.widthUnits - 3);
    const py = clamp(y, 2, this.world.heightUnits - 3);
    const o = new Organism(genome, px, py, null, this.world);
    o.energy = energy ?? o.body.buildCost * 1.6;
    o.heading = this.rng.float(0, TAU);
    o.speciesId = 0;
    // sektor przypisujemy od razu — przy zgrubnym trybie siatka nie jest
    // przebudowywana co takt, a nowy organizm musi gdzieś należeć
    o._sector = this.world.sectorOf(o.x, o.y);
    const info = this.species.assign(o, this.tick);
    this.organisms.push(o);
    this.watcher.onBirth(o, info, this);
    return o;
  }

  cloneOrganism(org, jitter = 12) {
    if (!org) return null;
    return this.introduce(org.genome.clone(),
      org.x + this.rng.gauss(0, jitter), org.y + this.rng.gauss(0, jitter), org.energy * 0.8);
  }

  // ---------------------------------------------------------------- pętla

  step(steps = 1) {
    for (let s = 0; s < steps; s++) this.tickOnce();
  }

  tickOnce() {
    const world = this.world, climate = this.climate;
    climate.update(1);
    const tick = climate.tick;

    // Gdy nikt nie ogląda pojedynczych organizmów, nie ma też sensu co takt
    // przebudowywać całej struktury przestrzennej.
    const coarse = this.maxFullDetail === 0 && this.maxPointDetail === 0;
    this.poolInterval = coarse ? 64 : POOL_INTERVAL;
    if (!coarse || tick % 5 === 0 || !this._spatialReady) {
      this.assignSectors();
      this.assignDetail();
      this.buildHash();
      this._spatialReady = true;
    }
    const POOL = this.poolInterval;

    const births = [];
    let died = 0;

    for (let i = 0; i < this.organisms.length; i++) {
      const o = this.organisms[i];
      if (!o.alive) continue;
      const sector = o._sector;
      const detail = sector.detail;

      let dt = 1;
      if (detail === 0) {
        if ((tick + o.id) % POOL !== 0) continue;
        dt = POOL;
      }

      world.refreshSector(sector, tick, climate);

      // Ciało bez mięśni nie ma czym poruszyć — sygnał nerwowy nie miałby
      // gdzie trafić, więc nie ma po co go liczyć.
      const motile = o.brain.effectors.length > 0;

      if (detail === 2) {
        if (o.detail !== DETAIL.FULL) o.promote();
        if (motile) o.stepBrainOnce(world, climate, dt);
        o.stepPhysics(world, climate, dt);
      } else {
        if (o.detail === DETAIL.FULL) o.demote();
        if (motile) {
          o.stepBrainOnce(world, climate, dt);
          this.stepReduced(o, dt);
        } else {
          this.stepDrift(o, dt);
        }
      }

      o._biome = world.biome[world.tileOf(o.x, o.y)];
      o.metabolize(world, climate, dt);

      if (!o.alive) { died++; continue; }

      if (o.canReproduce() && this.organisms.length + births.length < this.maxOrganisms) {
        let partner = null;
        if (o.genome.params.sexual > 0.35) partner = this.findPartner(o);
        const child = o.reproduce(world, this.rng, 0.5, partner);
        births.push(child);
      }
    }

    this.interactions(tick);
    this.disasters.step(this, 1);

    for (const c of births) {
      c._sector = world.sectorOf(c.x, c.y);
      const isolated = this.isIsolated(c);
      const info = this.species.assign(c, tick, isolated);
      this.organisms.push(c);
      this.watcher.onBirth(c, info, this);
    }
    this.stats.births += births.length;

    // usunięcie martwych — ich ciała zasilają obieg materii
    if (died > 0) {
      let w = 0;
      for (let i = 0; i < this.organisms.length; i++) {
        const o = this.organisms[i];
        if (o.alive) { this.organisms[w++] = o; continue; }
        const ti = world.tileOf(o.x, o.y);
        world.addDetritus(ti, o.body.mass * 3.2 + Math.max(0, o.energy) * 0.55);
        this.stats.deaths++;
        this.watcher.onDeath(o);
      }
      this.organisms.length = w;
    }

    if (tick - this.lastRecount >= 160) {
      this.lastRecount = tick;
      const gone = this.species.recount(this.organisms, tick);
      this.species.prune();
      for (const s of gone) {
        if (s.peak >= 12) this.chronicle.record('extinction', `Gatunek ${s.name} wymarł po ${((tick - s.born) / TICKS_PER_YEAR).toFixed(1)} latach.`);
      }
      this.updateStats();
    }

    this.watcher.tick(this);
  }

  /**
   * Ruch bez pełnej fizyki: napęd różnicowy wyliczony z aktywności mięśni.
   * To uproszczenie tej samej mechaniki, nie osobne "zachowanie" — kierunek
   * nadal wynika z sygnałów, które organizm odbiera własnymi receptorami.
   */
  stepReduced(o, dt) {
    const eff = o.brain.effectors;
    let fwd = 0, turn = 0;
    for (let i = 0; i < eff.length; i++) {
      const b = o.body.bonds[eff[i].bond];
      const A = o.body.cells[b.a], B = o.body.cells[b.b];
      const side = (A.y + B.y) * 0.5;
      fwd += Math.abs(eff[i].act) * eff[i].strength;
      turn += eff[i].act * eff[i].strength * Math.sign(side || 1);
    }
    const n = Math.max(1, eff.length);
    const motility = o.body.cap.contract / (o.body.mass + 2);
    const base = o.measuredSpeed > 0.001 ? o.measuredSpeed : motility * 0.55;
    const speed = base * clamp(fwd / n, 0, 1.4);

    o.heading += (turn / n) * 0.09 * dt + this.rng.gauss(0, 0.03) * dt;

    const ti = this.world.tileOf(o.x, o.y);
    const inWater = this.world.isWaterAt(ti);
    const flow = inWater ? this.climate.currentAt(o.x, o.y)
      : { x: this.climate.windX * (o.flying ? 1.4 : 0.06), y: this.climate.windY * (o.flying ? 1.4 : 0.06) };

    o.vx = Math.cos(o.heading) * speed + flow.x * 0.25;
    o.vy = Math.sin(o.heading) * speed + flow.y * 0.25;
    o.x = clamp(o.x + o.vx * dt, 1, this.world.widthUnits - 2);
    o.y = clamp(o.y + o.vy * dt, 1, this.world.heightUnits - 2);
    o.moveCost = (fwd / n) * o.body.cap.contract * 0.0016 * o.genome.params.metabolism * dt;
    o.z *= Math.pow(0.97, dt);
  }

  /** Organizm bez własnego napędu podlega tylko prądom i wiatrowi. */
  stepDrift(o, dt) {
    const ti = this.world.tileOf(o.x, o.y);
    if (this.world.isWaterAt(ti)) {
      const f = this.climate.currentAt(o.x, o.y);
      o.vx = f.x * 0.22; o.vy = f.y * 0.22;
      o.x = clamp(o.x + o.vx * dt, 1, this.world.widthUnits - 2);
      o.y = clamp(o.y + o.vy * dt, 1, this.world.heightUnits - 2);
    } else {
      o.vx = 0; o.vy = 0;
    }
    o.moveCost = 0;
    if (o.z > 0) o.z *= Math.pow(0.97, dt);
  }

  findPartner(o) {
    const neighbors = this.queryHash(o.x, o.y, o.radius * 6);
    for (const other of neighbors) {
      if (other !== o && other.alive && other.speciesId === o.speciesId
        && other.genome.params.sexual > 0.35) return other;
    }
    return null;
  }

  isIsolated(child) {
    // sąsiedztwo bez innych osobników tego gatunku sprzyja rozejściu się linii
    const near = this.queryHash(child.x, child.y, TILE * SECTOR_TILES * 0.5);
    let same = 0;
    for (const o of near) if (o.speciesId === child.speciesId) same++;
    return same < 2;
  }

  // ---------------------------------------------------------------- przestrzeń

  assignSectors() {
    const world = this.world;
    for (const s of world.sectors) { s.organisms.length = 0; s.activity = s.activity * 0.98; }
    if (!this._loadTiles) this._loadTiles = [];
    for (const ti of this._loadTiles) {
      world.photoLoad[ti] = 0; world.mineralLoad[ti] = 0; world.detritusLoad[ti] = 0;
    }
    this._loadTiles.length = 0;

    for (const o of this.organisms) {
      if (!o.alive) continue;
      const s = world.sectorOf(o.x, o.y);
      o._sector = s;
      s.organisms.push(o);

      // Zapotrzebowanie wszystkich mieszkańców kafla, zebrane zanim ktokolwiek
      // zdąży cokolwiek pobrać. Bez tego o wyniku decydowałaby kolejność
      // w tablicy, a nie budowa organizmu.
      const cap = o.body.cap;
      const ti = world.tileOf(o.x, o.y);
      o._tile = ti;
      if (world.photoLoad[ti] === 0 && world.mineralLoad[ti] === 0 && world.detritusLoad[ti] === 0) {
        this._loadTiles.push(ti);
      }
      // Światło padające na kafel jest skończone. Większe ciało przechwytuje
      // większą jego część — to jedyny powód, dla którego opłaca się rosnąć.
      world.photoLoad[ti] += cap.photo * o.lightEdge;
      world.mineralLoad[ti] += cap.photo * MINERAL_RATE;
      world.detritusLoad[ti] += cap.absorb * ABSORB_RATE + cap.digest * DIGEST_RATE;
    }
  }

  /**
   * Poziom szczegółowości. Blisko kamery liczymy komórki i siły. Dalej —
   * organizmy jako punkty. Najdalej — rzadkie, zbiorcze aktualizacje.
   */
  assignDetail() {
    const { focus } = this;
    const secSize = TILE * SECTOR_TILES;
    const cand = [];
    for (const s of this.world.sectors) {
      const cx = (s.x0 + s.x1) * 0.5 * TILE;
      const cy = (s.y0 + s.y1) * 0.5 * TILE;
      const d = Math.hypot(cx - focus.x, cy - focus.y);
      s._dist = d;
      s.detail = 0;
      if (s.organisms.length) cand.push(s);
    }
    cand.sort((a, b) => (a._dist - a.activity * secSize) - (b._dist - b.activity * secSize));

    let fullBudget = this.maxFullDetail;
    let pointBudget = this.maxPointDetail;
    let activityBudget = Math.round(this.maxPointDetail * 0.3);
    let full = 0, point = 0;
    const fullRange = focus.r + secSize;

    for (const s of cand) {
      const n = s.organisms.length;
      if (fullBudget >= n && s._dist < fullRange && focus.zoom > 0.55) {
        s.detail = 2; fullBudget -= n; full += n;
        continue;
      }
      // Sektor liczony co takt, ale bez fizyki komórek. Reszta świata dostaje
      // rzadsze, zbiorcze aktualizacje — dokładnie tam, gdzie nikt nie patrzy.
      if (pointBudget >= n && pointBudget > 0) {
        s.detail = 1; pointBudget -= n; point += n;
      } else if (s.activity > 1.2 && activityBudget >= n) {
        // sektor, w którym coś się dzieje, nie zasypia — ale i on ma swój limit
        s.detail = 1; activityBudget -= n; point += n;
      } else {
        s.detail = 0;
      }
    }
    this.stats.fullDetail = full;
    this.stats.pointDetail = point;
  }

  buildHash() {
    this.hash.clear();
    for (const o of this.organisms) {
      if (!o.alive) continue;
      const kx = Math.floor(o.x / HASH_CELL), ky = Math.floor(o.y / HASH_CELL);
      const key = kx * 46349 + ky;
      let arr = this.hash.get(key);
      if (!arr) { arr = []; this.hash.set(key, arr); }
      arr.push(o);
    }
  }

  /**
   * Zapytanie przestrzenne. Liczba sprawdzanych sąsiadów jest ograniczona —
   * w gęstym skupisku i tak nie da się dotknąć wszystkich naraz.
   */
  queryHash(x, y, r, reuse = null) {
    const out = reuse || [];
    out.length = 0;
    const k0x = Math.floor((x - r) / HASH_CELL), k1x = Math.floor((x + r) / HASH_CELL);
    const k0y = Math.floor((y - r) / HASH_CELL), k1y = Math.floor((y + r) / HASH_CELL);
    for (let kx = k0x; kx <= k1x; kx++) {
      for (let ky = k0y; ky <= k1y; ky++) {
        const arr = this.hash.get(kx * 46349 + ky);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          out.push(arr[i]);
          if (out.length >= MAX_NEIGHBORS) return out;
        }
      }
    }
    return out;
  }

  /**
   * Kontakt między organizmami. Nie ma tu ataku ani obrony jako intencji —
   * jest tylko komórka zdolna do trawienia, która dotyka cudzej tkanki.
   */
  interactions(tick) {
    if (!this._qbuf) this._qbuf = [];
    const orgs = this.organisms;
    for (let i = 0; i < orgs.length; i++) {
      const o = orgs[i];
      o._dens = 0; o._cont = 0;
      o._act = o._sector.detail !== 0 || (tick + o.id) % this.poolInterval === 0;
    }

    for (let i = 0; i < orgs.length; i++) {
      const o = orgs[i];
      if (!o.alive || !o._act) continue;
      const sec = o._sector;
      const dt = sec.detail === 0 ? this.poolInterval : 1;
      const near = this.queryHash(o.x, o.y, o.radius + 6, this._qbuf);

      for (let k = 0; k < near.length; k++) {
        const p = near[k];
        if (p === o || !p.alive) continue;
        // każda para rozpatrywana raz; jeśli druga strona śpi, obsługuje ją ta
        if (p.id < o.id && p._act) continue;

        const dx = p.x - o.x, dy = p.y - o.y;
        const d2 = dx * dx + dy * dy;
        o._dens++; p._dens++;
        const rr = o.radius + p.radius;
        if (d2 > rr * rr) continue;
        if (Math.abs(o.z - p.z) > 0.6) continue;   // różne wysokości się nie stykają

        const d = Math.sqrt(d2);
        const overlap = rr - d;
        const rel = overlap / rr;
        o._cont += rel; p._cont += rel;
        sec.activity += 0.02;

        // odepchnięcie — dwa ciała nie zajmują tego samego miejsca
        const nx = d > 1e-5 ? dx / d : 1, ny = d > 1e-5 ? dy / d : 0;
        const push = overlap * 0.06;
        const mo = o.mass, mp = p.mass;
        const tot = mo + mp;
        o.x -= nx * push * (mp / tot); o.y -= ny * push * (mp / tot);
        p.x += nx * push * (mo / tot); p.y += ny * push * (mo / tot);

        const gO = this.feed(o, p, rel, dt);
        const gP = this.feed(p, o, rel, dt);
        if (gO > 0 || gP > 0) this.watcher.noteContact(o, p, gO, gP);
      }
    }

    for (let i = 0; i < orgs.length; i++) {
      const o = orgs[i];
      o.neighborDensity = clamp(o._dens / 8, 0, 1.5);
      o.contact = clamp(o._cont, 0, 1.5);
      if (o.particles) o.particles.touch.fill(o.contact);
    }
  }

  /** Przepływ energii przy kontakcie. Zwraca ile `a` zyskał kosztem `b`. */
  feed(a, b, overlap, dt) {
    const digest = a.body.cap.digest;
    if (digest < 0.05 || !b.alive) return 0;
    // Obrona to pancerz, błona i sztywność tkanki — a także sama wielkość:
    // ciała większego od napastnika po prostu nie da się objąć.
    const gape = 1 + Math.max(0, b.radius - a.radius) * 0.9;
    const defense = (1 + b.body.cap.armor * 0.05 + b.genome.params.membrane * 1.4
      + b.body.cap.rigid * 0.02) * gape;
    const power = digest * overlap * 0.09 * dt / defense;
    const take = Math.min(b.energy * 0.4, power * 12);
    if (take <= 0) return 0;
    b.energy -= take;
    b.integrity -= take * 0.0026 / Math.max(0.4, b.mass);
    const got = take * 0.62;                 // straty przy przekazywaniu energii
    a.energy = Math.min(a.maxEnergy, a.energy + got);
    a.gain.predation += got;
    a._sector.activity += 0.05;
    if (b.integrity <= 0 || b.energy <= 0) {
      b.alive = false;
      b.deathCause = 'zjedzony';
    }
    return got;
  }

  updateStats() {
    let cells = 0, neurons = 0, maxGen = 0, biomass = 0;
    for (const o of this.organisms) {
      cells += o.body.cellCount;
      neurons += o.brain.neurons.length;
      biomass += o.body.mass;
      if (o.generation > maxGen) maxGen = o.generation;
    }
    const n = Math.max(1, this.organisms.length);
    this.stats.organisms = this.organisms.length;
    this.stats.species = this.species.aliveCount;
    this.stats.avgCells = cells / n;
    this.stats.avgNeurons = neurons / n;
    this.stats.maxGeneration = maxGen;
    this.stats.biomass = biomass;
    bus.emit('stats', this.stats);
  }

  setFocus(x, y, r, zoom) {
    this.focus.x = x; this.focus.y = y; this.focus.r = r; this.focus.zoom = zoom;
  }

  // ---------------------------------------------------------------- zapis

  /**
   * Zapis nie utrwala każdego osobnika. Utrwala świat, historię, gatunki oraz
   * reprezentatywną próbkę żywego DNA wraz z liczebnościami populacji — tyle,
   * ile potrzeba, żeby świat dało się wznowić i żeby dało się analizować
   * ewolucję. Konkretne ciała i tak są tylko chwilowym stanem.
   */
  serialize(sampleLimit = SAVE_SAMPLE) {
    this.world.refreshAll(this.tick, this.climate);
    const bySpecies = new Map();
    for (const o of this.organisms) {
      let arr = bySpecies.get(o.speciesId);
      if (!arr) { arr = []; bySpecies.set(o.speciesId, arr); }
      arr.push(o);
    }

    const total = this.organisms.length;
    const sample = [];
    const populations = [];
    for (const [sid, arr] of bySpecies) {
      // co najmniej jeden osobnik z gatunku, reszta proporcjonalnie
      const quota = total > sampleLimit
        ? Math.max(1, Math.round(arr.length / total * sampleLimit))
        : arr.length;
      const step = Math.max(1, arr.length / quota);
      const picked = [];
      for (let k = 0; picked.length < quota && Math.floor(k * step) < arr.length; k++) {
        picked.push(arr[Math.floor(k * step)]);
      }
      for (const o of picked) sample.push(o.serialize());
      populations.push({ sp: sid, n: arr.length, saved: picked.length });
    }

    return {
      version: 2,
      world: this.world.serialize(),
      climate: this.climate.serialize(),
      species: this.species.serialize(),
      chronicle: this.chronicle.serialize(),
      organisms: sample,
      populations,
      stats: this.stats,
      epochs: this.epochs,
      rng: this.rng.serialize(),
      seq: { org: this.organisms.reduce((m, o) => Math.max(m, o.id), 0) + 1 },
    };
  }

  static deserialize(data) {
    const sim = new Simulation(data.world.params);
    sim.world = World.deserialize(data.world);
    sim.climate = new Climate(sim.world);
    sim.climate.load(data.climate);
    sim.species = SpeciesRegistry.deserialize(data.species);
    sim.chronicle = new Chronicle();
    sim.chronicle.load(data.chronicle);
    sim.watcher = new Watcher(sim.chronicle);
    sim.disasters = new Disasters(sim.world, sim.climate, sim.chronicle);
    sim.rng = RNG.deserialize(data.rng ?? 12345);
    sim.epochs = data.epochs || 0;
    resetOrgSeq(data.seq?.org || 1);

    for (const od of data.organisms || []) {
      // Ciało odbudowujemy z DNA — bo DNA właśnie tym jest: instrukcją budowy.
      const g = Genome.deserialize(od.g);
      const o = new Organism(g, od.x, od.y, od.e, sim.world);
      o._fp = g.fingerprint();
      o.id = od.id; o.age = od.a; o.speciesId = od.sp; o.parentId = od.pid;
      o.offspring = od.off; o.heading = od.h; o.integrity = od.it;
      o.measuredSpeed = od.ms || 0;
      if (od.gn) {
        o.gain.photo = od.gn[0]; o.gain.absorb = od.gn[1];
        o.gain.detritus = od.gn[2]; o.gain.predation = od.gn[3];
      }
      o._sector = sim.world.sectorOf(o.x, o.y);
      sim.organisms.push(o);
    }

    // Odtworzenie liczebności populacji z zapisanych przedstawicieli. Nie są to
    // te same osobniki co przed zapisem — to ta sama populacja, nie ta sama chwila.
    for (const p of data.populations || []) {
      const members = sim.organisms.filter(o => o.speciesId === p.sp);
      if (!members.length) continue;
      let missing = p.n - members.length;
      let i = 0;
      while (missing-- > 0 && sim.organisms.length < sim.maxOrganisms) {
        const src = members[i++ % members.length];
        const g = src.genome.clone();
        g.generation = src.generation;
        const ang = sim.rng.float(0, TAU);
        const d = sim.rng.float(2, 60);
        const c = new Organism(g,
          clamp(src.x + Math.cos(ang) * d, 2, sim.world.widthUnits - 3),
          clamp(src.y + Math.sin(ang) * d, 2, sim.world.heightUnits - 3),
          src.energy * sim.rng.float(0.5, 1), sim.world);
        c.speciesId = src.speciesId;
        c.generation = src.generation;
        c._fp = src._fp;
        c.age = src.age * sim.rng.float(0.2, 1);
        c._sector = sim.world.sectorOf(c.x, c.y);
        sim.organisms.push(c);
      }
    }

    sim.species.recount(sim.organisms, sim.tick);
    sim.updateStats();
    return sim;
  }
}
