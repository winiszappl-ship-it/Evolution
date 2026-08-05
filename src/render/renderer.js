import { BIOME_DEF } from '../world/biomes.js';
import { TILE, SECTOR_TILES } from '../world/world.js';
import { clamp, hsl, TAU } from '../core/util.js';
import { TRAITS } from '../bio/genome.js';

// Barwa akcentu dla każdej zdolności komórki — wyłącznie dla czytelności.
const TRAIT_HUE = [110, 18, 185, 320, 40, 55, 275, 35, 210, 340];
// Powyżej tylu okruchów naraz rysujemy punkty zamiast obrazków — inaczej
// przy oddaleniu klatka rozsypuje się na tysiącach wywołań drawImage.
const MAX_FOOD_SPRITES = 900;

export const OVERLAYS = [
  { key: 'none', name: 'Bez nakładki' },
  { key: 'temp', name: 'Temperatura' },
  { key: 'light', name: 'Światło' },
  { key: 'nutrient', name: 'Minerały' },
  { key: 'detritus', name: 'Materia rozpuszczona' },
  { key: 'food', name: 'Pokarm stały' },
  { key: 'oxygen', name: 'Tlen' },
  { key: 'sectors', name: 'Sektory i szczegółowość' },
  { key: 'species', name: 'Zasięgi gatunków' },
];

export class Renderer {
  constructor(canvas, sim, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.sim = sim;
    this.camera = camera;
    this.overlay = 'none';
    this.showUI = true;
    this.selected = null;
    this.time = 0;
    // Dwa obrazki, bo okruch pochodzi albo od kogoś, kto żył ze światła,
    // albo z ciała. Rodzaj to opis pochodzenia, nie osobny byt w świecie.
    this.foodSprites = [new Image(), new Image()];
    this.foodSpriteReady = 0;
    for (const img of this.foodSprites) img.onload = () => { this.foodSpriteReady++; };
    this.foodSprites[0].src = 'assets/roslina.png';
    this.foodSprites[1].src = 'assets/szczatki.png';
    this.buildTerrain();
  }

  setSim(sim, camera) {
    this.sim = sim;
    this.camera = camera;
    this.selected = null;
    this.buildTerrain();
  }

  buildTerrain() {
    const w = this.sim.world;
    const c = document.createElement('canvas');
    c.width = w.W; c.height = w.H;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w.W, w.H);
    const d = img.data;
    for (let i = 0; i < w.W * w.H; i++) {
      const b = BIOME_DEF[w.biome[i]];
      // cieniowanie wysokością — daje wrażenie rzeźby terenu
      const shade = b.water
        ? 1 - w.depth[i] * 0.55
        : 0.72 + (w.elevation[i] - w.seaLevel) * 0.9;
      const [h, s, l] = b.color;
      const rgb = hslToRgb(h / 360, s, clamp(l * shade, 0.03, 0.92));
      d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2]; d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.terrainCanvas = c;

