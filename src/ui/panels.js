import { el, toast } from './dom.js';
import { formatNumber, clamp, hsl } from '../core/util.js';
import { biomeName } from '../world/biomes.js';
import { ACT_NAME, SIG_NAME, TRAITS, TRAIT_LABEL, PARAM_KEYS } from '../bio/genome.js';
import { SENSE_MOD } from '../bio/brain.js';
import { TICKS_PER_YEAR } from '../world/climate.js';
import { OVERLAYS } from '../render/renderer.js';

const ACT_COLOR = ['#63c8ff', '#c58bff', '#6ee7a0', '#ffd166', '#8fa3bd', '#ff6b6b', '#5c6b80', '#ff9ecb'];

export function geneStrip(genome, limit = 200) {
  const strip = el('div', { class: 'dna-strip' });
  const genes = genome.genes.slice(0, limit);
  for (const g of genes) {
    const title = `${ACT_NAME[g.act]}\njeśli ${SIG_NAME[g.s1]} ${g.c1 === 0 ? '>' : '<'} ${g.t1.toFixed(2)}`
      + (g.use2 ? `\n oraz ${SIG_NAME[g.s2]} ${g.c2 === 0 ? '>' : '<'} ${g.t2.toFixed(2)}` : '')
      + `\nparametry ${g.p0.toFixed(2)} / ${g.p1.toFixed(2)} / ${g.p2.toFixed(2)}`;
    strip.appendChild(el('div', {
      class: 'dna-gene', title,
      style: { background: ACT_COLOR[g.act] || '#888' },
      text: ACT_NAME[g.act][0].toUpperCase(),
    }));
  }
  if (genome.genes.length > limit) {
    strip.appendChild(el('span', { class: 'hint', text: `+${genome.genes.length - limit}` }));
  }
  return strip;
}

function row(a, b) {
  return el('div', { class: 'row' }, el('span', { text: a }), el('span', { text: b }));
}

function bar(frac, color) {
  return el('div', { class: 'bar' }, el('i', { style: { width: `${clamp(frac, 0, 1) * 100}%`, background: color } }));
}

export class HUD {
  constructor(app) {
    this.app = app;
    this.top = {
      year: document.getElementById('statYear'),
      organisms: document.getElementById('statOrganisms'),
      species: document.getElementById('statSpecies'),
      temp: document.getElementById('statTemp'),
      season: document.getElementById('statSeason'),
      speed: document.getElementById('statSpeed'),
      detail: document.getElementById('statDetail'),
    };
    this.right = document.getElementById('panelRight');
    this.buildSpeeds();
    this.buildOverlays();
    this.lastPanelUpdate = 0;
  }

  buildSpeeds() {
    const box = document.getElementById('speedButtons');
    box.innerHTML = '';
    for (const s of this.app.SPEEDS) {
      box.appendChild(el('button', {
        text: s === 0 ? '⏸' : `${s}×`,
        data: { speed: s },
        onclick: () => this.app.setSpeed(s),
      }));
    }
  }

  buildOverlays() {
    const box = document.getElementById('overlayPicker');
    box.innerHTML = '';
    for (const o of OVERLAYS) {
      box.appendChild(el('button', {
        text: o.name, data: { overlay: o.key },
        onclick: () => this.app.setOverlay(o.key),
      }));
    }
  }

  syncButtons() {
    const speed = this.app.speed;
    for (const b of document.querySelectorAll('#speedButtons button')) {
      b.classList.toggle('on', parseInt(b.dataset.speed, 10) === speed && !this.app.paused);
    }
    for (const b of document.querySelectorAll('#overlayPicker button')) {
      b.classList.toggle('on', b.dataset.overlay === this.app.renderer.overlay);
    }
    const pp = document.querySelector('[data-act="playpause"]');
    if (pp) pp.textContent = this.app.paused ? '▶' : '❚❚';
  }

