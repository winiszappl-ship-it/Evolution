// Sprawdzenie składni wszystkich modułów — także tych, które działają
// wyłącznie w przeglądarce i nie da się ich zaimportować w node.
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const ROOT = new URL('..', import.meta.url).pathname;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js') || p.endsWith('.mjs')) out.push(p);
  }
  return out;
}

const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'tools'))];
let bad = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    bad++;
    console.error(`\n### ${f.replace(ROOT, '')}`);
    console.error(String(e.stderr).split('\n').slice(0, 6).join('\n'));
  }
}
console.log(`${files.length - bad}/${files.length} plików bez błędów składni`);
process.exit(bad ? 1 : 0);
