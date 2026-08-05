import { clamp } from '../core/util.js';

/**
 * DNA nie opisuje organizmu. Opisuje *proces* jego budowy.
 *
 * Genom składa się z:
 *  - genów regulacyjnych: reguły "jeśli sygnał spełnia warunek → wykonaj akcję",
 *    stosowane do pojedynczej komórki w czasie rozwoju zarodkowego,
 *  - parametrów globalnych: skalarów modulujących całą linię komórkową.
 *
 * Nigdzie nie ma pojęcia nogi, oka, liścia, drapieżnika ani rośliny.
 * Są tylko zdolności fizyczne komórek i koszty, które za sobą pociągają.
 */

export const MORPHOGENS = 5;

// Zdolności komórki. To są własności fizyczne, nie role ekologiczne.
export const TRAITS = ['photo', 'digest', 'absorb', 'contract', 'rigid', 'sense', 'neuro', 'store', 'armor', 'repro'];
export const TRAIT_LABEL = {
  photo: 'fotosynteza', digest: 'trawienie', absorb: 'wchłanianie', contract: 'kurczliwość',
  rigid: 'sztywność', sense: 'receptory', neuro: 'neurony', store: 'magazyn',
  armor: 'pancerz', repro: 'rozrodczość',
};
export const TRAIT_COUNT = TRAITS.length;

// Koszt utrzymania jednostki danej zdolności (energia / takt / komórkę)
export const TRAIT_UPKEEP = [0.010, 0.020, 0.008, 0.022, 0.006, 0.014, 0.030, 0.005, 0.012, 0.016];

export const ACT = {
  DIVIDE: 0,      // podział komórki pod zadanym kątem
  EMIT: 1,        // wydzielenie morfogenu
  SPECIALIZE: 2,  // zmiana zdolności komórki
  GROW: 3,        // zmiana rozmiaru i sztywności wiązań
  LINK: 4,        // dodatkowe wiązanie z pobliską komórką (stawy, pętle)
  APOPTOSE: 5,    // śmierć komórki — rzeźbienie kształtu
  TERMINATE: 6,   // koniec podziałów dla tej linii
  NEURITE: 7,     // wypustka nerwowa do pobliskich komórek
};
export const ACT_COUNT = 8;
export const ACT_NAME = ['podział', 'morfogen', 'specjalizacja', 'wzrost', 'wiązanie', 'apoptoza', 'zakończenie', 'neuryt'];

// Źródła sygnału dla warunków genu
export const SIG_COUNT = MORPHOGENS + 6;
export const SIG_NAME = [
  'morfogen A', 'morfogen B', 'morfogen C', 'morfogen D', 'morfogen E',
  'wiek zarodkowy', 'pokolenie komórki', 'odległość od środka',
  'liczba sąsiadów', 'stała', 'rozmiar komórki',
];

// Parametry globalne genomu: [wartość domyślna, min, max, siła mutacji]
export const PARAM_DEF = {
  mutRate:    [0.06, 0.001, 0.9, 0.02],   // podatność na mutacje (sama podlega ewolucji)
  devSteps:   [6, 1, 40, 1.2],            // liczba kroków rozwoju zarodkowego
  reproThr:   [1.8, 0.6, 12, 0.35],       // krotność kosztu ciała potrzebna do rozmnożenia
  invest:     [0.42, 0.08, 0.85, 0.06],   // udział energii przekazany potomstwu
  lifespan:   [2200, 150, 200000, 260],   // maksymalny wiek w taktach
  metabolism: [1.0, 0.25, 3.2, 0.12],     // tempo przemiany materii
  oscFreq:    [0.16, 0.0, 1.4, 0.05],     // częstotliwość neuronów rozrusznikowych
  membrane:   [0.35, 0.02, 2.5, 0.09],    // grubość błony — ochrona kosztem wymiany
  senseGain:  [1.0, 0.05, 6.0, 0.22],     // czułość receptorów
  learnRate:  [0.0, 0.0, 0.6, 0.03],      // plastyczność synaps
  memory:     [0.3, 0.0, 0.98, 0.06],     // stała czasowa neuronów
  hue:        [120, 0, 360, 14],          // cecha neutralna — dryf, znacznik linii
  cellCost:   [1.0, 0.4, 2.4, 0.08],      // koszt materiałowy komórki
  disperse:   [1.0, 0.0, 14.0, 0.5],      // zasięg rozsiewania potomstwa
  sexual:     [0.0, 0.0, 1.0, 0.08],      // skłonność do wymiany materiału genetycznego
};
export const PARAM_KEYS = Object.keys(PARAM_DEF);

