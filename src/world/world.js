import { generateTerrain } from './worldgen.js';
import { BIOME_DEF, BIOME, isWater } from './biomes.js';
import { clamp, lerp } from '../core/util.js';
import { RNG } from '../core/rng.js';

export const TILE = 12;            // jednostki świata na kafel
export const SECTOR_TILES = 16;    // kafle na krawędź sektora

/**
 * Świat: geologia (stała) + chemia i pogoda (zmienne).
 * Życia tu nie ma — świat nie wie, czym jest organizm. Udostępnia jedynie
 * światło, ciepło, tlen, wodę, minerały i martwą materię organiczną.
 */
export class World {
  constructor(params) {
    const t = generateTerrain(params);
    Object.assign(this, t);

    const n = this.W * this.H;
    this.nutrient = new Float32Array(n);   // minerały dostępne w podłożu
    this.detritus = new Float32Array(n);   // martwa materia organiczna
    this.oxygen = new Float32Array(n);
    this.nutrientCap = new Float32Array(n);
    this.burn = new Float32Array(n);       // aktywny pożar / lawa
    this.photoLoad = new Float32Array(n);    // ile powierzchni chwyta światło na kaflu
    this.mineralLoad = new Float32Array(n);  // łączne zapotrzebowanie na minerały
    this.detritusLoad = new Float32Array(n); // łączne zapotrzebowanie na materię organiczną

    for (let i = 0; i < n; i++) {
      const b = BIOME_DEF[this.biome[i]];
      const cap = b.nutrient * (0.5 + this.moisture[i] * 0.9) * 100;
      this.nutrientCap[i] = cap;
      this.nutrient[i] = cap * 0.6;
      this.oxygen[i] = this.params.oxygen * b.oxyMul;
      this.detritus[i] = b.nutrient * 6;
    }

    this.sw = Math.ceil(this.W / SECTOR_TILES);
    this.sh = Math.ceil(this.H / SECTOR_TILES);
    this.sectors = [];
    for (let sy = 0; sy < this.sh; sy++) {
      for (let sx = 0; sx < this.sw; sx++) {
        this.sectors.push({
          sx, sy, index: sy * this.sw + sx,
          x0: sx * SECTOR_TILES, y0: sy * SECTOR_TILES,
          x1: Math.min(this.W, (sx + 1) * SECTOR_TILES),
          y1: Math.min(this.H, (sy + 1) * SECTOR_TILES),
          lastTick: 0,
          detail: 0,          // 0 = populacyjny, 1 = organizmy, 2 = pełna fizyka
          organisms: [],
          activity: 0,
          waterFrac: 0,
        });
      }
    }
    for (const s of this.sectors) {
      let w = 0, c = 0;
      for (let y = s.y0; y < s.y1; y++) {
        for (let x = s.x0; x < s.x1; x++, c++) if (isWater(this.biome[y * this.W + x])) w++;
      }
      s.waterFrac = c ? w / c : 0;
    }

    this.widthUnits = this.W * TILE;
    this.heightUnits = this.H * TILE;
    this.rng = new RNG(this.seedNum ^ 0x7a1f);

    // globalne pule — świat jako całość
    this.globalOxygen = this.params.oxygen;
    this.globalCO2 = 0.04;
    this.globalTempOffset = 0;
  }

