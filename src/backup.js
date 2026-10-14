// Backups (IndexedDB via SillyTavern's bundled localforage) and import/export.
import { MODULE, clone, VERSION } from './util.js';
import { libs, chatId } from './st.js';
import { normalizeProgress } from './model.js';
import { normalizeMemory } from './memory.js';
import { normalizeShop } from './storage.js';

const BK_PREFIX = `${MODULE}:bk:`;
const lf = () => libs().localforage || globalThis.localforage;

/**
 * Store a snapshot. `live` is always the latest; `ring` keeps periodic history (≥10 min apart).
 * data = { progress, memory, shop }
 */
export async function writeBackup(key, data, keep = 20) {
    const store = lf();
    if (!store || !key) return false;
    const now = Date.now();
    const rec = (await store.getItem(BK_PREFIX + key)) || { live: null, ring: [] };
    const snap = { ts: now, version: VERSION, chat: chatId(), data: clone(data) };
    rec.live = snap;
    if (!rec.ring.length || now - rec.ring[0].ts > 10 * 60 * 1000) {
        rec.ring.unshift(snap);
        rec.ring.length = Math.min(rec.ring.length, Math.max(1, keep));
    }
    await store.setItem(BK_PREFIX + key, rec);
    return true;
}

export async function readBackups(key) {
    const store = lf();
    if (!store || !key) return { live: null, ring: [] };
    return (await store.getItem(BK_PREFIX + key)) || { live: null, ring: [] };
}

/** Manual snapshot that is always kept in the ring (e.g. before risky operations). */
export async function snapshotNow(key, data, keep = 20, label = 'manual') {
    const store = lf();
    if (!store || !key) return false;
    const rec = (await store.getItem(BK_PREFIX + key)) || { live: null, ring: [] };
    const snap = { ts: Date.now(), version: VERSION, chat: chatId(), label, data: clone(data) };
    rec.live = snap;
    rec.ring.unshift(snap);
    rec.ring.length = Math.min(rec.ring.length, Math.max(1, keep));
    await store.setItem(BK_PREFIX + key, rec);
    return true;
}

// ---------------------------------------------------------------- import / export
export function exportBundle(settings, state, { includeSettings = false, onlyMemory = false } = {}) {
    const out = { format: 'infinite-points', version: VERSION, exported: new Date().toISOString(), chat: chatId() };
    if (!onlyMemory) {
        out.progress = clone(state.progress);
        out.shop = clone(state.shop);
    }
    out.memory = clone(state.memory);
    if (includeSettings) {
        const copy = clone(settings);
        delete copy.profiles;
        delete copy.memories;
        out.settings = copy;
    }
    return out;
}

/** Parse + validate an import file. Throws a readable error on bad input. */
export function parseBundle(text) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('File is not valid JSON.'); }
    if (!data || data.format !== 'infinite-points') throw new Error('Not an Infinite Points export file.');
    const out = {};
    if (data.progress) out.progress = normalizeProgress(data.progress);
    if (data.memory) out.memory = normalizeMemory(data.memory);
    if (data.shop) out.shop = normalizeShop(data.shop);
    if (data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)) out.settings = data.settings;
    if (!out.progress && !out.memory && !out.settings) throw new Error('The file contains no System data.');
    return out;
}

export function download(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function pickFile() {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.addEventListener('change', async () => resolve(input.files?.[0] ? await input.files[0].text() : null));
        input.click();
    });
}
