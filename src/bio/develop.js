import { ACT, MORPHOGENS, TRAIT_COUNT, TRAIT_UPKEEP, SIG_COUNT } from './genome.js';
import { clamp, TAU } from '../core/util.js';

export const MAX_CELLS = 44;
const DEV_OP_BUDGET = 24000;
// Ile energii kosztuje zbudowanie jednostki masy ciała. Rodzic płaci to
// z tego, co przekazał potomkowi — dlatego duże ciało nie może pojawić się
// w jednym pokoleniu, choćby DNA o nim marzyło.
export const BUILD_ENERGY_PER_MASS = 1.6;

function cellBuildCost(r, cellCost) {
  return Math.PI * r * r * cellCost * BUILD_ENERGY_PER_MASS;
}

/**
 * Rozwój zarodkowy.
 *
 * Zaczynamy od jednej komórki. Geny są regułami warunkowymi czytanymi przez
 * każdą komórkę osobno. Komórka nie wie, czym się stanie — reaguje wyłącznie
 * na własny wiek, stężenia morfogenów, liczbę sąsiadów i swoje położenie.
 * Kształt organizmu to skutek uboczny tych lokalnych decyzji.
 */
export function develop(genome, budget = Infinity) {
  const genes = genome.genes;
  const devSteps = Math.max(1, Math.round(genome.params.devSteps));
  const cellCost = genome.params.cellCost;

  const cells = [makeCell(0, 0, 0.85, 0)];
  cells[0].m[0] = 1;              // depozyt matczyny — źródło pierwszej asymetrii
  let bonds = [];
  let ops = 0;

  // Zarodek ma tyle energii budulcowej, ile dał mu rodzic. Pierwsza komórka
  // powstaje zawsze — bez niej nie byłoby czego rozwijać.
  const build = { spent: cellBuildCost(cells[0].r, cellCost), budget, truncated: false };

  for (let step = 0; step < devSteps; step++) {
    diffuse(cells, bonds);

    const snapshot = cells.length;
    for (let ci = 0; ci < snapshot; ci++) {
      const cell = cells[ci];
      if (!cell.alive) continue;
      cell.age++;

      const sig = readSignals(cell, cells, step, devSteps);
      let fired = 0;

      for (let gi = 0; gi < genes.length; gi++) {
        if (++ops > DEV_OP_BUDGET) { gi = genes.length; step = devSteps; break; }
        const g = genes[gi];
        if (!matches(g, sig)) continue;
        applyAction(g, cell, ci, cells, bonds, build, cellCost);
        if (++fired >= 3) break;   // komórka wykonuje najwyżej 3 działania na krok
      }
    }
    if (ops > DEV_OP_BUDGET) break;
  }

  // usunięcie komórek martwych (apoptoza) i przenumerowanie wiązań
  const map = new Int32Array(cells.length).fill(-1);
  const live = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].alive) { map[i] = live.length; live.push(cells[i]); }
  }
  if (live.length === 0) { live.push(cells[0]); cells[0].alive = true; map[0] = 0; }

  const finalBonds = [];
  const seen = new Set();
  for (const b of bonds) {
    const a = map[b.a], c = map[b.b];
    if (a < 0 || c < 0 || a === c) continue;
    const key = a < c ? a * 1000 + c : c * 1000 + a;
    if (seen.has(key)) continue;
    seen.add(key);
    finalBonds.push({ a, b: c, rest: b.rest, stiff: b.stiff, muscle: 0, phase: 0 });
  }

  // Ciało musi trzymać się kupy — komórki bez połączenia dołączamy do najbliższej.
  connectStragglers(live, finalBonds);

  // wyśrodkowanie względem środka masy
  let mx = 0, my = 0, mtot = 0;
  for (const c of live) {
    const m = c.r * c.r;
    mx += c.x * m; my += c.y * m; mtot += m;
  }
  mx /= mtot; my /= mtot;
  for (const c of live) { c.x -= mx; c.y -= my; }

  // parametry wiązań wynikają z komórek, które łączą
  for (const b of finalBonds) {
    const A = live[b.a], B = live[b.b];
    const dx = A.x - B.x, dy = A.y - B.y;
    b.rest = Math.max(0.4, Math.hypot(dx, dy));
    b.stiff = clamp(0.22 + (A.t[4] + B.t[4]) * 0.55 + (A.stiff + B.stiff) * 0.5, 0.05, 2.4);
    b.muscle = Math.max(A.t[3], B.t[3]);
    b.phase = ((A.m[1] + B.m[2]) % 1 + 1) % 1 * TAU;
    b.cellA = b.a; b.cellB = b.b;
  }

  return finalize(genome, live, finalBonds, build);
}