    const o = document.createElement('canvas');
    o.width = w.W; o.height = w.H;
    this.overlayCanvas = o;
    this.overlayDirty = true;
    this.lastOverlayTick = -1e9;
  }

  draw(dtReal) {
    const ctx = this.ctx, cam = this.camera, sim = this.sim;
    const W = this.canvas.width, H = this.canvas.height;
    this.time += dtReal;

    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, W, H);

    const b = cam.viewBounds();
    const sx = (b.x0 / TILE), sy = (b.y0 / TILE);
    const sw = (b.x1 - b.x0) / TILE, sh = (b.y1 - b.y0) / TILE;

    ctx.imageSmoothingEnabled = cam.zoom > 2.5;
    ctx.drawImage(this.terrainCanvas, sx, sy, sw, sh, 0, 0, W, H);

    this.drawOverlay(ctx, sx, sy, sw, sh, W, H);
    this.drawFires(ctx);
    this.drawFood(ctx);
    this.drawOrganisms(ctx);
    this.drawWeather(ctx, W, H);
    this.drawDayNight(ctx, W, H);
    if (this.selected && this.selected.alive) this.drawSelection(ctx, this.selected);
    if (this.showUI) this.drawScaleHint(ctx, W, H);
  }

  drawOverlay(ctx, sx, sy, sw, sh, W, H) {
    if (this.overlay === 'none') return;
    const sim = this.sim, w = sim.world;
    if (sim.tick - this.lastOverlayTick > 24 || this.overlayDirty) {
      this.lastOverlayTick = sim.tick;
      this.overlayDirty = false;
      // Sektory bez życia śpią, więc ich chemia jest przestarzała. Skoro gracz
      // chce ją zobaczyć, trzeba ją najpierw nadgonić.
      if (this.overlay === 'nutrient' || this.overlay === 'detritus' || this.overlay === 'oxygen') {
        w.refreshAll(sim.tick, sim.climate);
      }
      if (this.overlay === 'food') this.buildFoodDensity();
      const octx = this.overlayCanvas.getContext('2d');
      const img = octx.createImageData(w.W, w.H);
      const d = img.data;
      const n = w.W * w.H;
      for (let i = 0; i < n; i++) {
        let r = 0, g = 0, bl = 0, a = 150;
        switch (this.overlay) {
          case 'temp': {
            const t = clamp((w.tempAt(i, sim.climate) + 20) / 70, 0, 1);
            [r, g, bl] = hslToRgb((1 - t) * 0.66, 0.85, 0.5);
            break;
          }
          case 'light': {
            const l = clamp(w.lightAt(i, sim.climate), 0, 1.5) / 1.5;
            [r, g, bl] = hslToRgb(0.14, 0.9, clamp(l, 0.02, 0.85));
            break;
          }
          case 'nutrient': {
            const v = clamp(w.nutrient[i] / 120, 0, 1);
            [r, g, bl] = hslToRgb(0.55, 0.8, clamp(v, 0.02, 0.8));
            break;
          }
          case 'detritus': {
            const v = clamp(w.detritus[i] / 60, 0, 1);
            [r, g, bl] = hslToRgb(0.08, 0.6, clamp(v, 0.02, 0.7));
            break;
          }
          case 'food': {
            const v = clamp(this._foodDensity[i] / 40, 0, 1);
            [r, g, bl] = hslToRgb(0.09, 0.75, clamp(v, 0.02, 0.75));
            break;
          }
          case 'oxygen': {
            const v = clamp(w.oxygen[i] / 0.45, 0, 1);
            [r, g, bl] = hslToRgb(0.5, 0.9, clamp(v, 0.02, 0.85));
            break;
          }
          case 'sectors': {
            const s = w.sectorAtTile(i % w.W, (i / w.W) | 0);
            const c = [[40, 40, 55], [70, 130, 90], [220, 190, 90]][s.detail];
            r = c[0]; g = c[1]; bl = c[2]; a = 110;
            break;
          }
          default: a = 0;
        }
        d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = bl; d[i * 4 + 3] = a;
      }
      octx.putImageData(img, 0, 0);
    }
    ctx.globalAlpha = 0.72;
    ctx.drawImage(this.overlayCanvas, sx, sy, sw, sh, 0, 0, W, H);
    ctx.globalAlpha = 1;

    if (this.overlay === 'sectors') this.drawSectorGrid(ctx);
    if (this.overlay === 'species') this.drawSpeciesRanges(ctx);
  }

  /** Zbiera okruchy w gęstość na kafel — inaczej przy oddaleniu byłyby niewidoczne. */
  buildFoodDensity() {
    const w = this.sim.world;
    if (!this._foodDensity || this._foodDensity.length !== w.W * w.H) {
      this._foodDensity = new Float32Array(w.W * w.H);
    }
    this._foodDensity.fill(0);
    const f = w.food;
    for (let i = 0; i < f.used.length; i++) {
      if (!f.used[i]) continue;
      this._foodDensity[w.tileOf(f.px[i], f.py[i])] += f.e[i];
    }
  }

  /** Okruchy pokarmu — to, po co w ogóle warto się ruszyć. */
  drawFood(ctx) {
    const cam = this.camera;
    const food = this.sim.world.food;
    if (cam.zoom < 0.55 || !food.count) return;
    const b = cam.viewBounds();
    const z = cam.zoom;

    if (!this._foodBuf) this._foodBuf = [];
    const buf = this._foodBuf;
    buf.length = 0;
    food.forEachInBounds(b, (x, y, e, kind) => {
      if (buf.length < 24000) buf.push(x, y, e, kind);
    });
    const n = buf.length / 4;
    if (!n) return;

    // Z bliska okruch wygląda jak to, czym jest; z daleka wystarczy punkt.
    if (this.foodSpriteReady === 2 && z > 1.4 && n <= MAX_FOOD_SPRITES) {
      for (let i = 0; i < buf.length; i += 4) {
        const p = cam.worldToScreen(buf[i], buf[i + 1]);
        const s = clamp((1.1 + Math.sqrt(buf[i + 2]) * 0.55) * z * 0.5, 5, 28);
        ctx.drawImage(this.foodSprites[buf[i + 3]], p.x - s / 2, p.y - s / 2, s, s);
      }
      return;
    }

    for (let kind = 0; kind < 2; kind++) {
      ctx.fillStyle = kind === 0 ? 'rgba(224,72,58,0.85)' : 'rgba(150,44,36,0.9)';
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < buf.length; i += 4) {
        if (buf[i + 3] !== kind) continue;
        any = true;
        const p = cam.worldToScreen(buf[i], buf[i + 1]);
        const r = Math.max(0.8, Math.min(3.5, 0.35 + Math.sqrt(buf[i + 2]) * 0.22) * z * 0.45);
        ctx.moveTo(p.x + r, p.y);
        ctx.arc(p.x, p.y, r, 0, TAU);
      }
      if (any) ctx.fill();
    }
  }

  drawSectorGrid(ctx) {
    const cam = this.camera, w = this.sim.world;
    if (cam.zoom < 0.25) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = TILE * SECTOR_TILES;
    const b = cam.viewBounds();
    for (let x = Math.floor(b.x0 / step) * step; x < b.x1; x += step) {
      const p = cam.worldToScreen(x, 0);
      ctx.moveTo(p.x, 0); ctx.lineTo(p.x, this.canvas.height);
    }
    for (let y = Math.floor(b.y0 / step) * step; y < b.y1; y += step) {
      const p = cam.worldToScreen(0, y);
      ctx.moveTo(0, p.y); ctx.lineTo(this.canvas.width, p.y);
    }
    ctx.stroke();
  }

  drawSpeciesRanges(ctx) {
    const cam = this.camera;
    for (const s of this.sim.species.aliveSpecies().slice(0, 30)) {
      const p = cam.worldToScreen(s.cx, s.cy);
      const r = Math.max(8, Math.sqrt(s.count) * 4 * Math.min(1, cam.zoom));
      ctx.fillStyle = hsl(s.hue, 0.75, 0.55, 0.14);
      ctx.strokeStyle = hsl(s.hue, 0.8, 0.65, 0.6);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill(); ctx.stroke();
      if (cam.zoom > 0.4) {
        ctx.fillStyle = hsl(s.hue, 0.6, 0.9, 0.9);
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillText(`${s.name} (${s.count})`, p.x + r + 4, p.y);
      }
    }
  }

  drawFires(ctx) {
    const w = this.sim.world, cam = this.camera;
    if (!this.sim.disasters.fireTiles.size) return;
    const b = cam.viewBounds();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const i of this.sim.disasters.fireTiles) {
      const tx = (i % w.W) * TILE, ty = ((i / w.W) | 0) * TILE;
      if (tx < b.x0 - TILE || tx > b.x1 || ty < b.y0 - TILE || ty > b.y1) continue;
      const p = cam.worldToScreen(tx + TILE / 2, ty + TILE / 2);
      const s = TILE * cam.zoom;
      const flick = 0.6 + Math.sin(this.time * 9 + i) * 0.25;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 1.1);
      g.addColorStop(0, `rgba(255,190,90,${0.7 * flick})`);
      g.addColorStop(0.5, `rgba(255,90,20,${0.35 * flick})`);
      g.addColorStop(1, 'rgba(120,20,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - s * 1.1, p.y - s * 1.1, s * 2.2, s * 2.2);
    }
    ctx.restore();
  }

  drawOrganisms(ctx) {
    const cam = this.camera, sim = this.sim;
    const b = cam.viewBounds();
    const margin = 40 / cam.zoom;
    const level = cam.level;

    for (const o of sim.organisms) {
      if (!o.alive) continue;
      if (o.x < b.x0 - margin || o.x > b.x1 + margin || o.y < b.y0 - margin || o.y > b.y1 + margin) continue;
      const p = cam.worldToScreen(o.x, o.y);
      const rpx = o.radius * cam.zoom;
      const hue = o.genome.params.hue;

      if (o.z > 0.2) {
        // cień pod organizmem w locie — jedyna wskazówka trzeciego wymiaru
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.arc(p.x + o.z * 3 * cam.zoom * 0.1, p.y + o.z * 4 * cam.zoom * 0.1,
          Math.max(1, rpx * 0.8), 0, TAU);
        ctx.fill();
      }

      if (rpx < 2.2 || level <= 1) {
        ctx.fillStyle = hsl(hue, 0.7, clamp(0.4 + o.energy / (o.maxEnergy + 1) * 0.35, 0.25, 0.8));
        const s = Math.max(1.1, rpx);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
        continue;
      }

      this.drawBody(ctx, o, p, cam.zoom, level);
    }
  }

  drawBody(ctx, o, p, zoom, level) {
    const cells = o.body.cells;
    const bonds = o.body.bonds;
    const part = o.particles;
    const hue = o.genome.params.hue;
    const cos = Math.cos(o.heading), sin = Math.sin(o.heading);
    const px = new Float64Array(cells.length), py = new Float64Array(cells.length);

    for (let i = 0; i < cells.length; i++) {
      if (part) {
        px[i] = (part.px[i] - o.x) * zoom + p.x;
        py[i] = (part.py[i] - o.y) * zoom + p.y;
      } else {
        px[i] = (cells[i].x * cos - cells[i].y * sin) * zoom + p.x;
        py[i] = (cells[i].x * sin + cells[i].y * cos) * zoom + p.y;
      }
    }

    // wiązania — mięśnie zmieniają barwę wraz z aktywnością
    if (level >= 3 && zoom > 6) {
      for (let i = 0; i < bonds.length; i++) {
        const bd = bonds[i];
        const e = bd.effIdx >= 0 ? o.brain.effectors[bd.effIdx] : null;
        if (e) {
          const a = clamp(Math.abs(e.act), 0, 1);
          ctx.strokeStyle = hsl(320 - a * 60, 0.85, 0.35 + a * 0.4, 0.95);
          ctx.lineWidth = Math.max(1, (0.5 + bd.muscle * 1.6) * zoom * 0.16);
        } else {
          ctx.strokeStyle = `rgba(200,215,230,${0.25 + bd.stiff * 0.2})`;
          ctx.lineWidth = Math.max(0.8, bd.stiff * zoom * 0.1);
        }
        ctx.beginPath();
        ctx.moveTo(px[bd.a], py[bd.a]);
        ctx.lineTo(px[bd.b], py[bd.b]);
        ctx.stroke();
      }
    }

    // komórki
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      let bestT = -1, bestV = 0.08;
      for (let t = 0; t < TRAITS.length; t++) if (c.t[t] > bestV) { bestV = c.t[t]; bestT = t; }
      const h = bestT >= 0 ? TRAIT_HUE[bestT] : hue;
      const sat = bestT >= 0 ? clamp(0.45 + bestV * 0.4, 0, 0.95) : 0.3;
      const lit = clamp(0.32 + bestV * 0.28 + o.energy / (o.maxEnergy + 1) * 0.16, 0.15, 0.78);
      const r = Math.max(1, c.r * zoom);
      ctx.fillStyle = hsl(h * 0.72 + hue * 0.28, sat, lit);
      ctx.beginPath();
      ctx.arc(px[i], py[i], r, 0, TAU);
      ctx.fill();
      if (level >= 4 && r > 5) {
        ctx.strokeStyle = `rgba(10,12,18,${0.35 + o.genome.params.membrane * 0.2})`;
        ctx.lineWidth = Math.max(1, o.genome.params.membrane * zoom * 0.09);
        ctx.stroke();
        // jądro — wskazuje aktywność neuronu, jeśli komórka nim jest
        if (c.t[6] > 0.15) {
          const n = o.brain.neurons.find(nn => nn.cell === i);
          const a = n ? clamp((n.state + 1) / 2, 0, 1) : 0.5;
          ctx.fillStyle = hsl(275, 0.8, 0.25 + a * 0.55);
          ctx.beginPath(); ctx.arc(px[i], py[i], r * 0.38, 0, TAU); ctx.fill();
        } else if (c.t[5] > 0.1) {
          ctx.fillStyle = hsl(55, 0.9, 0.7);
          ctx.beginPath(); ctx.arc(px[i], py[i], r * 0.3, 0, TAU); ctx.fill();
        }
      }
    }
  }

  drawSelection(ctx, o) {
    const cam = this.camera;
    const p = cam.worldToScreen(o.x, o.y);
    const r = Math.max(7, o.radius * cam.zoom * 1.45);
    ctx.strokeStyle = 'rgba(120,230,255,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,230,255,0.35)';
    ctx.beginPath(); ctx.arc(p.x, p.y, r + 5 + Math.sin(this.time * 3) * 2, 0, TAU); ctx.stroke();
  }

  drawWeather(ctx, W, H) {
    const cl = this.sim.climate;
    if (cl.rain > 0.05 && this.camera.zoom > 1.2) {
      ctx.strokeStyle = `rgba(170,200,255,${cl.rain * 0.28})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const count = Math.floor(cl.rain * 260);
      for (let i = 0; i < count; i++) {
        const x = (i * 7919 + this.time * 420 * (1 + cl.windX)) % W;
        const y = (i * 104729 + this.time * 900) % H;
        ctx.moveTo(x, y);
        ctx.lineTo(x + cl.windX * 6, y + 9);
      }
      ctx.stroke();
    }
  }

  drawDayNight(ctx, W, H) {
    const cl = this.sim.climate;
    const dark = clamp(1 - cl.dayLight, 0, 1);
    if (dark > 0.01) {
      // noc przyciemnia i chłodzi barwy, ale świat musi pozostać czytelny
      ctx.fillStyle = `rgba(14,22,54,${dark * 0.42})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (cl.cloudiness > 0.5) {
      ctx.fillStyle = `rgba(140,150,165,${(cl.cloudiness - 0.5) * 0.18})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawScaleHint(ctx, W, H) {
    const cam = this.camera;
    const unitPx = cam.zoom;
    let unit = 1, label = '1 j.';
    if (unitPx * TILE < 60) { unit = TILE; label = '1 kafel'; }
    if (unitPx * TILE * SECTOR_TILES < 90) { unit = TILE * SECTOR_TILES; label = '1 sektor'; }
    const w = unit * unitPx;
    if (w < 12 || w > W * 0.5) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1;
    const x = 18, y = H - 22;
    ctx.beginPath();
    ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y - 4);
    ctx.stroke();
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(label, x + w + 6, y + 1);
  }

  pick(sx, sy) {
    const cam = this.camera;
    const wp = cam.screenToWorld(sx, sy);
    const r = Math.max(6 / cam.zoom, 3);
    let best = null, bestD = Infinity;
    for (const o of this.sim.organisms) {
      if (!o.alive) continue;
      const d = Math.hypot(o.x - wp.x, o.y - wp.y);
      if (d < Math.max(o.radius * 1.4, r) && d < bestD) { bestD = d; best = o; }
    }
    return best;
  }
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
