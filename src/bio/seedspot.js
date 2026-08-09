import { TILE } from '../world/world.js';
import { MINERAL_RATE, ABSORB_RATE } from './organism.js';

/**
 * Gdzie postawić pierwszą komórkę.
 *
 * Silnik nie ma tu ulubionego biomu i nie zna pojęcia „dobrego miejsca".
 * Pyta świat dokładnie o to, o co pyta żywy organizm w swoim bilansie
 * energii (organism.js, metabolize): ile światła dociera do kafla, jaka
 * jest temperatura, ile jest tlenu, czy starczy minerałów. Miejsce wygrywa
 * tylko wtedy, gdy naprawdę więcej da tej konkretnej komórce.
 *
 * Wcześniej stały tu dwa człony, których w bilansie nie ma: premia 1.1×
 * za wodę i liniowa nagroda za zasobność gleby bez żadnego sufitu. W
 * metabolizmie minerały wchodzą jako stosunek „ile jest" do „ile trzeba"
 * i powyżej potrzeby nie dają nic. Skutek tej rozbieżności był mierzalny:
 * pierwsza komórka lądowała w wodzie w 39 światach na 40, choć woda wcale
 * nie karmiła jej lepiej.
 */
export function findSeedSpot(world, climate, rng, design) {
  const source = typeof design === 'string' ? design : (design && design.source) || 'litho';

  // Uśredniona doba zamiast bieżącej godziny: w chwili zasiewu może być noc,
  // a to mówi o świecie tyle co nic. dayLight 0.5 zeruje wahanie dobowe
  // temperatury i daje mniej więcej średnie światło dnia.
  const mean = Object.assign(Object.create(Object.getPrototypeOf(climate)), climate);
  mean.dayLight = 0.5;

  // ile minerałów i materii potrzeba na kilkanaście taktów pracy jednej komórki
  const mineralNeed = MINERAL_RATE * 12;
  const detritusNeed = ABSORB_RATE * 12;

  let best = 0, bestScore = -1;
  for (let a = 0; a < 500; a++) {
    const i = rng.int(world.W * world.H);
    const b = world.biomeDefAt(i);

    const temp = world.tempAt(i, mean);
    const tempEff = Math.exp(-((temp - 18) ** 2) / 900);        // ta sama krzywa co w metabolizmie
    const oxyEff = Math.min(1.3, Math.max(0.1, 0.25 + world.oxygenAt(i) * 3.2));

    let score;
    if (source === 'litho') {
      // liczy się zasobność podłoża: litotrof zjada to, co wywietrzało ze skały
      score = Math.min(1, world.nutrient[i] / (mineralNeed * 3));
    } else if (source === 'absorb') {
      score = Math.min(1, world.detritus[i] / detritusNeed) * (b.water ? 1.4 : 0.55);
    } else {
      const fx = (i % world.W) * TILE + TILE / 2, fy = ((i / world.W) | 0) * TILE + TILE / 2;
      score = Math.min(1, world.food.concentrationAt(fx, fy) / 20);
    }

    score *= tempEff * oxyEff;
    score *= rng.float(0.85, 1.15);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return { x: (best % world.W) * TILE + TILE / 2, y: ((best / world.W) | 0) * TILE + TILE / 2 };
}
