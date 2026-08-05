import { clamp, lerp } from '../core/util.js';

export const ZOOM_LEVELS = [
  { key: 'world', name: 'Świat', zoom: 0 },       // 0 = dopasuj do ekranu
  { key: 'biome', name: 'Biom', zoom: 1.6 },
  { key: 'organism', name: 'Organizm', zoom: 6 },
  { key: 'body', name: 'Budowa', zoom: 18 },
  { key: 'cell', name: 'Komórki', zoom: 46 },
];

export class Camera {
  constructor(world, canvas) {
    this.world = world;
    this.canvas = canvas;
    this.x = world.widthUnits / 2;
    this.y = world.heightUnits / 2;
    this.tx = this.x; this.ty = this.y;
    this.zoom = this.fitZoom();
    this.tzoom = this.zoom;
    this.follow = null;
    this.minZoom = this.fitZoom() * 0.6;
    this.maxZoom = 90;
  }

  fitZoom() {
    return Math.min(this.canvas.width / this.world.widthUnits,
      this.canvas.height / this.world.heightUnits);
  }

  get level() {
    const z = this.zoom / Math.max(1e-6, this.fitZoom());
    if (this.zoom > 30) return 4;
    if (this.zoom > 11) return 3;
    if (this.zoom > 3.2) return 2;
    if (z > 2.2) return 1;
    return 0;
  }

  levelName() { return ZOOM_LEVELS[this.level].name; }

  setTarget(x, y) { this.tx = x; this.ty = y; }

  panBy(dxPx, dyPx) {
    this.follow = null;
    this.tx -= dxPx / this.zoom;
    this.ty -= dyPx / this.zoom;
    this.clampTarget();
  }

  zoomAt(px, py, factor) {
    const before = this.screenToWorld(px, py);
    this.tzoom = clamp(this.tzoom * factor, this.minZoom, this.maxZoom);
    // utrzymanie punktu pod kursorem — zoom "w miejsce", nie w środek ekranu
    const k = 1 - this.zoom / this.tzoom;
    if (!this.follow) {
      this.tx += (before.x - this.tx) * k;
      this.ty += (before.y - this.ty) * k;
    }
    this.clampTarget();
  }

  goToLevel(i) {
    const lv = ZOOM_LEVELS[clamp(i, 0, ZOOM_LEVELS.length - 1)];
    this.tzoom = lv.zoom === 0 ? this.fitZoom() : lv.zoom;
    this.clampTarget();
  }

  clampTarget() {
    const halfW = this.canvas.width / (2 * this.tzoom);
    const halfH = this.canvas.height / (2 * this.tzoom);
    const W = this.world.widthUnits, H = this.world.heightUnits;
    if (halfW * 2 >= W) this.tx = W / 2;
    else this.tx = clamp(this.tx, halfW, W - halfW);
    if (halfH * 2 >= H) this.ty = H / 2;
    else this.ty = clamp(this.ty, halfH, H - halfH);
  }

  update(dt) {
    if (this.follow && this.follow.alive) {
      this.tx = this.follow.x;
      this.ty = this.follow.y;
      this.clampTarget();
    } else if (this.follow && !this.follow.alive) {
      this.follow = null;
    }
    const k = 1 - Math.pow(0.0015, Math.min(0.1, dt));
    this.x = lerp(this.x, this.tx, k);
    this.y = lerp(this.y, this.ty, k);
    this.zoom = lerp(this.zoom, this.tzoom, k);
  }

  resize() {
    this.minZoom = this.fitZoom() * 0.6;
    if (this.tzoom < this.minZoom) this.tzoom = this.minZoom;
    this.clampTarget();
  }

  worldToScreen(wx, wy) {
    return {
      x: (wx - this.x) * this.zoom + this.canvas.width / 2,
      y: (wy - this.y) * this.zoom + this.canvas.height / 2,
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.canvas.width / 2) / this.zoom + this.x,
      y: (sy - this.canvas.height / 2) / this.zoom + this.y,
    };
  }

  viewBounds() {
    const halfW = this.canvas.width / (2 * this.zoom);
    const halfH = this.canvas.height / (2 * this.zoom);
    return { x0: this.x - halfW, y0: this.y - halfH, x1: this.x + halfW, y1: this.y + halfH };
  }

  viewRadius() {
    return Math.hypot(this.canvas.width, this.canvas.height) / (2 * this.zoom);
  }
}
