import { BIOME } from '../world/biomes.js';
import { clamp } from '../core/util.js';
import { TILE } from '../world/world.js';

/**
 * Katastrofy nie są scenariuszem. Każda z nich to warunek sprawdzany na stanie
 * świata: sucha i gorąca roślinność się zapala, wulkan pod ciśnieniem wybucha,
 * gęsta populacja sprzyja epidemii. Gra nie planuje, kiedy nastąpią.
 */
export class Disasters {
  constructor(world, climate, chronicle) {
    this.world = world;
    this.climate = climate;
    this.chronicle = chronicle;
    this.active = [];
    this.fireTiles = new Set();
    this.cooldown = 0;
    this.impactWinter = 0;
    this.lastEpidemic = -1e9;
  }

  step(sim, dt) {
    const { world, climate } = this;
    const rng = world.rng;

    // --- pożary: sucho, ciepło, jest co palić ---
    if (rng.chance(0.02 * dt)) {
      const i = rng.int(world.W * world.H);
      const b = world.biome[i];
      if (!world.isWaterAt(i) && b !== BIOME.CAVE) {
        const temp = world.tempAt(i, climate);
        const fuel = world.detritus[i];
        const dry = (1 - climate.rain) * (1 - world.moisture[i]);
        const p = clamp((temp - 22) * 0.02, 0, 1) * clamp(fuel / 40, 0, 1) * dry;
        if (rng.chance(p)) this.ignite(i);
      }
    }
    this.spreadFire(dt);

    // --- erupcje wulkaniczne ---
    if (world.volcanoes.length && rng.chance(0.0016 * dt)) {
      const v = rng.pick(world.volcanoes);
      this.erupt(v);
    }

    // --- uderzenie ciała niebieskiego ---
    if (rng.chance(0.000035 * dt)) this.impact(sim);

    // --- susza i powódź: wolne wahania dostępności wody ---
    if (rng.chance(0.0009 * dt)) {
      const drought = climate.rain < 0.15 && climate.cloudiness < 0.4;
      if (drought) {
        for (let i = 0; i < world.nutrientCap.length; i++) {
          world.nutrientCap[i] = Math.max(world.nutrientCapBase[i] * 0.3, world.nutrientCap[i] * 0.82);
        }
        this.chronicle.record('disaster', 'Susza wyjałowiła glebę na znacznym obszarze.');
      } else if (climate.rain > 0.7) {
        for (let i = 0; i < world.nutrient.length; i++) {
          if (world.biome[i] === BIOME.RIVER || world.biome[i] === BIOME.SWAMP) {
            world.nutrient[i] = Math.min(world.nutrientCap[i] * 1.5, world.nutrient[i] + 12);
          }
        }
        this.chronicle.record('disaster', 'Powódź naniosła żyzny muł w dolinach rzecznych.');
      }
    }

    // --- epidemia: potrzebuje gęstej i genetycznie jednolitej populacji ---
    if (rng.chance(0.0012 * dt)) this.maybeEpidemic(sim);

    // --- powrót klimatu do równowagi po katastrofie ---
    if (this.impactWinter > 0) {
      this.impactWinter -= dt;
      world.globalTempOffset += (0 - world.globalTempOffset) * 0.0004 * dt;
      if (this.impactWinter <= 0) {
        world.globalTempOffset = 0;
        this.chronicle.record('world', 'Pył opadł. Klimat wrócił do dawnego stanu.');
      }
    } else if (Math.abs(world.globalTempOffset) > 0.01) {
      world.globalTempOffset *= Math.pow(0.9995, dt);
    }
  }

  ignite(i) {
    if (this.world.burn[i] > 0) return;
    this.world.burn[i] = 1;
    this.fireTiles.add(i);
    if (this.fireTiles.size === 1) this.chronicle.record('disaster', 'Wybuchł pożar.');
  }

