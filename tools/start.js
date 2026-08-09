// Skąd zaczyna życie i czy ma czym się poruszyć? node tools/start.js [światów] [taktów]
//
// Dwie sprawy, które gracz zobaczył jako jedną: pierwsza komórka lądowała
// prawie zawsze w wodzie, a w całym świecie nie powstawał ani jeden mięsień,
// więc organizm dryfował do brzegu i tam stawał.
import { Simulation } from '../src/sim/simulation.js';
import { defaultDesign } from '../src/bio/seed.js';
import { findSeedSpot } from '../src/bio/seedspot.js';
import { DEFAULT_PARAMS } from '../src/world/worldgen.js';

const worlds = parseInt(process.argv[2] || '40', 10);
const ticks = parseInt(process.argv[3] || '12000', 10);
const census = parseInt(process.argv[4] || '5', 10);
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' BŁĄD '} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

// ------------------------------------------------------- gdzie ląduje pierwsza komórka
let water = 0;
const biomes = {};
for (let s = 0; s < worlds; s++) {
  const sim = new Simulation({ ...DEFAULT_PARAMS, seed: 'start-' + s, size: 'small' });
  const spot = findSeedSpot(sim.world, sim.climate, sim.rng, 'absorb');
  const i = sim.world.tileOf(spot.x, spot.y);
  if (sim.world.isWaterAt(i)) water++;
  const b = sim.world.biomeDefAt(i).name;
  biomes[b] = (biomes[b] || 0) + 1;
}
const frac = water / worlds;
console.log(`pierwsza komórka w wodzie: ${water} z ${worlds} światów (${(frac * 100).toFixed(0)}%)`);
console.log('biomy startowe:', Object.entries(biomes).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${v}`).join(', '));
check(frac < 0.75, 'wybór miejsca nie faworyzuje wody z góry',
  'przy premii 1.1× dla wody było 97%');

// ------------------------------------------------------- czy ruch jest osiągalny
//
// Mięsień to zdarzenie rzadkie, a płodność świata bywa różna o dwa rzędy
// wielkości. Pojedynczy przebieg nie odróżnia „droga zamknięta" od „mało
// urodzeń", więc próba idzie z kilku światów naraz.
let born = 0, contract = 0, multi = 0, both = 0, muscle = 0, sensor = 0;
let aliveTot = 0, aliveMuscle = 0, aliveSensor = 0, aliveMoving = 0;

for (let s = 0; s < census; s++) {
  const sim = new Simulation({ ...DEFAULT_PARAMS, seed: 'ruch-' + s, size: 'small' });
  const spot = findSeedSpot(sim.world, sim.climate, sim.rng, 'absorb');
  sim.seed(defaultDesign(), spot.x, spot.y);
  sim.setFocus(spot.x, spot.y, 700, 3);

  const seen = new Set();
  for (let t = 0; t < ticks; t++) {
    for (const o of sim.organisms) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      const c = o.body.cap.contract > 0.05, m = o.body.cellCount > 1;
      if (c) contract++;
      if (m) multi++;
      if (c && m) both++;
      if (o.brain.effectors.length) muscle++;
      if (o.brain.sensors.length) sensor++;
    }
    sim.step(1);
  }
  born += seen.size;
  aliveTot += sim.organisms.length;
  aliveMuscle += sim.organisms.filter(o => o.brain.effectors.length).length;
  aliveSensor += sim.organisms.filter(o => o.brain.sensors.length).length;
  aliveMoving += sim.organisms.filter(o => o.measuredSpeed > 0.01).length;
}

console.log(`\nurodzonych w ${census} światach: ${born} — kurczliwych ${contract}, `
  + `wielokomórkowych ${multi}, jedno i drugie ${both}`);
console.log(`z choć jednym mięśniem: ${muscle}, z choć jednym receptorem: ${sensor}`);
console.log(`żywych na koniec: ${aliveTot}, z mięśniami ${aliveMuscle}, `
  + `z receptorami ${aliveSensor}, w ruchu ${aliveMoving}`);

// Ile urodzeń wystarczy, żeby zero coś znaczyło. Przy mierzonej częstości
// mięśnia rzędu 1 na 160 urodzeń próba 1500 daje kilkanaście oczekiwanych
// zdarzeń — brak choćby jednego byłby wtedy wynikiem, a nie pechem. Próg
// nie jest stały w historii tego pliku: gdy podział wymagał tylko energii,
// światy rodziły dziesiątki tysięcy osobników i próg wynosił 4000.
check(born > 1500, 'próba jest dość liczna, by orzekać o rzadkich zdarzeniach',
  `${born} urodzeń, mięsień co ${muscle ? Math.round(born / muscle) : '∞'} urodzeń`);
check(both > 0, 'kurczliwość i wielokomórkowość spotykają się w jednym ciele',
  'przed osobnym wyciszonym genem: 0 na 2047 urodzonych');
check(muscle > 0, 'mięsień jest w zasięgu mutacji — powstał choć raz',
  `${muscle} na ${born} urodzonych`);
check(sensor > 0, 'receptor jest w zasięgu mutacji — powstał choć raz',
  `${sensor} na ${born}`);

console.log(failures === 0
  ? '\nStart jest uczciwy, a ruch osiągalny. Czy dobór z tego skorzysta — to osobne pytanie.'
  : `\n${failures} sprawdzeń nieudanych.`);
process.exit(failures ? 1 : 0);
