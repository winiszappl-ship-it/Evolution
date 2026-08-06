import { TICKS_PER_YEAR } from '../world/climate.js';
import { bus } from '../core/bus.js';

const MAX_ENTRIES = 900;

/** Dziennik świata. Historia jest zapisywana, nie odtwarzana — czasu nie cofamy. */
export class Chronicle {
  constructor() {
    this.entries = [];
    this.tick = 0;
    this.achievements = new Map();
    this.records = {};
  }

  record(kind, text, important = false) {
    const e = { tick: this.tick, year: this.tick / TICKS_PER_YEAR, kind, text, important };
    this.entries.push(e);
    if (this.entries.length > MAX_ENTRIES) {
      const keep = this.entries.filter(x => x.important);
      const rest = this.entries.filter(x => !x.important).slice(-Math.max(0, MAX_ENTRIES - keep.length));
      this.entries = keep.concat(rest).sort((a, b) => a.tick - b.tick);
    }
    bus.emit('chronicle', e);
    return e;
  }

  unlock(key, title, desc) {
    if (this.achievements.has(key)) return false;
    const a = { key, title, desc, tick: this.tick, year: this.tick / TICKS_PER_YEAR };
    this.achievements.set(key, a);
    this.record('achievement', `${title} — ${desc}`, true);
    bus.emit('achievement', a);
    return true;
  }
}

/**
 * Wykrywanie wydarzeń. Nic z tego nie jest celem gry — to obserwator, który
 * nazywa rzeczy dopiero po tym, jak ewolucja je stworzy.
 */
export class Watcher {
  constructor(chronicle) {
    this.ch = chronicle;
    this.lastSpeciesCount = 0;
    this.peakSpecies = 0;
    this.extinctionWatch = 0;
    this.contactPairs = new Map();
    this.lastCheck = 0;
    this.popMark = 0;
    this.reportedCeiling = false;
  }

  onBirth(org, speciesInfo, sim) {
    const ch = this.ch;
    if (speciesInfo.isNew && speciesInfo.from) {
      ch.record('species',
        `Powstał gatunek ${speciesInfo.species.name}, odgałęzienie od ${speciesInfo.from.name}.`);
    }
    if (org.body.cellCount > 1) ch.unlock('multicell', 'Wielokomórkowość', 'Organizm zbudowany z więcej niż jednej komórki utrzymał się przy życiu.');
    if (org.body.cellCount >= 12) ch.unlock('tissue', 'Tkanki', 'Ciało z co najmniej dwunastu komórek, z podziałem funkcji.');
    if (org.brain.neurons.length >= 1) ch.unlock('neuron', 'Pierwszy neuron', 'Komórka zaczęła przewodzić sygnał zamiast tylko pracować.');
    if (org.brain.neurons.length >= 20 && org.brain.synCount >= 45) {
      ch.unlock('mind', 'Układ nerwowy', `Sieć ${org.brain.neurons.length} neuronów i ${Math.round(org.brain.synCount)} połączeń.`);
    }
    if (org.brain.learnRate > 0.1 && org.brain.neurons.length > 6) {
      ch.unlock('learning', 'Uczenie się', 'Synapsy zmieniają siłę w trakcie życia osobnika.');
    }
    if (org.body.muscleCount >= 1) ch.unlock('muscle', 'Ruch własny', 'Wiązanie między komórkami zaczęło się kurczyć.');
    const lightSensors = org.brain.sensors.filter(s => s.mod === 0).length;
    if (lightSensors >= 3) ch.unlock('eye', 'Wrażliwość na światło', `Skupisko ${lightSensors} receptorów świetlnych w jednym ciele.`);
    if (org.genome.params.sexual > 0.6) ch.unlock('sex', 'Wymiana genów', 'Linia zaczęła łączyć materiał genetyczny dwóch osobników.');
    if (org.genome.genes.length >= 40) ch.unlock('genome40', 'Rozrost genomu', `DNA urosło do ${org.genome.genes.length} genów.`);
  }

  onDeath(org) { /* śmierć pojedynczego osobnika nie jest wydarzeniem historycznym */ }