function makeCell(x, y, r, depth) {
  return {
    x, y, r, depth, age: 0, alive: true, terminal: false,
    t: new Float32Array(TRAIT_COUNT),
    m: new Float32Array(MORPHOGENS),
    stiff: 0, senseMod: 0, axon: 0, w0: 0, w1: 0,
  };
}

function readSignals(cell, cells, step, devSteps) {
  const sig = new Float32Array(SIG_COUNT);
  for (let i = 0; i < MORPHOGENS; i++) sig[i] = cell.m[i];
  sig[MORPHOGENS] = step / devSteps;
  sig[MORPHOGENS + 1] = cell.depth / 10;
  sig[MORPHOGENS + 2] = Math.hypot(cell.x, cell.y) / 8;
  sig[MORPHOGENS + 3] = countNeighbors(cell, cells) / 6;
  sig[MORPHOGENS + 4] = 1;
  sig[MORPHOGENS + 5] = cell.r / 2;
  return sig;
}

function countNeighbors(cell, cells) {
  let n = 0;
  for (const o of cells) {
    if (o === cell || !o.alive) continue;
    const d = (o.x - cell.x) ** 2 + (o.y - cell.y) ** 2;
    const rr = (o.r + cell.r) * 1.35;
    if (d < rr * rr) n++;
  }
  return n;
}

function matches(g, sig) {
  const v1 = sig[g.s1];
  if (g.c1 === 0 ? !(v1 > g.t1) : !(v1 < g.t1)) return false;
  if (g.use2) {
    const v2 = sig[g.s2];
    if (g.c2 === 0 ? !(v2 > g.t2) : !(v2 < g.t2)) return false;
  }
  return true;
}

