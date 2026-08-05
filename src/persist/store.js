const KEY_WORLDS = 'evolution.worlds';
const KEY_BANK = 'evolution.dnabank';
const KEY_LAST = 'evolution.last';
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

// ------------------------------------------------------------------ światy

export function listWorlds() {
  return read(KEY_WORLDS, []).map(w => ({ id: w.id, name: w.name, saved: w.saved, year: w.year, seed: w.seed, organisms: w.organisms, species: w.species }));
}

export function saveWorld(name, snapshot, meta) {
  const worlds = read(KEY_WORLDS, []);
  const id = meta.id || ('w' + Date.now().toString(36));
  const entry = {
    id, name, saved: Date.now(),
    year: meta.year, seed: meta.seed, organisms: meta.organisms, species: meta.species,
    data: snapshot,
  };
  const idx = worlds.findIndex(w => w.id === id);
  if (idx >= 0) worlds[idx] = entry; else worlds.push(entry);
  while (worlds.length > 12) worlds.shift();
  const ok = write(KEY_WORLDS, worlds);
  if (ok) write(KEY_LAST, { id });
  return ok ? id : null;
}

export function loadWorld(id) {
  const worlds = read(KEY_WORLDS, []);
  const w = worlds.find(x => x.id === id);
  return w ? w.data : null;
}

export function deleteWorld(id) {
  const worlds = read(KEY_WORLDS, []).filter(w => w.id !== id);
  write(KEY_WORLDS, worlds);
}

export function lastWorldId() { return read(KEY_LAST, {}).id || null; }

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
  autosave: true,
  autosaveInterval: 120,
  particles: true,
  maxDetail: 220,
  overlay: 'none',
};

export function getSettings() { return { ...DEFAULT_SETTINGS, ...read(KEY_SETTINGS, {}) }; }
export function setSettings(s) { write(KEY_SETTINGS, s); }