  tick(sim) {
    const ch = this.ch;
    ch.tick = sim.climate.tick;
    if (sim.climate.tick - this.lastCheck < 40) return;
    this.lastCheck = sim.climate.tick;

    const alive = sim.species.aliveSpecies();
    const n = alive.length;

    // wymierania — nagły spadek liczby gatunków
    this.peakSpecies = Math.max(this.peakSpecies, n);
    if (this.lastSpeciesCount >= 8 && n < this.lastSpeciesCount * 0.55) {
      const pct = Math.round((1 - n / this.lastSpeciesCount) * 100);
      ch.record('extinction', `Wymarło ${pct}% gatunków. Pozostało ${n}.`, true);
      if (pct >= 75) ch.unlock('massextinction', 'Wielkie wymieranie', `Świat stracił ${pct}% swoich gatunków.`);
      if (!ch.records.biggestExtinction || pct > ch.records.biggestExtinction) ch.records.biggestExtinction = pct;
    }
    this.lastSpeciesCount = n;

    // Wybuch populacji: to samo, co wymieranie, tylko w drugą stronę.
    // Kronika milczała o wzroście, więc ostatnie podwojenia — przy tempie
    // 100× mieszczące się w sekundzie realnego czasu — wyglądały jak tysiąc
    // organizmów powstałych znikąd. Rosną wykładniczo od pierwszej komórki;
    // widać to dopiero na końcu, bo tak wygląda krzywa wykładnicza.
    const pop = sim.organisms.length;
    if (pop >= 24 && pop >= this.popMark * 2) {
      if (this.popMark > 0) {
        ch.record('life', `Populacja podwoiła się do ${pop} organizmów.`, pop >= 500);
      }
      this.popMark = pop;
    } else if (pop < this.popMark * 0.5) {
      this.popMark = pop;
    }

    // Sufit populacji nie jest zjawiskiem przyrodniczym, tylko granicą pamięci.
    // Skoro wpływa na to, co gracz widzi, świat ma obowiązek się do tego przyznać.
    if (pop >= sim.maxOrganisms * 0.98) {
      if (!this.reportedCeiling) {
        ch.record('world', `Liczba organizmów sięgnęła granicy tego świata `
          + `(${sim.maxOrganisms}). Powyżej niej nikt się już nie urodzi — `
          + `to ograniczenie silnika, nie przyrody.`, true);
        this.reportedCeiling = true;
      }
    } else if (pop < sim.maxOrganisms * 0.8) {
      this.reportedCeiling = false;
    }

    if (sim.organisms.length === 0 && this.hadLife) {
      if (!this.reportedSterile) {
        ch.record('extinction', 'Życie wygasło. Świat trwa dalej, pusty.', true);
        this.reportedSterile = true;
      }
    } else if (sim.organisms.length > 0) {
      this.hadLife = true;
      this.reportedSterile = false;
    }

    // przegląd żywych organizmów pod kątem zdarzeń, które właśnie się wydarzyły
    let flyer = null, predator = null, amph = null, deepest = null;
    const speciesBiomes = new Map();
    for (const o of sim.organisms) {
      if (!o.alive) continue;
      if (o.z > 0.5 && !flyer) flyer = o;
      const d = o.diet();
      if (d.key === 'predation' && d.frac.predation > 0.5 && o.gain.predation > 8) predator = predator || o;
      let set = speciesBiomes.get(o.speciesId);
      if (!set) { set = new Set(); speciesBiomes.set(o.speciesId, set); }
      set.add(sim.world.isWaterAt(o.tileIndex) ? 'w' : 'l');
    }
    for (const [sid, set] of speciesBiomes) {
      if (set.size > 1) { amph = sim.species.get(sid); break; }
    }

    if (predator) ch.unlock('predator', 'Konsument materii żywej',
      `Gatunek ${sim.species.get(predator.speciesId)?.name ?? '?'} zdobywa większość energii z innych organizmów.`);
    if (flyer) ch.unlock('flight', 'Oderwanie od podłoża',
      'Praca mięśni wystarczyła, by utrzymać ciało w powietrzu.');
    if (amph) ch.unlock('amphibian', 'Życie na granicy wody',
      `Gatunek ${amph.name} występuje jednocześnie w wodzie i na lądzie.`);

    // symbioza: dwa różne gatunki w trwałym kontakcie, oba zyskują
    for (const [key, v] of this.contactPairs) {
      if (v.ticks > 260 && v.bothGain) {
        ch.unlock('symbiosis', 'Symbioza', 'Dwa gatunki utrzymują trwały kontakt, na którym oba zyskują.');
        break;
      }
    }
    if (this.contactPairs.size > 400) this.contactPairs.clear();

    // rekordy — nazywane dopiero, gdy zostaną pobite z zapasem
    const oldest = alive.slice().sort((a, b) => a.born - b.born)[0];
    if (oldest && sim.climate.tick - oldest.born > 40 * 1536) {
      ch.unlock('ancient', 'Żywa skamieniałość',
        `Gatunek ${oldest.name} trwa nieprzerwanie od ponad 40 lat świata.`);
    }
    this.checkRecord(sim, 'cells', o => o.body.cellCount, 'Największy organizm', c => `Ciało z ${c} komórek.`);
    this.checkRecord(sim, 'neurons', o => o.brain.neurons.length, 'Najbardziej złożony układ nerwowy', c => `${c} neuronów.`);
    this.checkRecord(sim, 'offspring', o => o.offspring, 'Najpłodniejszy osobnik', c => `${c} potomków z jednego ciała.`);
    this.checkRecord(sim, 'speed', o => o.measuredSpeed, 'Najszybszy organizm', c => `Prędkość ${c.toFixed(2)} jednostki na takt.`);
  }

  checkRecord(sim, key, fn, title, desc) {
    let best = 0, who = null;
    for (const o of sim.organisms) {
      if (!o.alive) continue;
      const v = fn(o);
      if (v > best) { best = v; who = o; }
    }
    const prev = this.ch.records[key] || 0;
    if (best > prev * 1.5 && best > (key === 'speed' ? 0.35 : 3)) {
      this.ch.records[key] = best;
      const sp = who ? sim.species.get(who.speciesId) : null;
      this.ch.record('record', `${title}: ${sp ? sp.name : '?'} — ${desc(best)}`);
    } else if (best > prev) {
      this.ch.records[key] = best;
    }
  }

  noteContact(a, b, aGain, bGain) {
    if (a.speciesId === b.speciesId) return;
    const key = a.speciesId < b.speciesId ? `${a.speciesId}:${b.speciesId}` : `${b.speciesId}:${a.speciesId}`;
    let v = this.contactPairs.get(key);
    if (!v) { v = { ticks: 0, bothGain: false }; this.contactPairs.set(key, v); }
    v.ticks++;
    if (aGain > 0 && bGain > 0) v.bothGain = true;
  }
}
