// Sprawdza, czy gra działa serwowana z podkatalogu — tak, jak robi to
// GitHub Pages (adres postaci https://uzytkownik.github.io/Evolution/).
// node tools/pagestest.mjs
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';
const ROOT = '/home/user/Evolution/';
const BASE = '/Evolution/';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (!p.startsWith(BASE)) { res.writeHead(404).end('poza bazą: ' + p); return; }
    p = normalize(p.slice(BASE.length - 1));
    const file = join(ROOT, p === '/' ? 'index.html' : p);
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'text/plain' });
    res.end(data);
  } catch { res.writeHead(404).end('404 ' + req.url); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('requestfailed', r => errors.push('request: ' + r.url() + ' ' + (r.failure()?.errorText || '')));
page.on('response', r => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });

await page.goto(`http://127.0.0.1:${port}${BASE}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
console.log('menu:', await page.locator('.modal-box h1').first().textContent().catch(() => 'BRAK'));
await page.getByRole('button', { name: /Nowa Symulacja/ }).click();
await page.waitForTimeout(1000);
await page.getByRole('button', { name: 'Stwórz świat' }).click();
await page.waitForTimeout(700);
await page.getByRole('button', { name: 'Zasiej życie' }).click();
await page.waitForTimeout(2500);
const st = await page.evaluate(() => ({
  rok: +window.evolution.sim.year.toFixed(2),
  organizmy: window.evolution.sim.organisms.length,
  // zapisów nie ma i nie ma ich mieć — świat istnieje wyłącznie teraz
  zapis: typeof window.evolution.saveWorld,
  moduly: performance.getEntriesByType('resource').filter(r => r.name.endsWith('.js')).length,
}));
console.log('symulacja pod podkatalogiem:', JSON.stringify(st));

let bad = errors.length;
if (st.organizmy < 1) { console.log('BŁĄD: pod podkatalogiem nie powstało życie'); bad++; }
if (st.zapis !== 'undefined') { console.log('BŁĄD: zapis świata wrócił do gry'); bad++; }
if (st.moduly < 10) { console.log(`BŁĄD: doszło tylko ${st.moduly} modułów — ścieżki się nie rozwiązały`); bad++; }

console.log(errors.length ? 'BŁĘDY:\n  ' + errors.slice(0, 10).join('\n  ') : 'brak błędów sieci i konsoli');
console.log(bad ? `\n${bad} problemów.` : '\nGra działa serwowana z podkatalogu — GitHub Pages ją uniesie.');
await browser.close(); server.close();
process.exit(bad ? 1 : 0);