  spreadFire(dt) {
    if (!this.fireTiles.size) return;
    const { world } = this;
    const rng = world.rng;
    const next = [];
    for (const i of this.fireTiles) {
      if (world.burn[i] <= 0) { next.push(i); continue; }
      // pożar zjada materię organiczną i zwraca minerały jako popiół
      const burned = Math.min(world.detritus[i], 3 * dt);
      world.detritus[i] -= burned;
      world.nutrient[i] = Math.min(world.nutrientCap[i] * 1.8, world.nutrient[i] + burned * 1.5);
      world.oxygen[i] = Math.max(0, world.oxygen[i] - 0.004 * dt);
      if (world.detritus[i] < 0.5) world.burn[i] = Math.max(0, world.burn[i] - 0.05 * dt);

      const x = i % world.W, y = (i / world.W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!world.inBounds(nx, ny)) continue;
        const j = ny * world.W + nx;
        if (world.burn[j] > 0 || world.isWaterAt(j)) continue;
        const p = clamp(world.detritus[j] / 30, 0, 1) * (1 - world.moisture[j]) * (1 - this.climate.rain) * 0.22 * dt;
        if (rng.chance(p)) { world.burn[j] = 1; next.push(j); }
      }
    }
    const still = new Set();
    for (const i of this.fireTiles) if (world.burn[i] > 0) still.add(i);
    for (const i of next) if (world.burn[i] > 0) still.add(i);
    this.fireTiles = still;
  }

  erupt(v) {
    const { world } = this;
    const i = world.idx(v.x, v.y);
    const r = 3 + world.rng.int(6);
    let count = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = v.x + dx, ny = v.y + dy;
        if (!world.inBounds(nx, ny)) continue;
        if (dx * dx + dy * dy > r * r) continue;
        const j = ny * world.W + nx;
        world.burn[j] = Math.max(world.burn[j], 1.4);
        world.detritus[j] *= 0.2;
        world.nutrient[j] = Math.min(world.nutrientCap[j] * 2.4, world.nutrient[j] + 40);
        world.nutrientCap[j] *= 1.05;
        count++;
      }
    }
    world.globalTempOffset -= world.rng.float(0.2, 1.6);
    this.impactWinter = Math.max(this.impactWinter, 1500);
    this.chronicle.record('disaster', `Erupcja wulkanu. Popiół pokrył ${count} kafli i przyciemnił niebo.`);
  }

  impact(sim) {
    const { world } = this;
    const rng = world.rng;
    const x = rng.range(4, world.W - 5), y = rng.range(4, world.H - 5);
    const r = 5 + rng.int(18);
    let killed = 0;
    for (const o of sim.organisms) {
      const d = Math.hypot(o.x / TILE - x, o.y / TILE - y);
      if (d < r * 1.6) {
        o.integrity -= (1 - d / (r * 1.6)) * 2.2;
        if (o.integrity <= 0) { o.alive = false; o.deathCause = 'uderzenie'; killed++; }
      }
    }
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx, ny = y + dy;
        if (!world.inBounds(nx, ny)) continue;
        if (dx * dx + dy * dy > r * r) continue;
        const j = ny * world.W + nx;
        world.detritus[j] *= 0.05;
        world.nutrient[j] = Math.min(world.nutrientCap[j] * 2, world.nutrient[j] + 25);
        world.burn[j] = 2;
      }
    }
    world.globalTempOffset -= rng.float(3, 12);
    this.impactWinter = 9000 + rng.int(20000);
    this.chronicle.record('disaster',
      `Uderzenie ciała niebieskiego. Promień zniszczeń ${r} kafli, ${killed} organizmów zginęło natychmiast.`, true);
  }

  maybeEpidemic(sim) {
    // Patogen potrzebuje gęstej populacji blisko spokrewnionych żywicieli,
    // a po przejściu fali musi się odbudować — tak jak odporność populacji.
    if (sim.tick - this.lastEpidemic < 2500) return;
    const species = sim.species.aliveSpecies();
    if (!species.length) return;
    const target = species[0];
    if (target.count < 40) return;
    this.lastEpidemic = sim.tick;
    const virulence = clamp(target.count / 400, 0.05, 0.7);
    let hit = 0;
    for (const o of sim.organisms) {
      if (o.speciesId !== target.id || !o.alive) continue;
      const resist = 0.2 + o.genome.params.membrane * 0.5 + o.body.cap.armor * 0.01;
      if (sim.rng.chance(virulence * clamp(1 - resist, 0.05, 1))) {
        o.integrity -= sim.rng.float(0.3, 1.2);
        o.energy *= 0.6;
        if (o.integrity <= 0) { o.alive = false; o.deathCause = 'choroba'; }
        hit++;
      }
    }
    if (hit > 20) {
      this.chronicle.record('disaster',
        `Epidemia w populacji gatunku ${target.name}. Dotknęła ${hit} osobników.`,
        hit > target.count * 0.5);
    }
  }
}
