import { develop } from './develop.js';
import { buildBrain, stepBrain } from './brain.js';
import { Genome } from './genome.js';
import { clamp, TAU, tanhApprox } from '../core/util.js';
import { TILE } from '../world/world.js';

let ORG_SEQ = 1;
export function resetOrgSeq(v = 1) { ORG_SEQ = v; }

export const DETAIL = { POOL: 0, POINT: 1, FULL: 2 };

const PH_SUBSTEPS = 2;
const PH_DT = 0.34;
// ile powierzchni chwytającej światło mieści się na kaflu, zanim zacznie brakować
const LIGHT_BUDGET = 6;
// tempo pobierania zasobów na jednostkę zdolności tkanki
export const MINERAL_RATE = 0.135;
export const ABSORB_RATE = 0.055;
export const DIGEST_RATE = 0.16;

/**
 * Organizm. Silnik nie wie, czy to "roślina", "drapieżnik" czy "pasożyt" —
 * zna tylko komórki, ich zdolności fizyczne i bilans energii. Rola ekologiczna
 * jest opisem tego, co organizm faktycznie robi, a nie jego definicją.
 */
export class Organism {
  constructor(genome, x, y, energy, world) {
    this.id = ORG_SEQ++;
    this.genome = genome;
    this.body = develop(genome);
    this.brain = buildBrain(this.body, genome.params);
    // mięsień musi wiedzieć, który efektor go napędza
    for (const b of this.body.bonds) b.effIdx = -1;
    this.brain.effectors.forEach((e, i) => { this.body.bonds[e.bond].effIdx = i; });

    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.z = 0;              // wysokość nad podłożem — lot wymaga jej utrzymania
    this.vz = 0;
    this.heading = 0;
    this.energy = energy ?? this.body.buildCost * 0.9;
    this.age = 0;
    this.alive = true;
    this.integrity = 1;
    this.detail = DETAIL.POINT;
    this.speciesId = 0;
    this.parentId = 0;
    this.offspring = 0;
    this.generation = genome.generation;

    // pomiar własnego ruchu — używany, gdy organizm nie jest liczony w pełni
    this.measuredSpeed = 0;
    this.turnRate = 0.02;
    this._mx = x; this._my = y; this._mt = 0;

    // rejestr tego, jak organizm faktycznie zdobywa energię
    this.gain = { photo: 0, absorb: 0, detritus: 0, predation: 0 };
    this.lastGainTotal = 0;
    this.contact = 0;
    this.attacked = 0;
    this.neighborDensity = 0;
    this.moveCost = 0;
    this.deathCause = null;

    // przewaga w wyścigu o światło rośnie z zasięgiem ciała, ale nasyca się
    this.lightEdge = 1 + Math.min(4, this.body.radius * 0.75);
    // pola, nie gettery — czytane w najgorętszej pętli symulacji
    this.radius = this.body.radius;
    this.mass = this.body.mass;
    this.particles = null;
    this.tileIndex = world ? world.tileOf(x, y) : 0;
    this.brainTime = Math.random() * 100;
  }

  get maxEnergy() { return this.body.storage + this.body.buildCost * 0.6; }
  get flying() { return this.z > 0.35; }

  /** Przejście do pełnej fizyki — rozstawienie komórek w świecie. */
  promote() {
    if (this.particles) { this.detail = DETAIL.FULL; return; }
    const n = this.body.cellCount;
    const p = {
      px: new Float64Array(n), py: new Float64Array(n),
      vx: new Float64Array(n), vy: new Float64Array(n),
      fx: new Float64Array(n), fy: new Float64Array(n),
      m: new Float64Array(n), ax: new Float64Array(n), ay: new Float64Array(n),
      touch: new Float64Array(n), hp: new Float64Array(n),
    };
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    for (let i = 0; i < n; i++) {
      const cell = this.body.cells[i];
      p.px[i] = this.x + cell.x * c - cell.y * s;
      p.py[i] = this.y + cell.x * s + cell.y * c;
      p.vx[i] = this.vx; p.vy[i] = this.vy;
      p.m[i] = Math.max(0.05, Math.PI * cell.r * cell.r * this.genome.params.cellCost * (1 + cell.t[4] * 0.8));
      p.hp[i] = 1;
    }
    this.particles = p;
    this.updateCellAxes();
    this.detail = DETAIL.FULL;
  }