let GENOME_SEQ = 1;

export function makeGene(rng) {
  return {
    s1: rng.int(SIG_COUNT),
    c1: rng.int(2),
    t1: rng.float(-0.2, 1.2),
    use2: rng.chance(0.3) ? 1 : 0,
    s2: rng.int(SIG_COUNT),
    c2: rng.int(2),
    t2: rng.float(-0.2, 1.2),
    act: rng.int(ACT_COUNT),
    p0: rng.float(0, 1),
    p1: rng.float(-1, 1),
    p2: rng.float(-1, 1),
    w: rng.float(0.1, 1),
  };
}

export class Genome {
  constructor() {
    this.id = GENOME_SEQ++;
    this.parentId = 0;
    this.genes = [];
    this.params = {};
    for (const k of PARAM_KEYS) this.params[k] = PARAM_DEF[k][0];
    this.generation = 0;
    this.lastMutations = [];
  }

  static random(rng, geneCount = 8) {
    const g = new Genome();
    for (let i = 0; i < geneCount; i++) g.genes.push(makeGene(rng));
    for (const k of PARAM_KEYS) {
      const [d, lo, hi] = PARAM_DEF[k];
      g.params[k] = clamp(d * rng.float(0.5, 1.8), lo, hi);
    }
    g.params.hue = rng.float(0, 360);
    return g;
  }

  clone() {
    const g = new Genome();
    g.parentId = this.id;
    g.genes = this.genes.map(x => ({ ...x }));
    g.params = { ...this.params };
    g.generation = this.generation;
    return g;
  }

  get complexity() {
    return this.genes.length + Object.values(this.params).length * 0.1;
  }

  /**
   * Mutacja. Promieniowanie środowiska i własny gen mutRate wspólnie
   * wyznaczają intensywność. Silnik nie decyduje, co jest ulepszeniem.
   */
  mutate(rng, radiation = 0.35) {
    const child = this.clone();
    child.generation = this.generation + 1;
    const log = [];
    const rate = clamp(this.params.mutRate * (0.4 + radiation * 1.8), 0.001, 1.2);

    // 1. Zmiana wartości parametrów globalnych
    for (const k of PARAM_KEYS) {
      if (rng.chance(rate)) {
        const [, lo, hi, step] = PARAM_DEF[k];
        const before = child.params[k];
        child.params[k] = clamp(before + rng.gauss(0, step * (0.5 + radiation)), lo, hi);
        if (k === 'devSteps') child.params[k] = Math.round(child.params[k]);
        if (Math.abs(child.params[k] - before) > 1e-6) log.push({ kind: 'param', key: k, from: before, to: child.params[k] });
      }
    }

    // 2. Zmiana wartości w istniejących genach
    for (const g of child.genes) {
      if (!rng.chance(rate * 1.4)) continue;
      const which = rng.int(8);
      switch (which) {
        case 0: g.s1 = rng.int(SIG_COUNT); break;
        case 1: g.c1 = 1 - g.c1; break;
        case 2: g.t1 = clamp(g.t1 + rng.gauss(0, 0.18), -0.4, 1.4); break;
        case 3: g.act = rng.int(ACT_COUNT); break;
        case 4: g.p0 = clamp(g.p0 + rng.gauss(0, 0.16), 0, 1); break;
        case 5: g.p1 = clamp(g.p1 + rng.gauss(0, 0.18), -1.5, 1.5); break;
        case 6: g.p2 = clamp(g.p2 + rng.gauss(0, 0.18), -1.5, 1.5); break;
        case 7:
          if (rng.chance(0.5)) { g.use2 = 1 - g.use2; }
          else { g.t2 = clamp(g.t2 + rng.gauss(0, 0.18), -0.4, 1.4); g.s2 = rng.int(SIG_COUNT); }
          break;
      }
      g.w = clamp(g.w + rng.gauss(0, 0.08), 0.02, 3);
      log.push({ kind: 'gene', op: 'zmiana' });
    }

    // 3. Nowy gen
    if (rng.chance(rate * 0.9) && child.genes.length < 220) {
      child.genes.splice(rng.int(child.genes.length + 1), 0, makeGene(rng));
      log.push({ kind: 'gene', op: 'dodanie' });
    }

    // 4. Utrata genu
    if (rng.chance(rate * 0.7) && child.genes.length > 1) {
      child.genes.splice(rng.int(child.genes.length), 1);
      log.push({ kind: 'gene', op: 'delecja' });
    }

    // 5. Duplikacja fragmentu — główne źródło nowej złożoności
    if (rng.chance(rate * 0.4) && child.genes.length > 1 && child.genes.length < 180) {
      const a = rng.int(child.genes.length);
      const len = Math.min(child.genes.length - a, 1 + rng.int(4));
      const frag = child.genes.slice(a, a + len).map(x => ({ ...x }));
      const at = rng.int(child.genes.length + 1);
      child.genes.splice(at, 0, ...frag);
      log.push({ kind: 'gene', op: 'duplikacja', len });
    }

    // 6. Przestawienie kolejności — zmienia priorytet reguł
    if (rng.chance(rate * 0.5) && child.genes.length > 2) {
      const a = rng.int(child.genes.length);
      const b = rng.int(child.genes.length);
      const tmp = child.genes[a]; child.genes[a] = child.genes[b]; child.genes[b] = tmp;
      log.push({ kind: 'gene', op: 'inwersja' });
    }

    // 7. Rzadka duplikacja całego genomu — skok złożoności
    if (rng.chance(rate * 0.012) && child.genes.length <= 60) {
      child.genes = child.genes.concat(child.genes.map(x => ({ ...x })));
      log.push({ kind: 'gene', op: 'poliploidia' });
    }

    child.lastMutations = log;
    return child;
  }

