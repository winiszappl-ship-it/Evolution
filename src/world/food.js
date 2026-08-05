import { TILE } from './world.js';

/**
 * Pokarm stały: konkretne okruchy materii organicznej leżące w konkretnych
 * miejscach, a nie liczba rozmazana po całym kaflu.
 *
 * To zmienia sytuację organizmu w sposób, którego nie dawało pole kafla.
 * Wcześniej dwa receptory tego samego ciała mieściły się w jednym kaflu i
 * odczytywały identyczną wartość — gradientu nie było, więc ruch nie mógł się
 * do niczego przydać. Okruch ma położenie, więc stężenie zmienia się płynnie
 * z odległością i organizm może je porównać dwoma stronami ciała.
 *
 * Okruch jest jednego z dwóch rodzajów, ale nie dlatego, że świat zna rośliny
 * i zwierzęta. Rodzaj mówi tylko, skąd materia pochodzi: od kogoś, kto żył ze
 * światła, czy od kogoś, kto żył z cudzej pracy.
 *
 * Okruchy powstają wyłącznie z organizmów: z ich śmierci albo z nadwyżki,
 * której nie zmieściły w swoim zapasie. Świat nie produkuje ich z niczego —
 * jedynym wyjątkiem jest pierwotna materia organiczna obecna na planecie,
 * zanim cokolwiek zaczęło żyć.
 */

export const FOOD_PLANT = 0;     // materia wydalona przez organizm żyjący ze światła
export const FOOD_REMAINS = 1;   // to, co zostało po ciele

const MAX_FOOD = 5000;
const SENSE_RANGE = 20;        // zasięg, z jakiego czuć okruch
const DECAY_CHUNKS = 16;       // rozkład liczony partiami, nie cały naraz

export class FoodField {
  constructor(world) {
    this.world = world;
    this.px = new Float32Array(MAX_FOOD);
    this.py = new Float32Array(MAX_FOOD);
    this.e = new Float32Array(MAX_FOOD);
    this.kind = new Uint8Array(MAX_FOOD);
    this.used = new Uint8Array(MAX_FOOD);
    this.free = [];
    for (let i = MAX_FOOD - 1; i >= 0; i--) this.free.push(i);
    this.grid = new Map();
    this.cell = TILE;
    this.count = 0;
    this.total = 0;
    this.cursor = 0;
  }

  key(x, y) {
    return (Math.floor(x / this.cell) * 46349) + Math.floor(y / this.cell);
  }

  /** Dorzuca okruch. Gdy brakuje miejsca, najbiedniejszy w tym kaflu ustępuje. */
  add(x, y, energy, kind = FOOD_REMAINS) {
    if (energy <= 0.05) return -1;
    if (!this.free.length && !this.evict()) return -1;
    const i = this.free.pop();
    this.px[i] = x; this.py[i] = y; this.e[i] = energy;
    this.kind[i] = kind;
    this.used[i] = 1;
    const k = this.key(x, y);
    let arr = this.grid.get(k);
    if (!arr) { arr = []; this.grid.set(k, arr); }
    arr.push(i);
    this.count++;
    this.total += energy;
    return i;
  }

  /** Zwalnia miejsce, usuwając najmniejszy okruch spośród losowej próbki. */
  evict() {
    let worst = -1, worstE = Infinity;
    for (let t = 0; t < 24; t++) {
      const i = (Math.random() * MAX_FOOD) | 0;
      if (this.used[i] && this.e[i] < worstE) { worstE = this.e[i]; worst = i; }
    }
    if (worst < 0) return false;
    this.remove(worst);
    return true;
  }

  remove(i) {
    if (!this.used[i]) return;
    const k = this.key(this.px[i], this.py[i]);
    const arr = this.grid.get(k);
    if (arr) {
      const at = arr.indexOf(i);
      if (at >= 0) arr.splice(at, 1);
      if (!arr.length) this.grid.delete(k);
    }
    this.total -= this.e[i];
    this.used[i] = 0;
    this.e[i] = 0;
    this.count--;
    this.free.push(i);
  }

