import { Genome } from './genome.js';
import { coinName } from '../core/util.js';
import { biomeName } from '../world/biomes.js';

export const SPECIATION_THRESHOLD = 1.0;
const ISOLATION_FACTOR = 0.5;   // izolacja geograficzna obniża próg

/**
 * Gatunek nie jest kategorią zdefiniowaną z góry. To linia potomków, która
 * odsunęła się genetycznie od swojego przodka na tyle, że przestaje się w nim
 * mieścić. Silnik nie wie, ile gatunków powstanie ani jak będą wyglądać.
 */
export class Species {
  constructor(id, genome, tick, parent = null) {
    this.id = id;
    this.name = coinName(id * 7919 + 13);
    this.fingerprint = genome.fingerprint();
    this.founderGenome = genome.serialize();
    this.parent = parent ? parent.id : 0;
    this.children = [];
    this.born = tick;
    this.extinct = null;
    this.count = 0;
    this.peak = 0;
    this.everBorn = 0;
    this.totalOffspring = 0;
    this.biomes = new Map();
    this.cx = 0; this.cy = 0;             // centroid geograficzny
    this.hue = genome.params.hue;
    this.avg = { cells: 0, mass: 0, energy: 0, neurons: 0, muscles: 0, speed: 0, generation: 0 };
    this.dietFrac = { litho: 0, absorb: 0, plant: 0, carrion: 0, predation: 0 };
    this.trophic = 'nieokreślona';   // opis zmierzony, nie kategoria z góry
    this.notes = [];
    this.depth = parent ? parent.depth + 1 : 0;
  }

  get alive() { return this.extinct === null; }
  get age() { return (this.extinct ?? Infinity) - this.born; }

  dominantDiet() {
    let k = 'litho', v = -1;
    for (const key of Object.keys(this.dietFrac)) if (this.dietFrac[key] > v) { v = this.dietFrac[key]; k = key; }
    const labels = {
      litho: 'litotrof', absorb: 'osmotrof', plant: 'zjadacz materii roślinnej',
      carrion: 'zjadacz szczątków', predation: 'konsument materii żywej',
    };
    return { key: k, label: v > 0.001 ? labels[k] : 'nieokreślony', frac: v };
  }

  mainBiome() {
    let best = -1, bid = -1;
    for (const [b, c] of this.biomes) if (c > best) { best = c; bid = b; }
    return bid >= 0 ? biomeName(bid) : '—';
  }
}

export class SpeciesRegistry {
  constructor() {
    this.list = new Map();
    this.nextId = 1;
    this.aliveCount = 0;
  }

  create(genome, tick, parent = null) {
    const s = new Species(this.nextId++, genome, tick, parent);
    this.list.set(s.id, s);
    if (parent) parent.children.push(s.id);
    return s;
  }

  get(id) { return this.list.get(id); }

  /**
   * Przypisuje organizm do gatunku. Jeśli odbiegł zbyt daleko od linii rodzica,
   * powstaje nowy gatunek — wraz z zapisem, od kogo pochodzi.
   */
  assign(org, tick, isolated = false) {
    const parentSpecies = this.list.get(org.speciesId);
    const fp = org.genome.fingerprint();
    org._fp = fp;
    if (!parentSpecies) {
      const s = this.create(org.genome, tick);
      org.speciesId = s.id;
      s.everBorn++;
      return { species: s, isNew: true };
    }
    const d = Genome.distance(fp, parentSpecies.fingerprint);
    const thr = SPECIATION_THRESHOLD * (isolated ? ISOLATION_FACTOR : 1);
    if (d > thr) {
      const s = this.create(org.genome, tick, parentSpecies);
      s.notes.push(`Odłączył się od gatunku ${parentSpecies.name} (dystans ${d.toFixed(2)})`);
      org.speciesId = s.id;
      s.everBorn++;
      return { species: s, isNew: true, from: parentSpecies, distance: d };
    }
    parentSpecies.everBorn++;
    return { species: parentSpecies, isNew: false };
  }