  update() {
    const app = this.app, sim = app.sim;
    const cam = app.camera;
    const t = this.top;
    t.year.textContent = formatNumber(sim.year);
    t.organisms.textContent = formatNumber(sim.organisms.length);
    t.species.textContent = formatNumber(sim.species.aliveCount);
    const ti = sim.world.tileOf(cam.x, cam.y);
    t.temp.textContent = `${sim.world.tempAt(ti, sim.climate).toFixed(1)}°`;
    t.season.textContent = sim.climate.seasonName + (sim.climate.isNight ? ' · noc' : '');
    t.speed.textContent = app.paused ? 'pauza' : `${app.speed}×`;
    t.detail.textContent = formatNumber(sim.stats.fullDetail);
    this.syncButtons();

    const now = performance.now();
    if (now - this.lastPanelUpdate > 220) {
      this.lastPanelUpdate = now;
      this.updateRight();
    }
  }

  updateRight() {
    const app = this.app;
    const o = app.renderer.selected;
    if (!o || !o.alive) {
      if (o && !o.alive) {
        this.right.innerHTML = '';
        this.right.appendChild(el('h3', { text: 'Organizm nie żyje' }));
        this.right.appendChild(el('div', { class: 'sub', text: `Przyczyna: ${o.deathCause || 'nieznana'}` }));
        this.right.appendChild(el('div', { class: 'btn-row' },
          el('button', { class: 'mini-btn', text: 'Zamknij', onclick: () => app.select(null) })));
        this.right.classList.remove('hidden');
        return;
      }
      this.right.classList.add('hidden');
      return;
    }
    this.right.classList.remove('hidden');
    this.right.innerHTML = '';
    this.right.appendChild(organismPanel(o, app));
  }
}