  /** Indeksy okruchów w promieniu r od punktu. */
  near(x, y, r, out = []) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    const r2 = r * r;
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const arr = this.grid.get(gx * 46349 + gy);
        if (!arr) continue;
        for (let n = 0; n < arr.length; n++) {
          const i = arr[n];
          const dx = this.px[i] - x, dy = this.py[i] - y;
          if (dx * dx + dy * dy <= r2) out.push(i);
        }
      }
    }
    return out;
  }

  /**
   * Stężenie pokarmu odczuwalne w danym punkcie. Maleje z odległością, więc
   * dwa receptory po dwóch stronach ciała dostają różne wartości — i dopiero
   * to daje organizmowi powód, żeby ruszyć się w którąś stronę.
   */
  concentrationAt(x, y) {
    const c = this.cell;
    const R = SENSE_RANGE;
    const x0 = Math.floor((x - R) / c), x1 = Math.floor((x + R) / c);
    const y0 = Math.floor((y - R) / c), y1 = Math.floor((y + R) / c);
    let sum = 0;
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const arr = this.grid.get(gx * 46349 + gy);
        if (!arr) continue;
        for (let n = 0; n < arr.length; n++) {
          const i = arr[n];
          const dx = this.px[i] - x, dy = this.py[i] - y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= R * R) continue;
          sum += this.e[i] / (1 + d2 * 0.05);
        }
      }
    }
    return sum;
  }

  /**
   * Zjadanie. Zwraca łączną pobraną energię, a w `out` rozbija ją na rodzaje —
   * bez tego nie dałoby się później powiedzieć, czym organizm się właściwie żywił.
   */
  consume(x, y, r, want, out = null) {
    if (want <= 0 || !this.count) return 0;
    if (!this._buf) this._buf = [];
    const list = this.near(x, y, r, this._buf);
    if (!list.length) return 0;
    let got = 0;
    for (let n = 0; n < list.length && got < want; n++) {
      const i = list[n];
      const take = Math.min(this.e[i], want - got);
      this.e[i] -= take;
      this.total -= take;
      got += take;
      if (out) {
        if (this.kind[i] === FOOD_PLANT) out.plant += take; else out.carrion += take;
      }
      if (this.e[i] <= 0.05) this.remove(i);
    }
    return got;
  }

  /**
   * Rozkład. Okruch, którego nikt nie zjadł, rozpada się na minerały w
   * podłożu — obieg materii się domyka, nawet gdy nikt nie sprząta.
   */
  step(dt) {
    if (!this.count) return;
    const world = this.world;
    const chunk = Math.ceil(MAX_FOOD / DECAY_CHUNKS);
    const scale = dt * DECAY_CHUNKS;
    const start = this.cursor;
    const end = Math.min(MAX_FOOD, start + chunk);
    for (let i = start; i < end; i++) {
      if (!this.used[i]) continue;
      const lost = this.e[i] * (1 - Math.exp(-0.003 * scale));
      this.e[i] -= lost;
      this.total -= lost;
      const ti = world.tileOf(this.px[i], this.py[i]);
      world.nutrient[ti] = Math.min(world.nutrientCap[ti] * 1.6, world.nutrient[ti] + lost * 0.85);
      if (this.e[i] <= 0.05) this.remove(i);
    }
    this.cursor = end >= MAX_FOOD ? 0 : end;
  }

  /** Okruchy widoczne w prostokącie — używane przy rysowaniu. */
  forEachInBounds(b, cb) {
    const c = this.cell;
    const x0 = Math.floor(b.x0 / c), x1 = Math.floor(b.x1 / c);
    const y0 = Math.floor(b.y0 / c), y1 = Math.floor(b.y1 / c);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const arr = this.grid.get(gx * 46349 + gy);
        if (!arr) continue;
        for (let n = 0; n < arr.length; n++) {
          const i = arr[n];
          cb(this.px[i], this.py[i], this.e[i], this.kind[i]);
        }
      }
    }
  }
}