  /** Przelicza statystyki gatunków na podstawie żywych osobników. */
  recount(organisms, tick) {
    for (const s of this.list.values()) {
      s.count = 0;
      s._acc = null;
    }
    for (const o of organisms) {
      if (!o.alive) continue;
      const s = this.list.get(o.speciesId);
      if (!s) continue;
      s.count++;
      if (!s._acc) {
        s._acc = {
          cells: 0, mass: 0, energy: 0, neurons: 0, muscles: 0, speed: 0, gen: 0, cx: 0, cy: 0,
          d: { litho: 0, absorb: 0, plant: 0, carrion: 0, predation: 0 }, dn: 0, troph: new Map(),
          fp: new Float32Array(s.fingerprint.length), fpN: 0,
        };
      }
      const a = s._acc;
      if (o._fp && o._fp.length === a.fp.length) {
        for (let k = 0; k < a.fp.length; k++) a.fp[k] += o._fp[k];
        a.fpN++;
      }
      a.cells += o.body.cellCount;
      a.mass += o.body.mass;
      a.energy += o.energy;
      a.neurons += o.brain.neurons.length;
      a.muscles += o.brain.effectors.length;
      a.speed += o.measuredSpeed;
      a.gen += o.generation;
      a.cx += o.x; a.cy += o.y;
      const dd = o.diet();
      if (dd.key !== 'none') {
        a.dn++;
        for (const k of Object.keys(a.d)) a.d[k] += dd.frac[k] || 0;
        a.troph.set(dd.trophic, (a.troph.get(dd.trophic) || 0) + 1);
      }
      s.biomes.set(o._biome ?? 0, (s.biomes.get(o._biome ?? 0) || 0) + 1);
    }

    const newlyExtinct = [];
    let alive = 0;
    for (const s of this.list.values()) {
      if (s.count > 0) {
        alive++;
        if (s.extinct !== null) { s.extinct = null; s.notes.push('Ponownie wprowadzony do świata'); }
        s.peak = Math.max(s.peak, s.count);
        const a = s._acc, n = s.count;
        s.avg = {
          cells: a.cells / n, mass: a.mass / n, energy: a.energy / n,
          neurons: a.neurons / n, muscles: a.muscles / n, speed: a.speed / n,
          generation: a.gen / n,
        };
        s.cx = a.cx / n; s.cy = a.cy / n;
        // Punkt odniesienia gatunku podąża za jego populacją. Powolna zmiana
        // całej linii to jeszcze nie nowy gatunek — nowy gatunek powstaje
        // dopiero wtedy, gdy jakaś jej część odejdzie od reszty.
        if (a.fpN > 0) {
          for (let k = 0; k < s.fingerprint.length; k++) {
            s.fingerprint[k] = s.fingerprint[k] * 0.88 + (a.fp[k] / a.fpN) * 0.12;
          }
        }
        if (a.dn > 0) {
          for (const k of Object.keys(s.dietFrac)) s.dietFrac[k] = a.d[k] / a.dn;
          let best = 0;
          for (const [label, cnt] of a.troph) if (cnt > best) { best = cnt; s.trophic = label; }
        }
      } else if (s.extinct === null && s.everBorn > 0) {
        s.extinct = tick;
        newlyExtinct.push(s);
      }
    }
    this.aliveCount = alive;
    return newlyExtinct;
  }

  /**
   * Historia świata nie może rosnąć w nieskończoność. Usuwamy wyłącznie
   * ślepe zaułki: wymarłe linie bez potomstwa, które nigdy nie zdobyły
   * liczącej się populacji. Wszystko, co coś po sobie zostawiło, zostaje.
   */
  prune(maxSpecies = 900) {
    if (this.list.size <= maxSpecies) return 0;
    const candidates = [];
    for (const s of this.list.values()) {
      if (s.count > 0 || s.children.length > 0) continue;
      if (s.peak >= 8) continue;
      candidates.push(s);
    }
    candidates.sort((a, b) => (a.peak - b.peak) || (a.born - b.born));
    let removed = 0;
    const target = this.list.size - maxSpecies;
    for (const s of candidates) {
      if (removed >= target) break;
      const parent = this.list.get(s.parent);
      if (parent) parent.children = parent.children.filter(id => id !== s.id);
      this.list.delete(s.id);
      removed++;
    }
    return removed;
  }

  aliveSpecies() {
    return Array.from(this.list.values()).filter(s => s.count > 0).sort((a, b) => b.count - a.count);
  }
}
