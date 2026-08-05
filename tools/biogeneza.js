// Sprawdza zasadę, na której stoi cały świat: żaden organizm ani żadna komórka
// nie powstaje sama z siebie. node tools/biogeneza.js [lata]
import { Simulation } from '../src/sim/simulation.js';
import { defaultDesign } from '../src/bio/seed.js';
import { DEFAULT_PARAMS } from '../src/world/worldgen.js';
import { TICKS_PER_YEAR } from '../src/world/climate.js';

const years = parseFloat(process.argv[2] || '5');
const ticks = Math.round(years * TICKS_PER_YEAR);
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' BŁĄD '} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

const sim = new Simulation({ ...DEFAULT_PARAMS, seed: 'biogeneza', size: 'small' });
const spot = { x: sim.world.widthUnits / 2, y: sim.world.heightUnits / 2 };
const founder = sim.seed(defaultDesign(), spot.x, spot.y);
sim.setFocus(spot.x, spot.y, 700, 3);

check(sim.organisms.length === 1, 'zasiew tworzy dokładnie jedną komórkę',
  `${sim.organisms.length} organizmów`);
check(founder.body.cellCount === 1, 'pierwszy organizm ma jedną komórkę',
  `${founder.body.cellCount}`);

for (let t = 0; t < ticks; t++) sim.step(1);
console.log(`\npo ${years} latach: ${sim.organisms.length} organizmów, ${sim.species.aliveCount} gatunków\n`);

// --- każdy organizm ma udokumentowane pochodzenie ---
const origins = {};
for (const o of sim.organisms) origins[o.origin] = (origins[o.origin] || 0) + 1;
console.log('pochodzenie:', JSON.stringify(origins));
check(!Object.keys(origins).some(k => k !== 'parent'),
  'każdy żyjący organizm powstał z podziału innego',
  Object.entries(origins).filter(([k]) => k !== 'parent').map(([k, v]) => `${k}:${v}`).join(' ') || 'brak wyjątków');

// --- cała populacja pochodzi od jednego założyciela ---
const ancestors = new Set(sim.organisms.map(o => o.ancestorId));
check(ancestors.size === 1 && ancestors.has(founder.id),
  'cała populacja wywodzi się z tej jednej komórki',
  `${ancestors.size} niezależnych linii`);

// --- każdy ma rodzica, którego id jest niższe (rodzic istniał wcześniej) ---
const badParent = sim.organisms.filter(o => !(o.parentId > 0 && o.parentId < o.id));
check(badParent.length === 0, 'każdy organizm wskazuje wcześniej istniejącego rodzica',
  `${badParent.length} bez poprawnego rodzica`);

// --- pokolenia rosną, czyli linia faktycznie się rozmnaża ---
const maxGen = Math.max(...sim.organisms.map(o => o.generation));
check(maxGen > 1, 'linia przeszła przez kolejne pokolenia', `pokolenie ${maxGen}`);

// --- komórki: ciało bez podziału pozostaje jednokomórkowe ---
const cellCounts = sim.organisms.map(o => o.body.cellCount);
check(cellCounts.every(c => c >= 1), 'każde ciało ma co najmniej jedną komórkę');
console.log(`  komórek w ciele: od ${Math.min(...cellCounts)} do ${Math.max(...cellCounts)}`);

// --- świat nie ma zapisu, więc nic nie może z niego wrócić ---
check(typeof sim.serialize !== 'function' && typeof Simulation.deserialize !== 'function',
  'nie istnieje żadna droga odtworzenia świata z danych',
  'brak serializacji');

// --- dalsza symulacja też niczego nie powołuje ---
const idsBefore = new Set(sim.organisms.map(o => o.id));
sim.step(400);
const fresh = sim.organisms.filter(o => !idsBefore.has(o.id));
const orphans = fresh.filter(o => o.origin !== 'parent');
check(orphans.length === 0, 'każdy nowy organizm powstał z podziału',
  `${fresh.length} nowych, w tym ${orphans.length} bez rodzica`);

console.log(failures === 0
  ? '\nZasada biogenezy zachowana we wszystkich sprawdzeniach.'
  : `\n${failures} sprawdzeń nieudanych.`);
process.exit(failures ? 1 : 0);
