// Czy pokarm daje realny powód do ruchu? node tools/pokarm.js [lata]
import { Simulation } from '../src/sim/simulation.js';
import { defaultDesign } from '../src/bio/seed.js';
import { DEFAULT_PARAMS } from '../src/world/worldgen.js';
import { TICKS_PER_YEAR } from '../src/world/climate.js';
import { FOOD_PLANT, FOOD_REMAINS } from '../src/world/food.js';
import { findSeedSpot } from '../src/bio/seedspot.js';

const years = parseFloat(process.argv[2] || '10');
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' BŁĄD '} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

// ---------------------------------------------------------------- gradient
const sim = new Simulation({ ...DEFAULT_PARAMS, seed: 'pokarm', size: 'small' });
const food = sim.world.food;
console.log(`pierwotna materia organiczna: ${food.count} okruchów, ${food.total.toFixed(0)} energii\n`);

// Pojedynczy okruch w pustym miejscu — sprawdzamy, jak stężenie maleje.
const fx = 600, fy = 600;
for (const i of food.near(fx, fy, 60, [])) food.remove(i);
food.add(fx, fy, 12);

const prof = [0, 1, 2, 4, 8, 16, 24].map(d => ({ d, v: food.concentrationAt(fx + d, fy) }));
console.log('stężenie w zależności od odległości:',
  prof.map(p => `${p.d}:${p.v.toFixed(2)}`).join('  '));
check(prof.every((p, i) => i === 0 || p.v < prof[i - 1].v),
  'stężenie maleje z odległością — jest gradient, nie stopień');
check(prof[6].v === 0, 'poza zasięgiem okruch przestaje być czuć');

// Ciało o szerokości 3 jednostek: czy jego dwie strony czują różnicę?
const left = food.concentrationAt(fx - 10.5, fy);
const right = food.concentrationAt(fx - 7.5, fy);
const contrast = Math.abs(right - left) / Math.max(1e-9, (right + left) / 2);
console.log(`dwa receptory oddalone o 3 jednostki: ${left.toFixed(3)} vs ${right.toFixed(3)}`);
check(contrast > 0.05,
  'przeciwne strony ciała odczytują różne wartości',
  `różnica ${(contrast * 100).toFixed(0)}%`);

// ---------------------------------------------------------------- zasięg
const reachTest = new Simulation({ ...DEFAULT_PARAMS, seed: 'zasieg', size: 'small' });
reachTest.world.food.add(1000, 1000, 50);
const gotFar = reachTest.world.food.consume(1000 + 40, 1000, 4, 5);
const gotNear = reachTest.world.food.consume(1000 + 1, 1000, 4, 5);
check(gotFar === 0 && gotNear > 0,
  'do pokarmu trzeba dojść — z daleka nie da się go pobrać',
  `z 40 jednostek: ${gotFar}, z bliska: ${gotNear.toFixed(1)}`);

// ---------------------------------------------------------------- dobór
// Tam, gdzie da się żyć — czyli tam, gdzie leży materia po czymś, co umarło.
const spot = findSeedSpot(sim.world, sim.climate, sim.rng, 'litho');
sim.seed(defaultDesign(), spot.x, spot.y);
sim.setFocus(spot.x, spot.y, 700, 3);
const ticks = Math.round(years * TICKS_PER_YEAR);

// Materia roślinna jest pierwotna: jest w świecie od jego powstania i nikt jej
// nie dorabia. Żywy organizm nie odkłada okruchu z nadmiaru energii — nadwyżka
// wraca do kafla jako materia rozpuszczona. Pilnujemy, żeby zapas roślinny
// nigdy nie urósł: wzrost oznaczałby, że coś żywego znów produkuje pokarm.
const plantEnergy = () => {
  const f = sim.world.food;
  let e = 0;
  for (let i = 0; i < f.used.length; i++) if (f.used[i] && f.kind[i] === FOOD_PLANT) e += f.e[i];
  return e;
};
let plantStart = plantEnergy(), plantPeak = plantStart, grew = 0;
for (let t = 0; t < ticks; t++) {
  sim.step(1);
  if (t % 64 !== 0) continue;
  const e = plantEnergy();
  if (e > plantPeak + 1e-6) { grew++; plantPeak = e; }
}

console.log(`\npo ${years} latach: ${sim.organisms.length} organizmów, `
  + `${sim.world.food.count} okruchów w świecie\n`);

// Czy ci, którzy potrafią się ruszać, jedzą więcej materii stałej?
const eaters = sim.organisms.filter(o => o.body.cap.digest > 0.05 && o.age > 200);
const motile = eaters.filter(o => o.brain.effectors.length > 0);
const still = eaters.filter(o => o.brain.effectors.length === 0);
const perAge = (arr) => arr.length
  ? arr.reduce((a, o) => a + (o.gain.plant + o.gain.carrion) / o.age, 0) / arr.length : 0;

console.log(`zdolnych do trawienia: ${eaters.length} `
  + `(z mięśniami ${motile.length}, bez ${still.length})`);
if (motile.length >= 3 && still.length >= 3) {
  const m = perAge(motile), s = perAge(still);
  console.log(`pobór materii stałej na takt życia: ruchliwe ${m.toFixed(4)}, nieruchome ${s.toFixed(4)}`);
  check(m > s, 'ruch opłaca się przy zdobywaniu pokarmu stałego',
    `${(m / Math.max(1e-9, s)).toFixed(2)}× więcej`);
} else {
  console.log('  (za mało organizmów obu rodzajów, by porównać — ewolucja jeszcze tam nie doszła)');
}

const totalEaten = sim.organisms.reduce((a, o) => a + o.gain.plant + o.gain.carrion, 0);
check(totalEaten > 0, 'pokarm stały jest w ogóle zjadany', `${totalEaten.toFixed(0)} energii`);

// --- skąd bierze się pokarm stały ---
const f = sim.world.food;
let plant = 0, remains = 0;
for (let i = 0; i < f.used.length; i++) {
  if (!f.used[i]) continue;
  if (f.kind[i] === FOOD_PLANT) plant++; else remains++;
}
console.log(`okruchy w świecie: ${plant} roślinnych, ${remains} ze szczątków`);
console.log(`materia roślinna: na starcie ${plantStart.toFixed(0)} energii, `
  + `szczyt ${plantPeak.toFixed(0)}, teraz ${plantEnergy().toFixed(0)}`);

check(grew === 0, 'żywy organizm nie wytwarza pokarmu roślinnego',
  grew ? `zapas urósł ${grew} razy` : 'zapas roślinny nigdy nie urósł');
check(remains > 0, 'szczątki są odnawialnym pokarmem stałym — powstają ze śmierci',
  `${remains} okruchów`);
check(plantStart > 0,
  'materia roślinna jest w świecie od jego powstania',
  `${plantStart.toFixed(0)} energii pierwotnej — zapas nieodnawialny`);

console.log(failures === 0 ? '\nPokarm działa jako powód do ruchu.' : `\n${failures} sprawdzeń nieudanych.`);
process.exit(failures ? 1 : 0);