  idx(tx, ty) { return ty * this.W + tx; }
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.W && ty < this.H; }

  tileOf(x, y) {
    const tx = clamp(Math.floor(x / TILE), 0, this.W - 1);
    const ty = clamp(Math.floor(y / TILE), 0, this.H - 1);
    return ty * this.W + tx;
  }

  sectorOf(x, y) {
    const sx = clamp(Math.floor(x / TILE / SECTOR_TILES), 0, this.sw - 1);
    const sy = clamp(Math.floor(y / TILE / SECTOR_TILES), 0, this.sh - 1);
    return this.sectors[sy * this.sw + sx];
  }

  sectorAtTile(tx, ty) {
    const sx = clamp(Math.floor(tx / SECTOR_TILES), 0, this.sw - 1);
    const sy = clamp(Math.floor(ty / SECTOR_TILES), 0, this.sh - 1);
    return this.sectors[sy * this.sw + sx];
  }

  biomeDefAt(i) { return BIOME_DEF[this.biome[i]]; }
  isWaterAt(i) { return BIOME_DEF[this.biome[i]].water; }

  /** Światło docierające do kafla, z uwzględnieniem pory dnia, roku i pogody. */
  lightAt(i, climate) {
    const b = BIOME_DEF[this.biome[i]];
    const ty = (i / this.W) | 0;
    const lat = (ty / (this.H - 1)) * 2 - 1;
    const seasonal = 1 + climate.axialTilt * -lat * climate.seasonPhase;
    let l = this.params.light * climate.dayLight * clamp(seasonal, 0.15, 1.6) * b.lightMul;
    l *= (1 - climate.cloudiness * 0.55);
    if (b.water) l *= Math.exp(-this.depth[i] * 2.2);
    return Math.max(0, l);
  }

  /** Temperatura kafla w danej chwili. */
  tempAt(i, climate) {
    const b = BIOME_DEF[this.biome[i]];
    const ty = (i / this.W) | 0;
    const lat = (ty / (this.H - 1)) * 2 - 1;
    const seasonal = climate.axialTilt * -lat * climate.seasonPhase * 16;
    const diurnal = (climate.dayLight - 0.5) * (b.water ? 3 : 11);
    return this.baseTemp[i] + b.tempMod + seasonal + diurnal + this.globalTempOffset + this.burn[i] * 30;
  }

  oxygenAt(i) {
    return clamp(this.oxygen[i], 0, 1);
  }

  /** Pobranie minerałów z podłoża. Zwraca ile faktycznie udało się pobrać. */
  takeNutrient(i, amount) {
    const avail = this.nutrient[i];
    const got = Math.min(avail, amount);
    this.nutrient[i] = avail - got;
    return got;
  }

  takeDetritus(i, amount) {
    const avail = this.detritus[i];
    const got = Math.min(avail, amount);
    this.detritus[i] = avail - got;
    return got;
  }

  addDetritus(i, amount) {
    this.detritus[i] += amount;
  }

  addOxygen(i, amount) {
    this.oxygen[i] = clamp(this.oxygen[i] + amount, 0, 1);
    this.globalOxygen = clamp(this.globalOxygen + amount / (this.W * this.H) * 0.5, 0.001, 0.9);
  }

  useOxygen(i, amount) {
    const got = Math.min(this.oxygen[i], amount);
    this.oxygen[i] -= got;
    return got / Math.max(1e-6, amount);
  }

  /**
   * Nadganianie chemii sektora. Sektory poza zainteresowaniem kamery i życia
   * nie są liczone co takt — zamiast tego rozliczamy je analitycznie, kiedy
   * znów stają się istotne.
   */
  refreshSector(s, tick, climate) {
    const dt = tick - s.lastTick;
    if (dt <= 0) return;
    s.lastTick = tick;
    const steps = Math.min(dt, 4000);
    const W = this.W;

    for (let y = s.y0; y < s.y1; y++) {
      for (let x = s.x0; x < s.x1; x++) {
        const i = y * W + x;
        const b = BIOME_DEF[this.biome[i]];
        const temp = this.tempAt(i, climate);

        // rozkład martwej materii → minerały (szybszy w cieple i przy tlenie)
        const decayRate = clamp(0.0016 * Math.exp((temp - 12) * 0.055), 0, 0.05)
          * (0.35 + this.oxygen[i] * 2.2);
        const keep = Math.exp(-decayRate * steps);
        const decayed = this.detritus[i] * (1 - keep);
        this.detritus[i] *= keep;
        this.nutrient[i] = Math.min(this.nutrientCap[i] * 1.6, this.nutrient[i] + decayed * 0.85);

        // wietrzenie skał — powolne uzupełnianie minerałów do pojemności
        const cap = this.nutrientCap[i];
        const relax = 1 - Math.exp(-0.0008 * steps);
        this.nutrient[i] += (cap - this.nutrient[i]) * relax * (this.nutrient[i] < cap ? 1 : 0.25);

        // tlen relaksuje do wartości atmosferycznej biomu
        const oTarget = this.globalOxygen * b.oxyMul;
        this.oxygen[i] += (oTarget - this.oxygen[i]) * (1 - Math.exp(-0.002 * steps));

        // pożary i lawa wygasają
        if (this.burn[i] > 0) {
          this.burn[i] = Math.max(0, this.burn[i] - 0.004 * steps);
        }
      }
    }
  }

  /** Nadgania wszystkie sektory — wykorzystywane przy zapisie i statystykach. */
  refreshAll(tick, climate) {
    for (const s of this.sectors) this.refreshSector(s, tick, climate);
  }

  totals() {
    let nut = 0, det = 0, oxy = 0;
    for (let i = 0; i < this.nutrient.length; i++) {
      nut += this.nutrient[i]; det += this.detritus[i]; oxy += this.oxygen[i];
    }
    const n = this.nutrient.length;
    return { nutrient: nut, detritus: det, oxygen: oxy / n };
  }

  serialize() {
    return {
      params: this.params,
      nutrient: Array.from(this.nutrient, v => Math.round(v * 10) / 10),
      detritus: Array.from(this.detritus, v => Math.round(v * 10) / 10),
      oxygen: Array.from(this.oxygen, v => Math.round(v * 1000) / 1000),
      globalOxygen: this.globalOxygen,
      globalTempOffset: this.globalTempOffset,
      sectorTicks: this.sectors.map(s => s.lastTick),
    };
  }

  static deserialize(data) {
    const w = new World(data.params);
    if (data.nutrient) w.nutrient.set(data.nutrient);
    if (data.detritus) w.detritus.set(data.detritus);
    if (data.oxygen) w.oxygen.set(data.oxygen);
    w.globalOxygen = data.globalOxygen ?? w.params.oxygen;
    w.globalTempOffset = data.globalTempOffset ?? 0;
    if (data.sectorTicks) data.sectorTicks.forEach((t, i) => { if (w.sectors[i]) w.sectors[i].lastTick = t; });
    return w;
  }
}
