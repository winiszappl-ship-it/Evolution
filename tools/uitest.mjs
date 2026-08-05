// Test interfejsu w prawdziwej przeglądarce: uruchamia grę, klika przez ekrany
// i zgłasza każdy błąd konsoli. node tools/uitest.mjs
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';

const ROOT = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  try {
    const p = normalize(decodeURIComponent(req.url.split('?')[0]));
    const file = join(ROOT, p === '/' ? 'index.html' : p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(404).end('nie znaleziono: ' + req.url);
  }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1400, height: 880 } });

const errors = [];
const logs = [];
page.on('console', (m) => {
  const t = `${m.type()}: ${m.text()}`;
  logs.push(t);
  if (m.type() === 'error') errors.push(t);
});
page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));

const shot = async (name) => {
  await page.screenshot({ path: `/tmp/claude-0/-home-user-Evolution/93ce6d84-2e13-57ee-8f75-6f1dda01323a/scratchpad/${name}.png` });
  console.log(`  zrzut: ${name}.png`);
};

console.log('otwieram stronę…');
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
console.log('menu główne widoczne:', await page.locator('.modal-box h1').first().textContent());
await shot('01-menu');

// nowa symulacja
await page.getByRole('button', { name: /Nowa Symulacja/ }).click();
await page.waitForTimeout(1200);
console.log('ekran tworzenia świata:', await page.locator('.modal-box h2').first().textContent());
await shot('02-worldsetup');

await page.getByRole('button', { name: 'Stwórz świat' }).click();
await page.waitForTimeout(900);
console.log('ekran pierwszej komórki:', await page.locator('.modal-box h2').first().textContent());
await shot('03-cellsetup');

await page.getByRole('button', { name: 'Zasiej życie' }).click();
await page.waitForTimeout(600);
await shot('04-swiat');

// przewiń symulację i zmierz, jakie tempo faktycznie da się osiągnąć
for (const sp of [5, 20, 100, 1000]) {
  await page.evaluate((s) => window.evolution.setSpeed(s), sp);
  await page.waitForTimeout(4000);
  const st = await page.evaluate(() => {
    const a = window.evolution;
    return {
      rok: +a.sim.year.toFixed(1), organizmy: a.sim.organisms.length,
      gatunki: a.sim.species.aliveCount, osiagniete: a.achievedSpeed,
      fizyka: a.sim.stats.fullDetail, punkty: a.sim.stats.pointDetail,
    };
  });
  console.log(`  ${String(sp).padStart(4)}× →`, JSON.stringify(st));
}
const stats = await page.evaluate(() => ({ organizmy: window.evolution.sim.organisms.length }));
await page.evaluate(() => window.evolution.setSpeed(5));
await shot('05-po-symulacji');

// zaznaczenie organizmu
const picked = await page.evaluate(() => {
  const app = window.evolution;
  const o = app.sim.organisms[Math.floor(app.sim.organisms.length / 2)];
  if (!o) return null;
  app.camera.setTarget(o.x, o.y);
  app.camera.tzoom = 26;
  app.select(o);
  return { id: o.id, komorki: o.body.cellCount };
});
await page.waitForTimeout(1800);
console.log('zaznaczony organizm:', JSON.stringify(picked));
await shot('06-organizm');

// ekrany
for (const [label, act] of [['Encyklopedia', 'encyclopedia'], ['Kronika', 'chronicle'],
['Laboratorium', 'lab'], ['Bank DNA', 'bank']]) {
  await page.evaluate((a) => document.querySelector(`[data-act="${a}"]`).click(), act);
  await page.waitForTimeout(700);
  const h = await page.locator('.modal-box h2').first().textContent().catch(() => '—');
  console.log(`ekran ${label}: ${h}`);
  await shot('07-' + act);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// drzewo rodowe
await page.evaluate(() => window.evolution.screens.encyclopedia('tree'));
await page.waitForTimeout(700);
await shot('08-drzewo');
await page.keyboard.press('Escape');

// nakładki mapy
await page.waitForTimeout(300);
for (const ov of ['temp', 'nutrient', 'sectors']) {
  await page.evaluate((o) => window.evolution.setOverlay(o), ov);
  await page.waitForTimeout(500);
}
await page.evaluate(() => { window.evolution.camera.tzoom = window.evolution.camera.fitZoom(); });
await page.waitForTimeout(1200);
await shot('09-nakladka-sektory');
await page.evaluate(() => window.evolution.setOverlay('none'));

// świat nie ma zapisu — sprawdzamy, że nie da się go odtworzyć
const noSave = await page.evaluate(() => ({
  saveWorld: typeof window.evolution.saveWorld,
  loadWorld: typeof window.evolution.loadWorld,
  serialize: typeof window.evolution.sim.serialize,
}));
console.log('brak zapisu świata:', JSON.stringify(noSave));
await shot('10-bez-zapisu');

console.log('\n=== błędy konsoli ===');
if (errors.length) errors.slice(0, 25).forEach(e => console.log('  ' + e.slice(0, 400)));
else console.log('  brak');

await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
