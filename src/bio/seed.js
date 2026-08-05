import { Genome, ACT, SIG_COUNT, MORPHOGENS, TRAITS } from './genome.js';
import { clamp } from '../core/util.js';

/**
 * Projekt pierwszej komórki: jedyny moment, w którym gracz dotyka DNA.
 * Nie tworzy organizmu — tworzy punkt startowy, od którego ewolucja pracuje
 * już sama. Każdy parametr ma cenę, a punkty są ograniczone.
 */
export const CELL_DESIGN_DEF = {
  size:        { label: 'Rozmiar', min: 0, max: 10, def: 3, cost: 1.1, hint: 'Większa komórka mieści więcej, ale kosztuje więcej energii.' },
  membrane:    { label: 'Grubość błony', min: 0, max: 10, def: 3, cost: 1.0, hint: 'Ochrona przed temperaturą i uszkodzeniami kosztem wymiany z otoczeniem.' },
  storage:     { label: 'Magazyn energii', min: 0, max: 10, def: 3, cost: 0.9, hint: 'Bufor na złe warunki.' },
  metabolism:  { label: 'Tempo metabolizmu', min: 0, max: 10, def: 5, cost: 0.7, hint: 'Szybsza przemiana materii: więcej zysku i więcej kosztów.' },
  division:    { label: 'Szybkość podziału', min: 0, max: 10, def: 5, cost: 1.2, hint: 'Niższy próg energii potrzebny do rozmnożenia.' },
  resistance:  { label: 'Odporność', min: 0, max: 10, def: 2, cost: 1.3, hint: 'Wytrzymałość na uszkodzenia i choroby.' },
  mutation:    { label: 'Tempo mutacji', min: 0, max: 10, def: 4, cost: 0.4, hint: 'Szybsza ewolucja, ale więcej nieudanych potomków.' },
};

export const ENERGY_SOURCES = [
  { key: 'photo', label: 'Światło', trait: 0, hint: 'Energia ze światła. Wymaga otwartej przestrzeni i minerałów.' },
  { key: 'absorb', label: 'Rozpuszczone minerały', trait: 2, hint: 'Pobieranie substancji wprost z otoczenia. Skuteczne w wodzie.' },
  { key: 'digest', label: 'Martwa materia', trait: 1, hint: 'Rozkład szczątków. Wymaga miejsc, gdzie coś już umarło.' },
];

export const DESIGN_BUDGET = 34;

export function designCost(design) {
  let c = 0;
  for (const k of Object.keys(CELL_DESIGN_DEF)) {
    c += (design[k] ?? CELL_DESIGN_DEF[k].def) * CELL_DESIGN_DEF[k].cost;
  }
  return Math.round(c * 10) / 10;
}

export function defaultDesign() {
  const d = { source: 'photo' };
  for (const [k, v] of Object.entries(CELL_DESIGN_DEF)) d[k] = v.def;
  return d;
}

function gene(s1, c1, t1, act, p0, p1, p2, w = 1) {
  return { s1, c1, t1, use2: 0, s2: 0, c2: 0, t2: 0, act, p0, p1, p2, w };
}

const ALWAYS = MORPHOGENS + 4;   // sygnał "stała" — zawsze równy 1
const CONST_SIG = ALWAYS;

/** Zamienia projekt gracza na najprostszy możliwy genom. */
export function genomeFromDesign(design, hue = 120) {
  const g = new Genome();
  const v = (k) => (design[k] ?? CELL_DESIGN_DEF[k].def) / 10;

  const src = ENERGY_SOURCES.find(s => s.key === design.source) || ENERGY_SOURCES[0];

  g.params.membrane = clamp(0.06 + v('membrane') * 1.5, 0.02, 2.5);
  g.params.metabolism = clamp(0.45 + v('metabolism') * 1.4, 0.25, 3.2);
  g.params.reproThr = clamp(4.2 - v('division') * 3.0, 0.8, 12);
  g.params.mutRate = clamp(0.012 + v('mutation') * 0.22, 0.001, 0.9);
  g.params.devSteps = 1;
  g.params.lifespan = clamp(900 + v('storage') * 2600 + v('membrane') * 1400, 150, 200000);
  g.params.cellCost = clamp(0.6 + v('size') * 1.0, 0.4, 2.4);
  g.params.hue = hue;
  g.params.invest = 0.45;
  g.params.disperse = 1.4;
  g.params.oscFreq = 0.18;
  g.params.senseGain = 1.0;
  g.params.memory = 0.3;

  // rozmiar komórki
  g.genes.push(gene(CONST_SIG, 0, 0.5, ACT.GROW, 0, clamp(-0.35 + v('size') * 1.2, -1, 1), 0, 1));
  // źródło energii
  g.genes.push(gene(CONST_SIG, 0, 0.5, ACT.SPECIALIZE, (src.trait + 0.5) / TRAITS.length, 0.95, 0, 1));
  // magazyn
  if (v('storage') > 0.05) {
    g.genes.push(gene(CONST_SIG, 0, 0.5, ACT.SPECIALIZE, (7 + 0.5) / TRAITS.length, clamp(v('storage') * 1.1, 0, 1), 0, 1));
  }
  // odporność
  if (v('resistance') > 0.05) {
    g.genes.push(gene(CONST_SIG, 0, 0.5, ACT.SPECIALIZE, (8 + 0.5) / TRAITS.length, clamp(v('resistance') * 1.1, 0, 1), 0, 1));
  }
  // komórka rozrodcza
  g.genes.push(gene(CONST_SIG, 0, 0.5, ACT.SPECIALIZE, (9 + 0.5) / TRAITS.length, 0.4, 0, 1));

  // Wyciszony gen podziału. Nic nie robi, dopóki mutacja nie zmieni progu —
  // ukryty potencjał wielokomórkowości, obecny od pierwszej chwili.
  g.genes.push(gene(CONST_SIG, 0, 3.0, ACT.DIVIDE, 0.25, 0, 0, 1));
  // Wyciszony gen morfogenu — surowiec dla przyszłego różnicowania.
  g.genes.push(gene(CONST_SIG, 0, 3.0, ACT.EMIT, 0.1, 0.8, 0, 1));

  return g;
}

/** Całkowicie losowy genom — "co się stanie, jeśli". */
export function randomGenome(rng) {
  const g = Genome.random(rng, 4 + rng.int(9));
  g.params.devSteps = 1 + rng.int(4);
  return g;
}