function applyAction(g, cell, ci, cells, bonds, build, cellCost) {
  switch (g.act) {
    case ACT.DIVIDE: {
      if (cell.terminal || cells.length >= MAX_CELLS) return;
      const ang = g.p0 * TAU + g.p1 * 0.6;
      const childR = clamp(cell.r * (0.6 + (g.p2 + 1) * 0.28), 0.32, 2.2);

      // Nowa komórka to nowa masa, a masy nie da się zrobić z niczego.
      // Gdy energii budulcowej zabraknie, rozwój po prostu się zatrzymuje.
      const cost = cellBuildCost(childR, cellCost);
      if (build.spent + cost > build.budget) { build.truncated = true; return; }

      const d = cell.r + childR;
      let px = cell.x + Math.cos(ang) * d;
      let py = cell.y + Math.sin(ang) * d;

      // Miejsce w przestrzeni jest ograniczone — to prawo fizyki, nie reguła gry.
      let blocked = false;
      for (const o of cells) {
        if (!o.alive || o === cell) continue;
        const rr = (o.r + childR) * 0.82;
        if ((o.x - px) ** 2 + (o.y - py) ** 2 < rr * rr) { blocked = true; break; }
      }
      if (blocked) {
        let ok = false;
        for (let k = 1; k <= 5 && !ok; k++) {
          const a2 = ang + k * 0.55 * (k % 2 ? 1 : -1);
          px = cell.x + Math.cos(a2) * d;
          py = cell.y + Math.sin(a2) * d;
          ok = true;
          for (const o of cells) {
            if (!o.alive || o === cell) continue;
            const rr = (o.r + childR) * 0.82;
            if ((o.x - px) ** 2 + (o.y - py) ** 2 < rr * rr) { ok = false; break; }
          }
        }
        if (!ok) return;
      }

      const child = makeCell(px, py, childR, cell.depth + 1);
      build.spent += cost;
      const bias = clamp(0.5 + g.p1 * 0.45, 0.05, 0.95);
      for (let i = 0; i < MORPHOGENS; i++) {
        child.m[i] = cell.m[i] * bias;
        cell.m[i] *= (1 - bias) + bias * 0.6;
      }
      for (let i = 0; i < TRAIT_COUNT; i++) child.t[i] = cell.t[i] * clamp(0.6 + g.p2 * 0.5, 0, 1.2);
      child.stiff = cell.stiff;
      child.senseMod = cell.senseMod;
      cells.push(child);
      bonds.push({ a: ci, b: cells.length - 1, rest: d, stiff: 0.5 });

      // adhezja — nowa komórka przylega do wszystkiego, czego dotyka
      for (let j = 0; j < cells.length - 1; j++) {
        const o = cells[j];
        if (!o.alive || j === ci) continue;
        const rr = (o.r + childR) * 1.22;
        if ((o.x - px) ** 2 + (o.y - py) ** 2 < rr * rr) {
          bonds.push({ a: j, b: cells.length - 1, rest: Math.hypot(o.x - px, o.y - py), stiff: 0.35 });
        }
      }
      return;
    }
    case ACT.EMIT: {
      const idx = Math.min(MORPHOGENS - 1, Math.floor(g.p0 * MORPHOGENS));
      cell.m[idx] = clamp(cell.m[idx] + g.p1 * 0.7 * g.w, -1.5, 3);
      return;
    }
    case ACT.SPECIALIZE: {
      const idx = Math.min(TRAIT_COUNT - 1, Math.floor(g.p0 * TRAIT_COUNT));
      cell.t[idx] = clamp(cell.t[idx] + g.p1 * 0.55 * g.w, 0, 1.6);
      if (idx === 5) cell.senseMod = Math.min(4, Math.floor(((g.p2 + 1) / 2) * 5));
      if (idx === 6) { cell.w0 = g.p1; cell.w1 = g.p2; }
      return;
    }
    case ACT.GROW: {
      const target = clamp(cell.r + g.p1 * 0.3 * g.w, 0.3, 2.4);
      if (target > cell.r) {
        const cost = cellBuildCost(target, cellCost) - cellBuildCost(cell.r, cellCost);
        if (build.spent + cost > build.budget) { build.truncated = true; return; }
        build.spent += cost;
      }
      cell.r = target;
      cell.stiff = clamp(cell.stiff + g.p2 * 0.3, -0.4, 1.5);
      return;
    }
    case ACT.LINK: {
      const range = (0.6 + g.p0 * 3.4);
      let best = -1, bestD = Infinity;
      for (let j = 0; j < cells.length; j++) {
        if (j === ci || !cells[j].alive) continue;
        const o = cells[j];
        const d = Math.hypot(o.x - cell.x, o.y - cell.y);
        const lim = (o.r + cell.r) * range;
        if (d < lim && d < bestD) {
          let exists = false;
          for (const b of bonds) if ((b.a === ci && b.b === j) || (b.a === j && b.b === ci)) { exists = true; break; }
          if (!exists) { bestD = d; best = j; }
        }
      }
      if (best >= 0) bonds.push({ a: ci, b: best, rest: bestD, stiff: clamp(0.2 + (g.p2 + 1) * 0.5, 0.05, 1.8) });
      return;
    }
    case ACT.APOPTOSE: {
      let liveCount = 0;
      for (const c of cells) if (c.alive) liveCount++;
      if (liveCount > 1) cell.alive = false;
      return;
    }
    case ACT.TERMINATE:
      cell.terminal = true;
      return;
    case ACT.NEURITE: {
      cell.axon = Math.max(cell.axon, 0.8 + g.p0 * 4.5);
      cell.w0 = g.p1; cell.w1 = g.p2;
      return;
    }
  }
}

