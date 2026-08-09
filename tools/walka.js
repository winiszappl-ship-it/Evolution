// Czy starcie między organizmami jest prawdziwe? node tools/walka.js [lata]
import { Simulation } from '../src/sim/simulation.js';
import { Genome, ACT, MORPHOGENS, TRAITS } from '../src/bio/genome.js';
import { Organism } from '../src/bio/organism.js';
import { defaultDesign } from '../src/bio/seed.js';
import { DEFAULT_PARAMS } from '../src/world/worldgen.js';
import { TICKS_PER_YEAR } from '../src/world/climate.js';
import { findSeedSpot } from '../src/bio/seedspot.js';

const years = parseFloat(process.argv[2] || '10');
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' BŁĄD '} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

const CONST_SIG = MORPHOGENS + 4;
const gene = (act, p0, p1, t1 = 0.5) =>
  ({ s1: CONST_SIG, c1: 0, t1, use2: 0, s2: 0, c2: 0, t2: 0, act, p0, p1, p2: 0, w: 1 });

/** Genom o zadanej zdolności — używany tylko w tym teście, do postawienia sceny. */
function made(trait, strength, cells = 1) {
  const g = new Genome();
  g.params.devSteps = cells > 1 ? 3 : 1;
  g.genes.push(gene(ACT.SPECIALIZE, (trait + 0.5) / TRAITS.length, strength));
  if (cells > 1) g.genes.push(gene(ACT.DIVIDE, 0.25, 0));
  return g;
}

const sim = new Simulation({ ...DEFAULT_PARAMS, seed: 'walka', size: 'small' });
const cx = sim.world.widthUnits / 2, cy = sim.world.heightUnits / 2;

// ------------------------------------------------- rana pada tam, gdzie cios
const target = new Organism(made(0, 0.9, 4), cx, cy, 40, sim.world);
target._sector = sim.world.sectorOf(cx, cy);
if (target.body.cellCount >= 2) {
  const pos = { x: 0, y: 0 };
  target.cellWorldPos(0, pos);
  target.hurtAt(pos.x, pos.y, 0.4);
  const hurt = [...target.cellHp].map((v, i) => ({ i, v }));
  const damaged = hurt.filter(c => c.v < 1);
  check(damaged.length === 1 && damaged[0].i === target._lastHit,
    'cios uszkadza komórkę w miejscu trafienia, nie całe ciało',
    `uszkodzona ${damaged.length} z ${target.body.cellCount}`);
} else {
  console.log('  (ciało testowe wyszło jednokomórkowe — pomijam sprawdzenie miejsca rany)');
}

// ------------------------------------------------- pancerz kosztuje napastnika
const attacker = new Organism(made(1, 0.95), cx, cy, 40, sim.world);
const soft = new Organism(made(0, 0.9), cx + 0.4, cy, 40, sim.world);
const armored = new Organism(made(8, 1.2), cx + 0.4, cy, 40, sim.world);
for (const o of [attacker, soft, armored]) o._sector = sim.world.sectorOf(o.x, o.y);

const beforeSoft = attacker.integrity;
for (let t = 0; t < 60; t++) sim.feed(attacker, soft, 0.6, 1, cx + 0.2, cy);
const afterSoft = attacker.integrity;

const attacker2 = new Organism(made(1, 0.95), cx, cy, 40, sim.world);
attacker2._sector = sim.world.sectorOf(cx, cy);
for (let t = 0; t < 60; t++) sim.feed(attacker2, armored, 0.6, 1, cx + 0.2, cy);

console.log(`napastnik po gryzieniu miękkiego: ${afterSoft.toFixed(3)}, `
  + `po gryzieniu opancerzonego: ${attacker2.integrity.toFixed(3)}`);
check(attacker2.integrity < afterSoft,
  'gryzienie twardej tkanki rani napastnika',
  `${((1 - attacker2.integrity / Math.max(1e-9, afterSoft)) * 100).toFixed(0)}% więcej strat`);
check(afterSoft >= beforeSoft - 1e-9,
  'gryzienie miękkiej tkanki nie kosztuje napastnika zdrowia');

// ------------------------------------------------- starcie może się skończyć śmiercią
const prey = new Organism(made(0, 0.9), cx, cy, 30, sim.world);
prey._sector = sim.world.sectorOf(cx, cy);
const hunter = new Organism(made(1, 0.95), cx, cy, 40, sim.world);
hunter._sector = sim.world.sectorOf(cx, cy);
let ticks = 0;
while (prey.alive && ticks < 4000) { sim.feed(hunter, prey, 0.6, 1, cx, cy); ticks++; }
check(!prey.alive, 'nieprzerwane gryzienie zabija ofiarę',
  prey.alive ? 'przeżyła 4000 taktów' : `po ${ticks} taktach, przyczyna: ${prey.deathCause}`);

// ------------------------------------------------- utrata komórek bez śmierci
const big = new Organism(made(0, 0.9, 6), cx, cy, 60, sim.world);
big._sector = sim.world.sectorOf(cx, cy);
if (big.body.cellCount >= 3) {
  const pos = { x: 0, y: 0 };
  big.cellWorldPos(0, pos);
  const capBefore = big.body.cap.litho;
  for (let t = 0; t < 40 && big.cellsAlive === big.body.cellCount; t++) big.hurtAt(pos.x, pos.y, 0.2);
  if (big._capDirty) big.recomputeCap();
  check(big.alive && big.cellsAlive < big.body.cellCount,
    'ciało przeżywa utratę części komórek',
    `zostało ${big.cellsAlive} z ${big.body.cellCount}`);
  check(big.body.cap.litho < capBefore,
    'martwa komórka przestaje pracować na rzecz organizmu',
    `litotrofia ${capBefore.toFixed(2)} → ${big.body.cap.litho.toFixed(2)}`);
} else {
  console.log('  (ciało testowe za małe — pomijam sprawdzenie utraty komórek)');
}

// ------------------------------------------------- czy w żywym świecie ktoś walczy
const world = new Simulation({ ...DEFAULT_PARAMS, seed: 'test-alpha', size: 'small' });
// Zasiew idzie tam, gdzie da się żyć. Środek mapy przestał być takim miejscem,
// gdy energia przestała padać z nieba i zaczęła wypływać z konkretnych punktów.
const wspot = findSeedSpot(world.world, world.climate, world.rng, 'litho');
world.seed(defaultDesign(), wspot.x, wspot.y);
world.setFocus(wspot.x, wspot.y, 700, 3);
const causes = {};
for (let t = 0; t < Math.round(years * TICKS_PER_YEAR); t++) {
  const before = new Map(world.organisms.map(o => [o.id, o]));
  world.step(1);
  const now = new Set(world.organisms.map(o => o.id));
  for (const [id, o] of before) if (!now.has(id)) causes[o.deathCause || '?'] = (causes[o.deathCause || '?'] || 0) + 1;
}
const killed = (causes['zjedzony'] || 0) + (causes['rozerwany'] || 0);
const tot = Object.values(causes).reduce((a, b) => a + b, 0);
console.log(`\npo ${years} latach: ${world.organisms.length} organizmów`);
console.log('przyczyny śmierci:', Object.entries(causes).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${v}`).join(', '));
console.log(`śmierć z cudzej ręki: ${killed} z ${tot} (${(killed / Math.max(1, tot) * 100).toFixed(2)}%)`);

console.log(failures === 0
  ? '\nMechanika starcia działa. To, czy ewolucja z niej skorzysta, jest osobnym pytaniem.'
  : `\n${failures} sprawdzeń nieudanych.`);
process.exit(failures ? 1 : 0);
