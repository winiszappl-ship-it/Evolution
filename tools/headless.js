// Test silnika bez przeglądarki: node tools/headless.js [lata] [ziarno]
// Sprawdza, czy świat działa, czy życie się utrzymuje i czy DNA rzeczywiście
// się zmienia. Nie sprawdza żadnego z góry założonego wyniku ewolucji —
// bo takiego wyniku nie ma.

import { Simulation } from '../src/sim/simulation.js';
import { defaultDesign } from '../src/bio/seed.js';
import { TICKS_PER_YEAR } from '../src/world/climate.js';
import { DEFAULT_PARAMS } from '../src/world/worldgen.js';

const years = parseFloat(process.argv[2] || '8');
const seed = process.argv[3] || 'test-alpha';
const ticks = Math.round(years * TICKS_PER_YEAR);

console.log(`Świat "${seed}", ${years} lat = ${ticks} taktów\n`);

const t0 = Date.now();
const sim = new Simulation({ ...DEFAULT_PARAMS, seed, size: 'small' });
console.log(`Generacja świata: ${Date.now() - t0} ms, ${sim.world.W}x${sim.world.H} kafli, ${sim.world.sectors.length} sektorów`);

const counts = {};
for (let i = 0; i < sim.world.biome.length; i++) counts[sim.world.biome[i]] = (counts[sim.world.biome[i]] || 0) + 1;
console.log('Biomy:', Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' '));

const spot = { x: sim.world.widthUnits / 2, y: sim.world.heightUnits / 2 };
sim.seed(defaultDesign(), spot.x, spot.y, 10);
sim.setFocus(spot.x, spot.y, 600, 4);
console.log(`\nZasiano ${sim.organisms.length} komórek.\n`);

const t1 = Date.now();
let report = 0;
for (let t = 0; t < ticks; t++) {
  sim.step(1);
  if (t - report >= TICKS_PER_YEAR) {
    report = t;
    const genes = sim.organisms.reduce((s, o) => s + o.genome.genes.length, 0) / Math.max(1, sim.organisms.length);
    const cells = sim.organisms.reduce((s, o) => s + o.body.cellCount, 0) / Math.max(1, sim.organisms.length);
    const neur = sim.organisms.reduce((s, o) => s + o.brain.neurons.length, 0) / Math.max(1, sim.organisms.length);
    console.log(`rok ${(t / TICKS_PER_YEAR).toFixed(1)}  org=${String(sim.organisms.length).padStart(4)}  `
      + `gat=${String(sim.species.aliveCount).padStart(3)}  geny=${genes.toFixed(1)}  `
      + `kom=${cells.toFixed(2)}  neur=${neur.toFixed(2)}  pokol=${sim.stats.maxGeneration}`);
  }
}
const elapsed = Date.now() - t1;
console.log(`\nCzas symulacji: ${elapsed} ms  (${(ticks / (elapsed / 1000)).toFixed(0)} taktów/s)`);

console.log('\n--- Gatunki ---');
for (const s of sim.species.aliveSpecies().slice(0, 12)) {
  console.log(`${s.name.padEnd(12)} n=${String(s.count).padStart(4)} szczyt=${String(s.peak).padStart(4)} `
    + `kom=${s.avg.cells.toFixed(1)} neur=${s.avg.neurons.toFixed(1)} `
    + `dieta=${s.dominantDiet().label} biom=${s.mainBiome()} pokol=${s.avg.generation.toFixed(0)}`);
}

console.log('\n--- Kronika (ostatnie 15) ---');
for (const e of sim.chronicle.entries.slice(-15)) {
  console.log(`rok ${e.year.toFixed(1).padStart(6)}  [${e.kind}] ${e.text}`);
}

console.log('\n--- Osiągnięcia ---');
for (const a of sim.chronicle.achievements.values()) console.log(`  ${a.title}: ${a.desc}`);

// test zapisu i odczytu
const snap = JSON.parse(JSON.stringify(sim.serialize()));
const size = JSON.stringify(snap).length;
const restored = Simulation.deserialize(snap);
console.log(`\nZapis: ${(size / 1024).toFixed(0)} kB, po odczycie ${restored.organisms.length} organizmów, `
  + `${restored.species.list.size} gatunków, rok ${restored.year.toFixed(2)}`);
restored.step(50);
console.log(`Po wznowieniu: ${restored.organisms.length} organizmów — odczyt działa.`);