export function organismPanel(o, app) {
  const sim = app.sim;
  const sp = sim.species.get(o.speciesId);
  const d = o.diet();
  const body = o.body;
  const box = el('div');

  box.appendChild(el('h3', {},
    el('span', { class: 'dot', style: { background: hsl(o.genome.params.hue, 0.7, 0.6) } }),
    sp ? sp.name : 'bez gatunku'));
  box.appendChild(el('div', { class: 'sub', text: `osobnik #${o.id} · pokolenie ${o.generation} · ${biomeName(o._biome ?? 0)}` }));

  box.appendChild(el('div', { class: 'section' },
    el('h4', { text: 'Stan' }),
    bar(o.energy / (o.maxEnergy || 1), 'var(--accent2)'),
    row('Energia', `${formatNumber(o.energy)} / ${formatNumber(o.maxEnergy)}`),
    row('Wiek', `${formatNumber(o.age)} / ${formatNumber(o.genome.params.lifespan)} taktów`),
    row('Integralność', `${Math.round(o.integrity * 100)}%`),
    row('Potomstwo', String(o.offspring)),
    row('Prędkość', o.measuredSpeed.toFixed(3)),
    row('Wysokość', o.z > 0.05 ? `${o.z.toFixed(2)} (w powietrzu)` : 'na podłożu')));

  const dietRows = el('div', { class: 'section' }, el('h4', { text: 'Skąd bierze energię' }));
  const labels = { photo: 'światło', absorb: 'minerały', detritus: 'martwa materia', predation: 'materia żywa' };
  const colors = { photo: '#6ee7a0', absorb: '#57d6ff', detritus: '#c8a06a', predation: '#ff6b6b' };
  if (d.key === 'none') {
    dietRows.appendChild(el('div', { class: 'hint', text: 'Jeszcze nic nie pozyskał.' }));
  } else {
    for (const k of Object.keys(labels)) {
      const f = d.frac[k] || 0;
      if (f < 0.005) continue;
      dietRows.appendChild(el('div', { class: 'row' },
        el('span', { text: labels[k] }), el('span', { text: `${Math.round(f * 100)}%` })));
      dietRows.appendChild(bar(f, colors[k]));
    }
  }
  box.appendChild(dietRows);

  box.appendChild(el('div', { class: 'section' },
    el('h4', { text: 'Budowa' }),
    row('Komórki', String(body.cellCount)),
    row('Wiązania', String(body.bondCount)),
    row('Mięśnie', String(body.muscleCount)),
    row('Neurony', String(o.brain.neurons.length)),
    row('Synapsy', String(Math.round(o.brain.synCount))),
    row('Receptory', String(o.brain.sensors.length)),
    row('Masa', formatNumber(body.mass)),
    row('Utrzymanie', formatNumber(body.upkeep) + ' /takt')));

  if (o.brain.sensors.length) {
    const mods = new Map();
    for (const s of o.brain.sensors) mods.set(s.mod, (mods.get(s.mod) || 0) + 1);
    box.appendChild(el('div', { class: 'section' },
      el('h4', { text: 'Zmysły' }),
      el('div', { class: 'chips' },
        Array.from(mods.entries()).map(([m, c]) => el('span', { class: 'chip', text: `${SENSE_MOD[m]} ×${c}` })))));
  }

  const caps = Object.entries(body.cap).filter(([, v]) => v > 0.05)
    .sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (caps.length) {
    box.appendChild(el('div', { class: 'section' },
      el('h4', { text: 'Zdolności tkanek' }),
      el('div', { class: 'chips' },
        caps.map(([k, v]) => el('span', { class: 'chip', text: `${TRAIT_LABEL[k]} ${v.toFixed(1)}` })))));
  }

  box.appendChild(el('div', { class: 'section' },
    el('h4', { text: `DNA — ${o.genome.genes.length} genów` }),
    geneStrip(o.genome, 90),
    row('Tempo mutacji', o.genome.params.mutRate.toFixed(3)),
    row('Kroki rozwoju', String(Math.round(o.genome.params.devSteps))),
    row('Próg podziału', o.genome.params.reproThr.toFixed(2))));

  if (o.genome.lastMutations && o.genome.lastMutations.length) {
    const m = o.genome.lastMutations;
    const summary = m.map(x => x.kind === 'param' ? `${x.key}` : x.op).slice(0, 8).join(', ');
    box.appendChild(el('div', { class: 'section' },
      el('h4', { text: 'Mutacje względem rodzica' }),
      el('div', { class: 'hint', text: summary || 'brak' })));
  }

  box.appendChild(el('div', { class: 'btn-row' },
    el('button', {
      class: 'mini-btn', text: app.camera.follow === o ? 'Przestań śledzić' : 'Śledź',
      onclick: () => { app.camera.follow = app.camera.follow === o ? null : o; },
    }),
    el('button', { class: 'mini-btn', text: 'Zapisz DNA', onclick: () => app.saveOrganismDNA(o) }),
    el('button', { class: 'mini-btn', text: 'Sklonuj', onclick: () => { sim.cloneOrganism(o); toast('Klon utworzony', 'Kopia DNA trafiła do świata.'); } }),
    sp ? el('button', { class: 'mini-btn', text: 'Gatunek', onclick: () => app.screens.speciesDetail(sp) }) : null));

  return box;
}

export function speciesSummaryRows(sp, sim) {
  const y = (t) => (t / TICKS_PER_YEAR).toFixed(1);
  return [
    row('Osobniki', String(sp.count)),
    row('Szczyt liczebności', String(sp.peak)),
    row('Powstał', `rok ${y(sp.born)}`),
    row('Wymarł', sp.extinct !== null ? `rok ${y(sp.extinct)}` : '—'),
    row('Przodek', sp.parent ? (sim.species.get(sp.parent)?.name ?? '—') : 'linia założycielska'),
    row('Potomne gatunki', String(sp.children.length)),
    row('Główny biom', sp.mainBiome()),
    row('Sposób odżywiania', sp.dominantDiet().label),
    row('Średnio komórek', sp.avg.cells.toFixed(1)),
    row('Średnio neuronów', sp.avg.neurons.toFixed(1)),
    row('Średnie pokolenie', sp.avg.generation.toFixed(0)),
    row('Głębokość linii', String(sp.depth)),
  ];
}
