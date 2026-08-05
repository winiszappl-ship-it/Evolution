import { clamp, TAU } from '../core/util.js';
import { Noise2D } from '../core/noise.js';

export const TICKS_PER_DAY = 16;
export const DAYS_PER_YEAR = 96;
export const TICKS_PER_YEAR = TICKS_PER_DAY * DAYS_PER_YEAR;

export const SEASONS = ['Wiosna', 'Lato', 'Jesień', 'Zima'];

/**
 * Klimat: obrót planety, jej nachylenie osi i pogoda. Nic tu nie jest
 * skryptowane pod kątem rozgrywki — to tylko funkcje czasu i szumu.
 */
export class Climate {
  constructor(world) {
    this.world = world;
    this.tick = 0;
    this.axialTilt = 0.35 + world.rng.float(-0.12, 0.2);
    this.noise = new Noise2D(world.seedNum ^ 0xc11a);
    this.dayLight = 1;
    this.seasonPhase = 0;
    this.cloudiness = 0.3;
    this.rain = 0;
    this.windX = 0;
    this.windY = 0;
    this.windSpeed = 0;
    this.update(0);
  }

  get year() { return this.tick / TICKS_PER_YEAR; }
  get dayOfYear() { return Math.floor((this.tick % TICKS_PER_YEAR) / TICKS_PER_DAY); }
  get seasonIndex() { return Math.floor((this.dayOfYear / DAYS_PER_YEAR) * 4) % 4; }
  get seasonName() { return SEASONS[this.seasonIndex]; }
  get isNight() { return this.dayLight < 0.08; }

  update(dt = 1) {
    this.tick += dt;
    const t = this.tick;

    // dzień i noc — słońce nad horyzontem przez ~2/3 doby
    const dayPhase = (t % TICKS_PER_DAY) / TICKS_PER_DAY;
    const elev = Math.sin((dayPhase - 0.22) * TAU * 0.82);
    this.dayLight = clamp(elev * 1.25, 0, 1);

    // pory roku
    this.seasonPhase = Math.sin((t / TICKS_PER_YEAR) * TAU);

    // pogoda — powolny szum, niezależny od gracza
    const wt = t * 0.0012;
    this.cloudiness = clamp(this.noise.fbm(wt, 3.7, 3) * 0.55 + 0.42
      + this.world.params.humidity * 0.25, 0, 1);
    const rainDrive = this.noise.fbm(wt * 1.7 + 40, -12.1, 2);
    this.rain = clamp((rainDrive + this.cloudiness - 0.85) * 2.2, 0, 1);

    const wa = this.noise.at(wt * 0.6, 91.3) * Math.PI * 2;
    this.windSpeed = clamp(this.noise.fbm(wt * 1.3 - 5, 22.2, 3) * 0.6 + 0.45, 0, 1.4);
    this.windX = Math.cos(wa) * this.windSpeed;
    this.windY = Math.sin(wa) * this.windSpeed;
  }

  /** Prąd wodny w danym punkcie — mieszanka wiatru powierzchniowego i wiru stałego. */
  currentAt(x, y) {
    const s = 0.0025;
    const a = this.noise.at(x * s, y * s) * Math.PI * 2 + this.tick * 0.0004;
    const m = 0.35 + this.windSpeed * 0.4;
    return { x: Math.cos(a) * m + this.windX * 0.25, y: Math.sin(a) * m + this.windY * 0.25 };
  }
}
