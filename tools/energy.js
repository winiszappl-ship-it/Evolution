// Diagnostyka bilansu energetycznego pojedynczej komórki.
import { Simulation } from '../src/sim/simulation.js';
import { defaultDesign } from '../src/bio/seed.js';
import { DEFAULT_PARAMS } from '../src/world/worldgen.js';

const sim = new Simulation({ ...DEFAULT_PARAMS, seed: process.argv[2] || 'test-alpha', size: 'small' });
const spot = { x: sim.world.widthUnits / 2, y: sim.world.heightUnits / 2 };
const o = sim.seed(defaultDesign(), spot.x, spot.y);
sim.setFocus(spot.x, spot.y, 900, 4);

const ti = sim.world.tileOf(o.x, o.y);
console.log('biom', sim.world.biomeDefAt(ti).name, 'woda', sim.world.isWaterAt(ti));
console.log('światło', sim.world.lightAt(ti, sim.climate).toFixed(3),
  'temp', sim.world.tempAt(ti, sim.climate).toFixed(1),
  'minerały', sim.world.nutrient[ti].toFixed(1),
  'detrytus', sim.world.detritus[ti].toFixed(1),
  'tlen', sim.world.oxygen[ti].toFixed(3));
console.log('ciało: komórek', o.body.cellCount, 'masa', o.body.mass.toFixed(3),
  'utrzymanie', o.body.upkeep.toFixed(4), 'kosztBudowy', o.body.buildCost.toFixed(2),
  'magazyn', o.body.storage.toFixed(1));
console.log('cap', Object.entries(o.body.cap).filter(([, v]) => v > 0.001).map(([k, v]) => `${k}=${v.toFixed(3)}`).join(' '));
console.log('energia start', o.energy.toFixed(2), 'max', o.maxEnergy.toFixed(2),
  'próg podziału', (o.body.buildCost * o.genome.params.reproThr).toFixed(2));

for (let t = 1; t <= 200; t++) {
  const before = o.energy;
  sim.step(1);
  if (t % 10 === 0 || !o.alive) {
    console.log(`t=${String(t).padStart(3)} e=${o.energy.toFixed(2)} `
      + `Δ=${(o.energy - before).toFixed(4)} zysk=${o.lastGainTotal.toFixed(4)} `
      + `foto=${o.gain.photo.toFixed(2)} abs=${o.gain.absorb.toFixed(2)} det=${o.gain.detritus.toFixed(2)} `
      + `int=${o.integrity.toFixed(2)} żywy=${o.alive} org=${sim.organisms.length}`);
  }
  if (!o.alive) { console.log('przyczyna:', o.deathCause); break; }
}
