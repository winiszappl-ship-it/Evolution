import { Noise2D } from '../core/noise.js';
import { RNG, hashSeed } from '../core/rng.js';
import { clamp, smoothstep } from '../core/util.js';
import { BIOME } from './biomes.js';

export const MAP_SIZES = {
  small: { key: 'small', name: 'Mała', w: 128, h: 96 },
  medium: { key: 'medium', name: 'Średnia', w: 192, h: 144 },
  large: { key: 'large', name: 'Duża', w: 288, h: 208 },
  huge: { key: 'huge', name: 'Ogromna', w: 384, h: 288 },
};

export const DEFAULT_PARAMS = {
  seed: 'genesis',
  size: 'medium',
  temperature: 14,   // °C — średnia globalna
  humidity: 0.55,    // 0..1
  light: 1.0,        // mnożnik nasłonecznienia
  oxygen: 0.21,      // frakcja atmosfery
  gravity: 1.0,      // g
  radiation: 0.35,   // 0..1 — napędza tempo mutacji
  water: 0.55,       // frakcja powierzchni pokryta wodą
};

/**
 * Buduje siatkę kafli świata. Nie umieszcza tu żadnego życia — to wyłącznie
 * geologia, klimat i chemia. Życie pojawia się dopiero, gdy gracz je zasieje.
 */
export function generateTerrain(params) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const size = MAP_SIZES[p.size] || MAP_SIZES.medium;
  const W = size.w, H = size.h;
  const seedNum = hashSeed(p.seed);
  const rng = new RNG(seedNum);

  const nElev = new Noise2D(seedNum ^ 0x1111);
  const nRidge = new Noise2D(seedNum ^ 0x2222);
  const nMoist = new Noise2D(seedNum ^ 0x3333);
  const nTemp = new Noise2D(seedNum ^ 0x4444);
  const nCave = new Noise2D(seedNum ^ 0x5555);
  const nVolc = new Noise2D(seedNum ^ 0x6666);

  const n = W * H;
  const elevation = new Float32Array(n);
  const moisture = new Float32Array(n);
  const baseTemp = new Float32Array(n);
  const biome = new Uint8Array(n);
  const depth = new Float32Array(n);

  const scale = 5.5 / Math.sqrt(W * H / (192 * 144));

  // --- wysokość ---
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const nx = x / W * scale, ny = y / H * scale;
      let e = nElev.fbm(nx, ny, 6, 2.05, 0.52) * 0.5 + 0.5;
      const ridge = nRidge.ridged(nx * 1.3 + 11.7, ny * 1.3 - 4.2, 5);
      e = e * 0.72 + ridge * 0.42 * smoothstep(clamp((e - 0.42) / 0.4, 0, 1));

      // wyspiarska maska krawędzi — zapobiega lądowi przyklejonemu do brzegu mapy
      const dx = Math.abs(x / (W - 1) - 0.5) * 2;
      const dy = Math.abs(y / (H - 1) - 0.5) * 2;
      const edge = Math.max(dx, dy);
      e -= smoothstep(clamp((edge - 0.78) / 0.22, 0, 1)) * 0.35;

      elevation[i] = clamp(e, 0, 1.2);
    }
  }

  // --- poziom morza wynikający z zadanej ilości wody ---
  const sorted = Float32Array.from(elevation).sort();
  const seaLevel = sorted[clamp(Math.floor(p.water * n), 0, n - 1)];

  // --- wilgotność i temperatura ---
  for (let y = 0; y < H; y++) {
    const lat = Math.abs(y / (H - 1) - 0.5) * 2; // 0 = równik, 1 = biegun
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const nx = x / W * scale, ny = y / H * scale;
      const e = elevation[i];

      let m = nMoist.fbm(nx * 1.7 + 31.3, ny * 1.7 + 8.9, 4) * 0.5 + 0.5;
      m = clamp(m * 0.7 + p.humidity * 0.6, 0, 1);
      if (e < seaLevel) m = 1;
      moisture[i] = m;

      // gradient szerokości geograficznej + wysokość + szum + parametr globalny
      const latDrop = -34 * lat * lat;
      const altDrop = -30 * Math.max(0, e - seaLevel);
      const wob = nTemp.fbm(nx * 0.9 - 17.1, ny * 0.9 + 5.5, 3) * 5;
      baseTemp[i] = p.temperature + 16 + latDrop + altDrop + wob;
    }
  }

  // --- klasyfikacja biomów ---
  for (let i = 0; i < n; i++) {
    const e = elevation[i];
    const t = baseTemp[i];
    const m = moisture[i];

    if (e < seaLevel) {
      const d = (seaLevel - e) / Math.max(0.001, seaLevel);
      depth[i] = d;
      biome[i] = d > 0.32 ? BIOME.OCEAN : BIOME.COAST;
      continue;
    }
    depth[i] = 0;

    const rel = (e - seaLevel) / Math.max(0.001, 1 - seaLevel);

    if (rel > 0.62) { biome[i] = BIOME.MOUNTAIN; continue; }
    if (t < -6) { biome[i] = BIOME.TUNDRA; continue; }
    if (m < 0.3 && t > 12) { biome[i] = BIOME.DESERT; continue; }
    if (m > 0.74 && rel < 0.14) { biome[i] = BIOME.SWAMP; continue; }
    if (m > 0.5) { biome[i] = BIOME.FOREST; continue; }
    biome[i] = BIOME.PLAINS;
  }

  // --- jeziora: zagłębienia lądowe wypełnione wodą ---
  carveLakes(elevation, biome, depth, W, H, seaLevel);

  // --- rzeki: spływ z wysokich punktów do najniższego sąsiada ---
  carveRivers(elevation, biome, depth, moisture, W, H, seaLevel, rng);

  // --- wulkany: gorące, żyzne i ubogie w tlen podłoże w pasmach grzbietowych ---
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      if (biome[i] !== BIOME.MOUNTAIN) continue;
      const v = nVolc.at(x / W * scale * 3.1 + 77, y / H * scale * 3.1 - 41);
      if (v > 0.74 && rng.chance(0.35)) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const j = (y + dy) * W + (x + dx);
            if (Math.abs(dx) + Math.abs(dy) <= 1) biome[j] = BIOME.VOLCANO;
          }
        }
      }
    }
  }

  // --- jaskinie: kieszenie pod wyżynami ---
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const b = biome[i];
      if (b === BIOME.MOUNTAIN || b === BIOME.FOREST || b === BIOME.PLAINS) {
        const c = nCave.fbm(x / W * scale * 4.3 - 19, y / H * scale * 4.3 + 63, 3);
        if (c > 0.46) biome[i] = BIOME.CAVE;
      }
    }
  }

  return {
    W, H, seaLevel, params: p, seedNum,
    elevation, moisture, baseTemp, biome, depth,
  };
}

