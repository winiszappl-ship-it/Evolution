// Deterministyczny generator liczb pseudolosowych.
// Cały świat wynika z jednego ziarna — ta sama wartość daje tę samą planetę.

export function hashSeed(str) {
  str = String(str);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // dodatkowe mieszanie
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export class RNG {
  constructor(seed = 1) {
    this.state = (typeof seed === 'number' ? seed >>> 0 : hashSeed(seed)) || 1;
  }

  // mulberry32
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(a = 0, b = 1) { return a + (b - a) * this.next(); }
  int(n) { return Math.floor(this.next() * n); }
  range(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }

  // rozkład normalny (Box-Muller, z cache)
  gauss(mean = 0, sd = 1) {
    if (this._spare !== undefined) {
      const v = this._spare; this._spare = undefined;
      return mean + sd * v;
    }
    let u = 0, v = 0, s = 0;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const mul = Math.sqrt(-2 * Math.log(s) / s);
    this._spare = v * mul;
    return mean + sd * (u * mul);
  }

  // niezależny strumień wywiedziony z bieżącego stanu
  fork() { return new RNG((this.state ^ Math.imul(this.int(0x7fffffff), 2654435761)) >>> 0); }

  serialize() { return this.state; }
  static deserialize(state) { const r = new RNG(1); r.state = state >>> 0; return r; }
}

// Globalny, nieokreślony strumień dla efektów wizualnych i mutacji "w locie".
export const chaos = new RNG((Date.now() ^ 0x9e3779b9) >>> 0);
