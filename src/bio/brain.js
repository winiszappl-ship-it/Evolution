import { clamp, tanhApprox, TAU } from '../core/util.js';

/**
 * Układ nerwowy nie jest projektowany. Powstaje z tego, gdzie w ciele znalazły
 * się komórki o zdolności `neuro`, `sense` i `contract`, oraz jak daleko sięgają
 * ich wypustki. Wagi połączeń wynikają z parametrów genu, który daną komórkę
 * wyspecjalizował — mutacja tego genu zmienia zachowanie.
 *
 * Zachowania nie ma nigdzie w kodzie. Jest tylko przewodzenie sygnału.
 */

export const SENSE_MOD = ['światło', 'chemia', 'dotyk', 'temperatura', 'bliskość'];
const MAX_FANIN = 8;

function synWeight(a, b, w0, w1) {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  const rnd = s - Math.floor(s);          // deterministyczne 0..1
  return clamp(w0 * 2.2 + (rnd * 2 - 1) * (1 + Math.abs(w1) * 2.5), -4, 4);
}

export function buildBrain(body, params) {
  const cells = body.cells;
  const neurons = [];
  const sensors = [];
  const effectors = [];

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.t[6] > 0.15) {
      neurons.push({
        cell: i,
        bias: clamp(c.w0 * 1.5, -2, 2),
        tau: clamp(params.memory * (0.4 + c.t[6] * 0.6), 0, 0.97),
        oscAmp: clamp(c.m[3], 0, 1.6),
        oscFreq: params.oscFreq * (0.4 + Math.abs(c.m[4]) * 1.2),
        phase: ((c.m[2] % 1) + 1) % 1 * TAU,
        state: 0,
      });
    }
    if (c.t[5] > 0.1) {
      sensors.push({ cell: i, mod: c.senseMod, gain: params.senseGain * c.t[5], value: 0 });
    }
  }

  for (let i = 0; i < body.bonds.length; i++) {
    const b = body.bonds[i];
    if (b.muscle > 0.12) effectors.push({ bond: i, strength: b.muscle, act: 0 });
  }

  const reach = (i) => {
    const c = cells[i];
    return Math.max(1.6, c.axon > 0 ? c.axon : 1.6 + c.t[6] * 3.2);
  };
  const near = (i, j) => {
    const A = cells[i], B = cells[j];
    return Math.hypot(A.x - B.x, A.y - B.y);
  };

  // sensor → neuron
  const synS = [];
  for (let s = 0; s < sensors.length; s++) {
    const si = sensors[s].cell;
    const r = reach(si);
    const cand = [];
    for (let n = 0; n < neurons.length; n++) {
      const d = near(si, neurons[n].cell);
      if (d <= r) cand.push([d, n]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < Math.min(MAX_FANIN, cand.length); k++) {
      const n = cand[k][1];
      synS.push(s, n, synWeight(si + 1, neurons[n].cell + 31, cells[si].w0, cells[si].w1));
    }
  }

  // neuron → neuron
  const synN = [];
  for (let a = 0; a < neurons.length; a++) {
    const ai = neurons[a].cell;
    const r = reach(ai);
    const cand = [];
    for (let b = 0; b < neurons.length; b++) {
      if (a === b) continue;
      const d = near(ai, neurons[b].cell);
      if (d <= r) cand.push([d, b]);
    }
    cand.sort((x, y) => x[0] - y[0]);
    for (let k = 0; k < Math.min(MAX_FANIN, cand.length); k++) {
      const b = cand[k][1];
      synN.push(a, b, synWeight(ai + 7, neurons[b].cell + 3, cells[ai].w0, cells[ai].w1));
    }
    // sprzężenie zwrotne na siebie — źródło pamięci krótkotrwałej
    if (Math.abs(cells[ai].w1) > 0.55) synN.push(a, a, clamp(cells[ai].w1 * 1.4, -1.6, 1.6));
  }

  // neuron → mięsień (przez punkt środkowy wiązania)
  const synE = [];
  for (let e = 0; e < effectors.length; e++) {
    const bond = body.bonds[effectors[e].bond];
    const A = cells[bond.a], B = cells[bond.b];
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    const cand = [];
    for (let n = 0; n < neurons.length; n++) {
      const c = cells[neurons[n].cell];
      const d = Math.hypot(c.x - mx, c.y - my);
      if (d <= reach(neurons[n].cell)) cand.push([d, n]);
    }
    cand.sort((x, y) => x[0] - y[0]);
    for (let k = 0; k < Math.min(MAX_FANIN, cand.length); k++) {
      const n = cand[k][1];
      const c = cells[neurons[n].cell];
      synE.push(n, e, synWeight(neurons[n].cell + 13, effectors[e].bond + 17, c.w0, c.w1));
    }
  }

  // łuk odruchowy — organizmy bez neuronów mogą reagować bezpośrednio
  const reflex = [];
  if (neurons.length === 0) {
    for (let s = 0; s < sensors.length; s++) {
      const si = sensors[s].cell;
      for (let e = 0; e < effectors.length; e++) {
        const bond = body.bonds[effectors[e].bond];
        const A = cells[bond.a], B = cells[bond.b];
        const d = Math.hypot((A.x + B.x) / 2 - cells[si].x, (A.y + B.y) / 2 - cells[si].y);
        if (d <= reach(si)) reflex.push(s, e, synWeight(si + 5, effectors[e].bond + 23, cells[si].w0, cells[si].w1));
      }
    }
  }

  return {
    neurons, sensors, effectors,
    synS: Float64Array.from(synS), synN: Float64Array.from(synN),
    synE: Float64Array.from(synE), reflex: Float64Array.from(reflex),
    learnRate: params.learnRate,
    synCount: (synS.length + synN.length + synE.length + reflex.length) / 3,
  };
}

