// Profil czasu w fazach jednego taktu.
import { Simulation } from '../src/sim/simulation.js';
import { defaultDesign } from '../src/bio/seed.js';
import { DEFAULT_PARAMS } from '../src/world/worldgen.js';
import { TICKS_PER_YEAR } from '../src/world/climate.js';

const sim = new Simulation({ ...DEFAULT_PARAMS, seed: 'test-alpha', size: 'small' });
sim.seed(defaultDesign(), sim.world.widthUnits / 2, sim.world.heightUnits / 2);
sim.setFocus(sim.world.widthUnits / 2, sim.world.heightUnits / 2, 600, 4);

const times = {};
const wrap = (obj, name) => {
  const orig = obj[name].bind(obj);
  times[name] = 0;
  obj[name] = (...a) => {
    const t = process.hrtime.bigint();
    const r = orig(...a);
    times[name] += Number(process.hrtime.bigint() - t) / 1e6;
    return r;
  };
};
for (const m of ['assignSectors', 'assignDetail', 'buildHash', 'interactions', 'updateStats',
  'stepReduced', 'stepDrift', 'feed']) wrap(sim, m);
const { Organism } = await import('../src/bio/organism.js');
for (const m of ['metabolize', 'stepPhysics', 'stepBrainOnce', 'promote', 'reproduce']) {
  const orig = Organism.prototype[m];
  times['O.' + m] = 0;
  Organism.prototype[m] = function (...a) {
    const t = process.hrtime.bigint();
    const r = orig.apply(this, a);
    times['O.' + m] += Number(process.hrtime.bigint() - t) / 1e6;
    return r;
  };
}
wrap(sim.species, 'recount');
wrap(sim.watcher, 'tick');

// warm-up do dużej populacji
const warm = parseFloat(process.argv[2] || '5') * TICKS_PER_YEAR;
const t0 = Date.now();
for (let i = 0; i < warm; i++) sim.step(1);
console.log(`rozgrzewka ${warm} taktów w ${Date.now() - t0} ms, organizmów: ${sim.organisms.length}`);

for (const k of Object.keys(times)) times[k] = 0;
const N = 300;
const t1 = process.hrtime.bigint();
for (let i = 0; i < N; i++) sim.step(1);
const total = Number(process.hrtime.bigint() - t1) / 1e6;

console.log(`\n${N} taktów w ${total.toFixed(0)} ms → ${(N / total * 1000).toFixed(0)} taktów/s`);
console.log(`organizmy: ${sim.organisms.length}, pełna fizyka: ${sim.stats.fullDetail}`);
let acc = 0;
for (const [k, v] of Object.entries(times).sort((a, b) => b[1] - a[1])) {
  acc += v;
  console.log(`  ${k.padEnd(16)} ${v.toFixed(1).padStart(8)} ms  ${(v / total * 100).toFixed(1)}%`);
}
console.log(`  ${'reszta (pętla organizmów)'.padEnd(16)} ${(total - acc).toFixed(1).padStart(8)} ms  ${((total - acc) / total * 100).toFixed(1)}%`);
