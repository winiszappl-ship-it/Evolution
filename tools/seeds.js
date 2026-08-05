// Czy życie w ogóle się utrzymuje? Sprawdzenie wielu ziaren świata naraz.
// node tools/seeds.js [lata] [ile ziaren]
import { Simulation } from '../src/sim/simulation.js';
import { defaultDesign } from '../src/bio/seed.js';
import { DEFAULT_PARAMS } from '../src/world/worldgen.js';
import { TICKS_PER_YEAR } from '../src/world/climate.js';
import { TILE } from '../src/world/world.js';

const years = parseFloat(process.argv[2] || '10');
const count = parseInt(process.argv[3] || '8', 10);
const ticks = Math.round(years * TICKS_PER_YEAR);

// Ten sam wybór miejsca, którego używa gracz w grze.
function findSeedSpot(sim, source) {
  const w = sim.world;
  let best = 0, bestScore = -1;
  for (let a = 0; a < 400; a++) {
    const i = sim.rng.int(w.W * w.H);
    const b = w.biomeDefAt(i);
    let score = source === 'photo' ? b.lightMul * (b.water ? 1.1 : 1) * (1 - w.depth[i])
      : source === 'absorb' ? (b.water ? 1.6 : 0.3) * b.nutrient
        : b.nutrient * (w.detritus[i] / 12 + 0.4);
    const t = w.tempAt(i, sim.climate);
    score *= Math.exp(-((t - 20) ** 2) / 1400) * sim.rng.float(0.6, 1.4);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return { x: (best % w.W) * TILE + TILE / 2, y: ((best / w.W) | 0) * TILE + TILE / 2 };
}

console.log(`${count} światów × ${years} lat\n`);
console.log('ziarno        organizmy  gatunki  geny  komórki  neurony  mięśnie  pokolenie  diety');
let survived = 0;

for (let s = 0; s < count; s++) {
  const seed = 'proba-' + s;
  const sim = new Simulation({ ...DEFAULT_PARAMS, seed, size: 'small' });
  const spot = findSeedSpot(sim, 'photo');
  sim.seed(defaultDesign(), spot.x, spot.y);
  sim.setFocus(spot.x, spot.y, 700, 3);
  for (let t = 0; t < ticks; t++) sim.step(1);

  const n = Math.max(1, sim.organisms.length);
  const genes = sim.organisms.reduce((a, o) => a + o.genome.genes.length, 0) / n;
  const cells = sim.organisms.reduce((a, o) => a + o.body.cellCount, 0) / n;
  const neur = sim.organisms.reduce((a, o) => a + o.brain.neurons.length, 0) / n;
  const musc = sim.organisms.reduce((a, o) => a + o.brain.effectors.length, 0) / n;
  const gen = sim.stats.maxGeneration;
  const diets = {};
  for (const o of sim.organisms) { const d = o.diet().key; diets[d] = (diets[d] || 0) + 1; }
  const dietStr = Object.entries(diets).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`).join(' ') || '—';
  if (sim.organisms.length > 0) survived++;

  console.log(`${seed.padEnd(12)} ${String(sim.organisms.length).padStart(9)} `
    + `${String(sim.species.aliveCount).padStart(8)} ${genes.toFixed(1).padStart(5)} `
    + `${cells.toFixed(2).padStart(8)} ${neur.toFixed(2).padStart(8)} ${musc.toFixed(2).padStart(8)} `
    + `${String(gen).padStart(10)}  ${dietStr}`);
}
console.log(`\nżycie przetrwało w ${survived}/${count} światach`);