/**
 * Jeden krok przewodzenia. `senseValues` dostarcza świat — mózg nie wie,
 * skąd pochodzą liczby, ani co znaczą.
 */
export function stepBrain(brain, senseValues, t) {
  const { neurons, sensors, effectors, synS, synN, synE, reflex } = brain;
  const nN = neurons.length;

  for (let i = 0; i < sensors.length; i++) {
    sensors[i].value = tanhApprox(senseValues[i] * sensors[i].gain);
  }

  if (nN === 0) {
    for (let i = 0; i < effectors.length; i++) effectors[i].act = 0;
    for (let k = 0; k < reflex.length; k += 3) {
      effectors[reflex[k + 1]].act += sensors[reflex[k]].value * reflex[k + 2];
    }
    for (let i = 0; i < effectors.length; i++) effectors[i].act = tanhApprox(effectors[i].act);
    return;
  }

  const inp = new Float64Array(nN);
  for (let k = 0; k < synS.length; k += 3) inp[synS[k + 1]] += sensors[synS[k]].value * synS[k + 2];
  for (let k = 0; k < synN.length; k += 3) inp[synN[k + 1]] += neurons[synN[k]].state * synN[k + 2];

  for (let i = 0; i < nN; i++) {
    const n = neurons[i];
    const drive = inp[i] + n.bias + (n.oscAmp > 0.01 ? n.oscAmp * Math.sin(t * n.oscFreq + n.phase) : 0);
    n.state = n.state * n.tau + (1 - n.tau) * tanhApprox(drive);
  }

  for (let i = 0; i < effectors.length; i++) effectors[i].act = 0;
  for (let k = 0; k < synE.length; k += 3) {
    effectors[synE[k + 1]].act += neurons[synE[k]].state * synE[k + 2];
  }
  for (let i = 0; i < effectors.length; i++) effectors[i].act = tanhApprox(effectors[i].act);

  // Plastyczność hebbowska — tylko jeśli linia wyewoluowała zdolność uczenia.
  if (brain.learnRate > 0.001) {
    const lr = brain.learnRate * 0.02;
    for (let k = 0; k < synN.length; k += 3) {
      const pre = neurons[synN[k]].state, post = neurons[synN[k + 1]].state;
      synN[k + 2] = clamp(synN[k + 2] + lr * (pre * post - 0.12 * synN[k + 2]), -4, 4);
    }
    for (let k = 0; k < synS.length; k += 3) {
      const pre = sensors[synS[k]].value, post = neurons[synS[k + 1]].state;
      synS[k + 2] = clamp(synS[k + 2] + lr * (pre * post - 0.12 * synS[k + 2]), -4, 4);
    }
  }
}