  /** Rekombinacja — jeśli linia wyewoluowała skłonność do wymiany genów. */
  static recombine(a, b, rng) {
    const child = a.clone();
    child.parentId = a.id;
    const cut = rng.int(Math.min(a.genes.length, b.genes.length) + 1);
    child.genes = a.genes.slice(0, cut).map(x => ({ ...x }))
      .concat(b.genes.slice(cut).map(x => ({ ...x })));
    for (const k of PARAM_KEYS) {
      child.params[k] = rng.chance(0.5) ? a.params[k] : b.params[k];
    }
    child.generation = Math.max(a.generation, b.generation) + 1;
    return child;
  }

  /** Odcisk genomu — wektor liczbowy używany do wyznaczania dystansu genetycznego. */
  fingerprint() {
    const fp = new Float32Array(ACT_COUNT + PARAM_KEYS.length + SIG_COUNT + 1);
    for (const g of this.genes) {
      fp[g.act] += 1;
      fp[ACT_COUNT + PARAM_KEYS.length + g.s1] += 0.5;
    }
    const inv = 1 / Math.max(1, this.genes.length);
    for (let i = 0; i < ACT_COUNT; i++) fp[i] *= inv;
    for (let i = ACT_COUNT + PARAM_KEYS.length; i < fp.length - 1; i++) fp[i] *= inv;
    PARAM_KEYS.forEach((k, i) => {
      const [, lo, hi] = PARAM_DEF[k];
      fp[ACT_COUNT + i] = (this.params[k] - lo) / (hi - lo);
    });
    fp[fp.length - 1] = Math.log2(1 + this.genes.length) / 8;
    return fp;
  }

  static distance(fpA, fpB) {
    let s = 0;
    for (let i = 0; i < fpA.length; i++) {
      const d = fpA[i] - fpB[i];
      s += d * d;
    }
    return Math.sqrt(s);
  }

  serialize() {
    return {
      id: this.id, parentId: this.parentId, generation: this.generation,
      params: this.params,
      genes: this.genes.map(g => [g.s1, g.c1, +g.t1.toFixed(3), g.use2, g.s2, g.c2, +g.t2.toFixed(3),
        g.act, +g.p0.toFixed(3), +g.p1.toFixed(3), +g.p2.toFixed(3), +g.w.toFixed(3)]),
    };
  }

  static deserialize(d) {
    const g = new Genome();
    g.id = d.id ?? g.id;
    g.parentId = d.parentId ?? 0;
    g.generation = d.generation ?? 0;
    g.params = { ...g.params, ...d.params };
    g.genes = (d.genes || []).map(a => ({
      s1: a[0], c1: a[1], t1: a[2], use2: a[3], s2: a[4], c2: a[5], t2: a[6],
      act: a[7], p0: a[8], p1: a[9], p2: a[10], w: a[11],
    }));
    if (g.id >= GENOME_SEQ) GENOME_SEQ = g.id + 1;
    return g;
  }
}