  demote() {
    this.detail = DETAIL.POINT;
    // pozycja i prędkość zostają — porzucamy tylko układ komórek
    this.particles = null;
  }

  updateCellAxes() {
    const p = this.particles;
    if (!p) return;
    const n = this.body.cellCount;
    p.ax.fill(0); p.ay.fill(0);
    for (const b of this.body.bonds) {
      const dx = p.px[b.b] - p.px[b.a], dy = p.py[b.b] - p.py[b.a];
      const d = Math.hypot(dx, dy) || 1;
      p.ax[b.a] += dx / d; p.ay[b.a] += dy / d;
      p.ax[b.b] -= dx / d; p.ay[b.b] -= dy / d;
    }
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(p.ax[i], p.ay[i]);
      if (d > 1e-5) { p.ax[i] /= d; p.ay[i] /= d; }
      else { p.ax[i] = 1; p.ay[i] = 0; }
    }
  }

  /**
   * Pełna fizyka: sprężyny między komórkami, mięśnie zmieniające długość
   * spoczynkową, anizotropowy opór ośrodka i tarcie o podłoże.
   * Żaden ruch nie jest animowany — wszystko wynika z sił.
   */
  stepPhysics(world, climate, dt) {
    const p = this.particles;
    if (!p) return;
    const n = this.body.cellCount;
    const bonds = this.body.bonds;
    const eff = this.brain.effectors;

    const ti = world.tileOf(this.x, this.y);
    const bd = world.biomeDefAt(ti);
    const inWater = bd.water && !this.flying;
    const g = world.params.gravity;

    const mediumDrag = this.flying ? 0.02 : (inWater ? 0.34 : 0.09);
    const traction = this.flying ? 0 : (inWater ? bd.traction * 0.35 : bd.traction);
    const cur = inWater ? climate.currentAt(this.x, this.y) : { x: climate.windX * 0.5, y: climate.windY * 0.5 };
    const flow = this.flying ? { x: climate.windX * 1.8, y: climate.windY * 1.8 } : cur;

    const sub = PH_SUBSTEPS;
    const h = (PH_DT * dt) / sub;
    let lift = 0;
    let workDone = 0;

    for (let s = 0; s < sub; s++) {
      p.fx.fill(0); p.fy.fill(0);

      // sprężyny i mięśnie
      for (let bi = 0; bi < bonds.length; bi++) {
        const b = bonds[bi];
        let rest = b.rest;
        if (b.muscle > 0.12) {
          const e = eff[b.effIdx];
          if (e) {
            const a = e.act;
            rest = b.rest * (1 + a * b.muscle * 0.42);
            workDone += Math.abs(a) * b.muscle;
            lift += Math.abs(a) * b.muscle * b.rest;
          }
        }
        const dx = p.px[b.b] - p.px[b.a], dy = p.py[b.b] - p.py[b.a];
        const d = Math.hypot(dx, dy) || 1e-6;
        const ext = d - rest;
        const k = b.stiff * 2.4;
        const fx = (dx / d) * ext * k, fy = (dy / d) * ext * k;
        p.fx[b.a] += fx; p.fy[b.a] += fy;
        p.fx[b.b] -= fx; p.fy[b.b] -= fy;

        // tłumienie wzdłuż wiązania — tkanka nie jest idealnie sprężysta
        const rvx = p.vx[b.b] - p.vx[b.a], rvy = p.vy[b.b] - p.vy[b.a];
        const rel = (rvx * dx + rvy * dy) / d;
        const dampF = rel * 0.28 * b.stiff;
        p.fx[b.a] += (dx / d) * dampF; p.fy[b.a] += (dy / d) * dampF;
        p.fx[b.b] -= (dx / d) * dampF; p.fy[b.b] -= (dy / d) * dampF;
      }

      // opór ośrodka i tarcie
      for (let i = 0; i < n; i++) {
        const cell = this.body.cells[i];
        const rvx = p.vx[i] - flow.x, rvy = p.vy[i] - flow.y;
        const sp = Math.hypot(rvx, rvy);
        if (sp > 1e-6) {
          // rozkład prędkości na składową wzdłuż i w poprzek osi komórki
          const par = rvx * p.ax[i] + rvy * p.ay[i];
          const perx = rvx - par * p.ax[i], pery = rvy - par * p.ay[i];
          const area = cell.r * 2;
          const cPar = mediumDrag * area * 0.45;
          const cPerp = mediumDrag * area * 1.85;   // anizotropia — źródło napędu
          p.fx[i] -= (cPar * par * p.ax[i] + cPerp * perx) * (0.6 + sp);
          p.fy[i] -= (cPar * par * p.ay[i] + cPerp * pery) * (0.6 + sp);
        }

        if (traction > 0) {
          // tarcie Coulomba — nieliniowe, więc ruch cykliczny daje przemieszczenie
          const N = p.m[i] * g * 0.5;
          const mu = traction * (0.35 + cell.t[4] * 0.7 + cell.t[8] * 0.3);
          const fmax = mu * N;
          const vs = Math.hypot(p.vx[i], p.vy[i]);
          if (vs > 1e-6) {
            const f = Math.min(fmax, p.m[i] * vs / Math.max(1e-6, h));
            p.fx[i] -= (p.vx[i] / vs) * f;
            p.fy[i] -= (p.vy[i] / vs) * f;
          }
        }
      }

      // całkowanie
      for (let i = 0; i < n; i++) {
        const im = 1 / p.m[i];
        p.vx[i] += p.fx[i] * im * h;
        p.vy[i] += p.fy[i] * im * h;
        const vmax = 9;
        const sp = Math.hypot(p.vx[i], p.vy[i]);
        if (sp > vmax) { p.vx[i] *= vmax / sp; p.vy[i] *= vmax / sp; }
        p.px[i] += p.vx[i] * h;
        p.py[i] += p.vy[i] * h;
      }
    }

    this.updateCellAxes();

    // środek masy i prędkość wypadkowa
    let cx = 0, cy = 0, cvx = 0, cvy = 0, mt = 0;
    for (let i = 0; i < n; i++) {
      const m = p.m[i];
      cx += p.px[i] * m; cy += p.py[i] * m;
      cvx += p.vx[i] * m; cvy += p.vy[i] * m;
      mt += m;
    }
    const prevX = this.x, prevY = this.y;
    this.x = cx / mt; this.y = cy / mt;
    this.vx = cvx / mt; this.vy = cvy / mt;
    if (Math.hypot(this.vx, this.vy) > 0.02) this.heading = Math.atan2(this.vy, this.vx);

    // Siła nośna: szybkie machanie dużymi powierzchniami. Lot nie jest cechą,
    // tylko konsekwencją tego, ile pracy mięśnie wkładają w ruch pionowy.
    const airDensity = this.flying ? 1 : (inWater ? 0 : 1);
    const liftForce = lift * 0.11 * airDensity * (1 - (inWater ? 1 : 0));
    const weight = this.body.mass * g * 0.09;
    this.vz += (liftForce - weight) * 0.05 * dt;
    this.vz *= 0.86;
    this.z = Math.max(0, this.z + this.vz * dt);
    if (this.z === 0 && this.vz < 0) this.vz = 0;

    this.moveCost = workDone * 0.0032 * this.genome.params.metabolism * dt;

    // pomiar rzeczywistej prędkości — potrzebny, gdy fizyka zostanie wyłączona
    this._mt += dt;
    if (this._mt > 12) {
      const d = Math.hypot(this.x - this._mx, this.y - this._my);
      this.measuredSpeed = this.measuredSpeed * 0.6 + (d / this._mt) * 0.4;
      this._mx = this.x; this._my = this.y; this._mt = 0;
    }
    if (!isFinite(this.x) || !isFinite(this.y)) { this.x = prevX; this.y = prevY; this.alive = false; }
  }

  /** Sygnały wejściowe zbierane z otoczenia w miejscu każdego receptora. */
  gatherSenses(world, climate, out) {
    const sensors = this.brain.sensors;
    const p = this.particles;
    for (let i = 0; i < sensors.length; i++) {
      const s = sensors[i];
      const cell = this.body.cells[s.cell];
      let wx, wy;
      if (p) { wx = p.px[s.cell]; wy = p.py[s.cell]; }
      else {
        const c = Math.cos(this.heading), sn = Math.sin(this.heading);
        wx = this.x + cell.x * c - cell.y * sn;
        wy = this.y + cell.x * sn + cell.y * c;
      }
      const ti = world.tileOf(wx, wy);
      switch (s.mod) {
        case 0: out[i] = world.lightAt(ti, climate) - 0.35; break;
        case 1: out[i] = (world.detritus[ti] * 0.05 + world.nutrient[ti] * 0.01) - 0.5; break;
        case 2: out[i] = (p ? p.touch[s.cell] : this.contact) * 2 - 0.2; break;
        case 3: out[i] = (world.tempAt(ti, climate) - 18) * 0.06; break;
        case 4: out[i] = this.neighborDensity - 0.3; break;
        default: out[i] = 0;
      }
    }
  }

  stepBrainOnce(world, climate, dt) {
    const nS = this.brain.sensors.length;
    if (!this._senseBuf || this._senseBuf.length < nS) this._senseBuf = new Float64Array(Math.max(1, nS));
    this.gatherSenses(world, climate, this._senseBuf);
    this.brainTime += dt;
    stepBrain(this.brain, this._senseBuf, this.brainTime);
  }

  /**
   * Bilans energii. Świat oferuje światło, minerały i martwą materię;
   * co organizm z tego weźmie, zależy wyłącznie od jego komórek.
   */
  metabolize(world, climate, dt) {
    const ti = world.tileOf(this.x, this.y);
    this.tileIndex = ti;
    const cap = this.body.cap;
    const P = this.genome.params;
    const temp = world.tempAt(ti, climate);
    const oxy = world.oxygenAt(ti);
    const inWater = world.isWaterAt(ti);

    // wydajność enzymatyczna zależy od temperatury — krzywa o optimum
    const optT = 18 + (P.hue - 180) * 0.02;      // niewielka zmienność między liniami
    const tempEff = Math.exp(-((temp - optT) ** 2) / 900);
    const oxyEff = clamp(0.25 + oxy * 3.2, 0.1, 1.3);

    let gained = 0;

    // fotosynteza
    // Fotosynteza: światło jest darmowe, ale minerały w podłożu — nie.
    // O światło trzeba się bić z sąsiadami, o minerały ze wszystkimi.
    if (cap.photo > 0.01) {
      const light = world.lightAt(ti, climate);
      const need = cap.photo * MINERAL_RATE * dt;
      // gdy minerałów brakuje, brakuje ich wszystkim po równo
      const load = world.mineralLoad[ti] * dt;
      const supply = world.nutrient[ti];
      const fair = load > supply ? supply / load : 1;
      const minerals = world.takeNutrient(ti, need * fair);
      // o światło toczy się osobna walka — tę wygrywa większe ciało
      const own = cap.photo * this.lightEdge;
      const others = Math.max(0, world.photoLoad[ti] - own);
      const share = Math.min(1, this.lightEdge * LIGHT_BUDGET / (LIGHT_BUDGET + others));
      const g = cap.photo * light * 1.15 * tempEff * dt * share * (minerals / Math.max(1e-6, need));
      gained += g; this.gain.photo += g;
      world.addOxygen(ti, g * 0.0016);
    }

    // Materia organiczna: jedna pula, dwa różne sposoby jej wykorzystania.
    if (cap.absorb > 0.01 || cap.digest > 0.01) {
      const dLoad = world.detritusLoad[ti] * dt;
      const dSupply = world.detritus[ti];
      const dFair = dLoad > dSupply ? dSupply / dLoad : 1;

      // Wchłanianie rozpuszczonej materii: powolne, ale wydajne, zwłaszcza w wodzie.
      if (cap.absorb > 0.01) {
        const got = world.takeDetritus(ti, cap.absorb * ABSORB_RATE * dt * dFair);
        const g = got * 1.15 * tempEff * (inWater ? 1.4 : 0.55);
        gained += g; this.gain.absorb += g;
      }
      // Rozkład materii stałej: szybszy, mniej wydajny — ta sama maszyneria,
      // która pozwala nadtrawić cudzą tkankę przy kontakcie.
      if (cap.digest > 0.01) {
        const got = world.takeDetritus(ti, cap.digest * DIGEST_RATE * dt * dFair);
        const g = got * 0.62 * tempEff;
        gained += g; this.gain.detritus += g;
      }
    }

    // koszty
    let cost = this.body.upkeep * dt * (0.6 + tempEff * 0.2 + Math.abs(temp - optT) * 0.012);
    cost += (this.moveCost || 0);
    cost /= oxyEff;
    if (this.flying) cost += this.body.mass * 0.004 * dt * world.params.gravity;
    world.useOxygen(ti, cost * 0.0009);

    // uszkodzenia od skrajnych warunków — błona chroni, ale kosztuje
    const shield = 0.4 + P.membrane * 1.2 + cap.armor * 0.02;
    const stress = Math.max(0, Math.abs(temp - optT) - 26 - shield * 8) * 0.0016
      + world.burn[ti] * 0.05
      + Math.max(0, 0.02 - oxy) * 0.6;
    if (stress > 0) this.integrity -= stress * dt;

    this.energy += gained - cost;
    this.lastGainTotal = gained;
    this.age += dt;
    this.moveCost = 0;

    if (this.energy > this.maxEnergy) this.energy = this.maxEnergy;

    if (this.energy <= 0 || this.integrity <= 0 || this.age > P.lifespan) {
      this.alive = false;
      this.deathCause = this.energy <= 0 ? 'głód' : (this.integrity <= 0 ? 'uszkodzenia' : 'starość');
    }
  }

  canReproduce() {
    return this.alive && this.energy > this.body.buildCost * this.genome.params.reproThr
      && this.age > this.body.cellCount * 2;
  }

  /** Podział. Potomek dostaje zmutowaną kopię DNA i część energii rodzica. */
  reproduce(world, rng, radiation, partner = null) {
    const P = this.genome.params;
    const rad = radiation * (1 + world.params.radiation);
    const childGenome = (partner && P.sexual > 0.35 && rng.chance(P.sexual))
      ? Genome.recombine(this.genome, partner.genome, rng).mutate(rng, rad)
      : this.genome.mutate(rng, rad);

    const invest = clamp(P.invest, 0.05, 0.9);
    const give = this.energy * invest;
    const ang = rng.float(0, TAU);
    const d = (this.radius + 1.5) * (1 + P.disperse * rng.float(0.2, 1.4));
    const cx = clamp(this.x + Math.cos(ang) * d, 1, world.widthUnits - 2);
    const cy = clamp(this.y + Math.sin(ang) * d, 1, world.heightUnits - 2);

    // część energii przepada przy budowie nowego ciała — nic nie jest za darmo
    const child = new Organism(childGenome, cx, cy, give * 0.85, world);
    child.parentId = this.id;
    child.speciesId = this.speciesId;
    child.heading = rng.float(0, TAU);

    this.energy -= give;
    this.offspring++;
    return child;
  }

  diet() {
    const g = this.gain;
    const t = g.photo + g.absorb + g.detritus + g.predation;
    if (t < 1e-6) return { key: 'none', label: 'brak', frac: {} };
    const frac = {
      photo: g.photo / t, absorb: g.absorb / t,
      detritus: g.detritus / t, predation: g.predation / t,
    };
    let key = 'photo', best = -1;
    for (const k of Object.keys(frac)) if (frac[k] > best) { best = frac[k]; key = k; }
    const labels = {
      photo: 'fotosynteza', absorb: 'osmotrofia',
      detritus: 'rozkład materii', predation: 'materia żywa',
    };
    return { key, label: labels[key], frac, mixed: best < 0.6 };
  }

  serialize() {
    return {
      id: this.id, g: this.genome.serialize(), x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10, e: Math.round(this.energy * 10) / 10,
      a: Math.round(this.age), sp: this.speciesId, pid: this.parentId,
      off: this.offspring, h: Math.round(this.heading * 100) / 100,
      it: Math.round(this.integrity * 100) / 100,
      gn: [this.gain.photo, this.gain.absorb, this.gain.detritus, this.gain.predation]
        .map(v => Math.round(v * 10) / 10),
      ms: Math.round(this.measuredSpeed * 1000) / 1000,
    };
  }
}