function carveLakes(elevation, biome, depth, W, H, seaLevel) {
  // Kafel lądowy niższy od wszystkich sąsiadów w promieniu 2 zbiera wodę.
  const visited = new Uint8Array(W * H);
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      if (elevation[i] <= seaLevel || visited[i]) continue;
      let isBasin = true;
      for (let dy = -2; dy <= 2 && isBasin; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (!dx && !dy) continue;
          if (elevation[(y + dy) * W + (x + dx)] < elevation[i] - 0.004) { isBasin = false; break; }
        }
      }
      if (!isBasin) continue;
      // zalej basen do progu przelewu
      const level = elevation[i] + 0.012;
      const stack = [i];
      const cells = [];
      const seen = new Set([i]);
      let overflow = false;
      while (stack.length && cells.length < 400) {
        const c = stack.pop();
        const cx = c % W, cy = (c / W) | 0;
        if (cx < 1 || cy < 1 || cx >= W - 1 || cy >= H - 1) { overflow = true; break; }
        cells.push(c);
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const j = (cy + oy) * W + (cx + ox);
          if (seen.has(j)) continue;
          seen.add(j);
          if (elevation[j] < level) stack.push(j);
        }
      }
      if (!overflow && cells.length >= 4) {
        for (const c of cells) {
          visited[c] = 1;
          biome[c] = BIOME.LAKE;
          depth[c] = clamp((level - elevation[c]) * 8, 0.05, 0.6);
        }
      }
    }
  }
}

function carveRivers(elevation, biome, depth, moisture, W, H, seaLevel, rng) {
  const count = Math.floor((W * H) / 900) + 4;
  for (let r = 0; r < count; r++) {
    // start w losowym wysokim, wilgotnym punkcie
    let best = -1, bestScore = -Infinity;
    for (let a = 0; a < 40; a++) {
      const x = rng.range(3, W - 4), y = rng.range(3, H - 4);
      const i = y * W + x;
      if (elevation[i] <= seaLevel + 0.08) continue;
      const s = elevation[i] + moisture[i] * 0.25 + rng.float(0, 0.05);
      if (s > bestScore) { bestScore = s; best = i; }
    }
    if (best < 0) continue;

    let cur = best;
    const path = [];
    for (let step = 0; step < 900; step++) {
      const cx = cur % W, cy = (cur / W) | 0;
      if (cx < 1 || cy < 1 || cx >= W - 1 || cy >= H - 1) break;
      path.push(cur);
      if (elevation[cur] <= seaLevel) break;
      let low = cur, lowE = elevation[cur];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const j = (cy + dy) * W + (cx + dx);
          if (elevation[j] < lowE) { lowE = elevation[j]; low = j; }
        }
      }
      if (low === cur) {
        // lokalne zagłębienie — drąż dalej lekko obniżając teren
        elevation[cur] -= 0.006;
        const j = (cy + rng.range(-1, 1)) * W + (cx + rng.range(-1, 1));
        if (j > 0 && j < W * H && j !== cur) low = j; else break;
      }
      cur = low;
    }

    if (path.length < 8) continue;
    for (const i of path) {
      if (elevation[i] <= seaLevel) break;
      if (biome[i] === BIOME.LAKE) continue;
      biome[i] = BIOME.RIVER;
      depth[i] = 0.12;
      moisture[i] = Math.min(1, moisture[i] + 0.3);
      // nawilż otoczenie — doliny rzeczne są żyźniejsze
      const cx = i % W, cy = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const j = (cy + dy) * W + (cx + dx);
          if (j < 0 || j >= W * H) continue;
          if (biome[j] === BIOME.DESERT || biome[j] === BIOME.PLAINS) {
            moisture[j] = Math.min(1, moisture[j] + 0.12);
            if (moisture[j] > 0.5) biome[j] = BIOME.FOREST;
          }
        }
      }
    }
  }
}