function diffuse(cells, bonds) {
  const n = cells.length;
  if (n < 2) { decay(cells); return; }
  const add = [];
  for (let i = 0; i < n; i++) add.push(new Float32Array(MORPHOGENS));
  for (const b of bonds) {
    const A = cells[b.a], B = cells[b.b];
    if (!A || !B || !A.alive || !B.alive) continue;
    for (let k = 0; k < MORPHOGENS; k++) {
      const flow = (A.m[k] - B.m[k]) * 0.16;
      add[b.a][k] -= flow;
      add[b.b][k] += flow;
    }
  }
  for (let i = 0; i < n; i++) {
    const c = cells[i];
    if (!c.alive) continue;
    for (let k = 0; k < MORPHOGENS; k++) c.m[k] = clamp((c.m[k] + add[i][k]) * 0.93, -2, 4);
  }
}

function decay(cells) {
  for (const c of cells) for (let k = 0; k < MORPHOGENS; k++) c.m[k] *= 0.93;
}

function connectStragglers(cells, bonds) {
  if (cells.length < 2) return;
  const deg = new Int32Array(cells.length);
  for (const b of bonds) { deg[b.a]++; deg[b.b]++; }
  for (let i = 0; i < cells.length; i++) {
    if (deg[i] > 0) continue;
    let best = -1, bestD = Infinity;
    for (let j = 0; j < cells.length; j++) {
      if (j === i) continue;
      const d = (cells[j].x - cells[i].x) ** 2 + (cells[j].y - cells[i].y) ** 2;
      if (d < bestD) { bestD = d; best = j; }
    }
    if (best >= 0) {
      bonds.push({ a: i, b: best, rest: Math.max(0.4, Math.sqrt(bestD)), stiff: 0.4, muscle: 0, phase: 0 });
      deg[i]++; deg[best]++;
    }
  }
}

/** Zbiera fizyczne i metaboliczne konsekwencje wyewoluowanej budowy. */
function finalize(genome, cells, bonds, build) {
  const P = genome.params;
  let mass = 0, area = 0, upkeep = 0, radius = 0;
  const cap = {
    litho: 0, digest: 0, absorb: 0, contract: 0, rigid: 0,
    sense: 0, neuro: 0, store: 0, armor: 0, repro: 0,
  };
  const keys = Object.keys(cap);

  for (const c of cells) {
    const a = Math.PI * c.r * c.r;
    area += a;
    mass += a * P.cellCost * (1 + c.t[4] * 0.8 + c.t[8] * 1.1);
    let u = 0.011;
    for (let i = 0; i < TRAIT_COUNT; i++) {
      u += c.t[i] * TRAIT_UPKEEP[i];
      cap[keys[i]] += c.t[i] * a;
    }
    upkeep += u * a;
    radius = Math.max(radius, Math.hypot(c.x, c.y) + c.r);
  }

  upkeep *= P.metabolism;
  upkeep += P.membrane * area * 0.004;

  const buildCost = mass * 5.5 + cells.length * 1.2;
  const storage = 20 + cap.store * 26 + area * 2.4;

  return {
    cells, bonds,
    buildEnergy: build.spent,       // ile energii kosztowało złożenie tego ciała
    truncated: build.truncated,     // rozwój przerwany brakiem energii rodzica
    cellCount: cells.length,
    bondCount: bonds.length,
    mass, area, radius: Math.max(0.6, radius),
    upkeep, buildCost, storage,
    cap,
    muscleCount: bonds.filter(b => b.muscle > 0.12).length,
    neuronCount: cells.filter(c => c.t[6] > 0.15).length,
    senseCount: cells.filter(c => c.t[5] > 0.1).length,
  };
}
