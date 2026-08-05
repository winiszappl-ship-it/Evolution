// Światów się nie zapisuje. Każda planeta istnieje raz i nie da się do niej
// wrócić — tak samo jak nie da się cofnąć czasu w jej wnętrzu. Trwały jest
// tylko Bank DNA, bo genom to informacja, a nie stan świata.
const KEY_BANK = 'evolution.dnabank';
const KEY_SETTINGS = 'evolution.settings';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn('Nie udało się odczytać', key, e);
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('Nie udało się zapisać', key, e);
    return false;
  }
}

// ------------------------------------------------------------------ bank DNA

export function listDNA() { return read(KEY_BANK, []); }

export function saveDNA(entry) {
  const bank = read(KEY_BANK, []);
  entry.id = entry.id || ('d' + Date.now().toString(36) + Math.floor(Math.random() * 1000));
  entry.saved = Date.now();
  const idx = bank.findIndex(e => e.id === entry.id);
  if (idx >= 0) bank[idx] = entry; else bank.push(entry);
  while (bank.length > 300) bank.shift();
  write(KEY_BANK, bank);
  return entry.id;
}

export function deleteDNA(id) {
  write(KEY_BANK, read(KEY_BANK, []).filter(e => e.id !== id));
}

export function collections() {
  const set = new Set();
  for (const e of read(KEY_BANK, [])) if (e.collection) set.add(e.collection);
  return Array.from(set).sort();
}

// ------------------------------------------------------------------ ustawienia

export const DEFAULT_SETTINGS = {
  showUI: true,
  maxDetail: 220,
  overlay: 'none',
};

export function getSettings() { return { ...DEFAULT_SETTINGS, ...read(KEY_SETTINGS, {}) }; }
export function setSettings(s) { write(KEY_SETTINGS, s); }
