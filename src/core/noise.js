import { RNG } from './rng.js';
import { smoothstep, lerp } from './util.js';

// Gradientowy szum 2D z tablicą permutacji wywiedzioną z ziarna świata.
export class Noise2D {
  constructor(seed) {
    const rng = new RNG(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = rng.int(i + 1);
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    // 8 kierunków gradientu
    this.gx = new Float32Array(8);
    this.gy = new Float32Array(8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.gx[i] = Math.cos(a);
      this.gy[i] = Math.sin(a);
    }
  }

  grad(ix, iy, dx, dy) {
    const h = this.perm[(ix + this.perm[iy & 255]) & 255] & 7;
    return this.gx[h] * dx + this.gy[h] * dy;
  }

  // wynik w zakresie ~[-1, 1]
  at(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const u = smoothstep(fx), v = smoothstep(fy);
    const n00 = this.grad(x0, y0, fx, fy);
    const n10 = this.grad(x0 + 1, y0, fx - 1, fy);
    const n01 = this.grad(x0, y0 + 1, fx, fy - 1);
    const n11 = this.grad(x0 + 1, y0 + 1, fx - 1, fy - 1);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.4;
  }

  // Suma oktaw
  fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.at(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  // Szum grzbietowy — dobre pasma górskie i strefy uskoków
  ridged(x, y, octaves = 4) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.at(x * freq, y * freq));
      sum += amp * n * n;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}
