import { TILE } from './world.js';
import { BIOME, BIOME_DEF } from './biomes.js';

/**
 * Źródła chemiczne: jedyne miejsce, w którym energia wchodzi do tego świata.
 *
 * Wcześniej rolę tę pełniło światło. Światło ma jednak tę własność, że pada
 * wszędzie — więc stanie w miejscu było opłacalne i nic nie zmuszało życia do
 * ruchu. Źródło chemiczne jest punktem. Kto chce z niego żyć, musi przy nim
 * być, a ponieważ jego wydajność jest skończona i dzielona po równo, przy
 * pełnym źródle opłaca się poszukać następnego.
 *
 * Źródła nie są zdarzeniem ani karą. To geologia: gorące kominy tam, gdzie
 * skorupa jest cienka, i wysięki mineralne w górach. Nie pojawiają się i nie
 * znikają w trakcie życia świata — są jego ukształtowaniem, tak samo jak rzeki.
 */

// Jak daleko sięga smuga i jak szybko słabnie.
//
// Pierwsza wersja miała zasięg 96 jednostek i połowiczne stężenie co 24 —
// czyli realnie użyteczne dwa kafle. Pomiar pokazał, na czym to padało: bez
// mięśni organizm dryfuje z prądem, więc kolonia zjeżdżała ze źródła (średnie
// stężenie spadało z 0,82 do 0,19) i wymierała po jakichś 80 urodzeniach.
// Mięsień powstaje raz na ~160 urodzeń, więc ewolucja nie miała rozbiegu:
// świat wymierał w 4 przypadkach na 6, zanim cokolwiek zdążyło się poruszyć.
//
// Smuga hydrotermalna w rzeczywistości rozchodzi się na kilometry, więc
// poszerzenie jej nie jest ustępstwem — jest poprawką modelu. Presja zostaje
// ta sama (kto odpłynie za daleko, ginie), ale ma się w czym rozegrać.
export const VENT_RANGE = 168;       // jednostki świata (14 kafli)
const HALF = 48;                     // na tej odległości stężenie spada o połowę

export class VentField {
  constructor(world, rng) {
    this.world = world;
    this.vents = [];
    this.place(rng);
    // siatka dla szybkiego wyszukiwania — źródeł jest mało, ale pytań o nie dużo
    this.grid = new Map();
    for (let i = 0; i < this.vents.length; i++) {
      const v = this.vents[i];
      const gx = Math.floor(v.x / VENT_RANGE), gy = Math.floor(v.y / VENT_RANGE);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = (gy + dy) * 100003 + (gx + dx);
          let a = this.grid.get(k);
          if (!a) { a = []; this.grid.set(k, a); }
          a.push(i);
        }
      }
    }
  }

  /**
   * Rozmieszczenie idzie za ukształtowaniem terenu, nie za wygodą życia.
   * Wulkany i góry to cienka skorupa; głęboki ocean to ryft. Jeśli świat nie
   * ma żadnego z tych miejsc, źródła i tak powstaną — planeta bez wnętrza
   * byłaby martwa z założenia, a o tym ma rozstrzygać ewolucja, nie generator.
   */
  place(rng) {
    const w = this.world;
    const target = Math.max(8, Math.round(w.W * w.H / 500));
    const cand = [];
    for (let i = 0; i < w.W * w.H; i++) {
      const b = w.biome[i];
      let weight = 0;
      if (b === BIOME.VOLCANO) weight = 40;
      else if (b === BIOME.MOUNTAIN) weight = 6;
      else if (b === BIOME.CAVE) weight = 5;
      else if (b === BIOME.OCEAN && w.depth[i] > 0.55) weight = 3;
      else if (b === BIOME.SWAMP) weight = 1;
      if (weight > 0) cand.push({ i, weight });
    }

    const chosen = new Set();
    const total = cand.reduce((a, c) => a + c.weight, 0);
    let guard = 0;
    while (this.vents.length < target && guard++ < target * 400) {
      let i;
      if (cand.length && total > 0) {
        let r = rng.float(0, total);
        let pick = cand[cand.length - 1];
        for (const c of cand) { r -= c.weight; if (r <= 0) { pick = c; break; } }
        i = pick.i;
      } else {
        i = rng.int(w.W * w.H);
      }
      if (chosen.has(i)) continue;
      const x = (i % w.W) * TILE + TILE / 2;
      const y = ((i / w.W) | 0) * TILE + TILE / 2;
      // dwa źródła w tym samym miejscu to jedno źródło o podwójnej mocy —
      // a chodzi o to, żeby były rozrzucone i żeby trzeba było między nimi iść
      let tooClose = false;
      for (const v of this.vents) {
        if ((v.x - x) ** 2 + (v.y - y) ** 2 < (VENT_RANGE * 1.1) ** 2) { tooClose = true; break; }
      }
      if (tooClose) continue;
      chosen.add(i);
      this.vents.push({ x, y, tile: i, rate: rng.float(0.75, 1.5) });
    }
  }

  /**
   * Stężenie związków chemicznych w danym punkcie. Maleje z odległością, więc
   * dwie strony ciała odczytują różne wartości — i to jest gradient, po którym
   * organizm może iść, jeśli kiedykolwiek wyewoluuje czym.
   */
  concentrationAt(x, y) {
    const gx = Math.floor(x / VENT_RANGE), gy = Math.floor(y / VENT_RANGE);
    const list = this.grid.get(gy * 100003 + gx);
    if (!list) return 0;
    let sum = 0;
    for (let k = 0; k < list.length; k++) {
      const v = this.vents[list[k]];
      const dx = v.x - x, dy = v.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > VENT_RANGE * VENT_RANGE) continue;
      sum += v.rate / (1 + d2 / (HALF * HALF));
    }
    return sum;
  }

  /** Najbliższe źródło i odległość do niego — na potrzeby interfejsu. */
  nearest(x, y) {
    let best = null, bestD = Infinity;
    for (const v of this.vents) {
      const d = Math.hypot(v.x - x, v.y - y);
      if (d < bestD) { bestD = d; best = v; }
    }
    return { vent: best, dist: bestD };
  }
}
