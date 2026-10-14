// Shop Memory (pure). Stored separately from progression: clearing memory never touches
// balance, inventory or the ledger.
import { uid, capFront, capObject, slug, truncate, clamp } from './util.js';

export const MEM_LIMITS = { rotations: 30, seen: 600, interactions: 400, products: 300, setting: 12, log: 200, interests: 40 };

export function newMemory() {
    return {
        v: 1, id: uid('mem'), created: Date.now(), updated: Date.now(),
        purpose: { theme: 'general', label: 'General Depravity', custom: '', setBy: 'default', ts: 0, history: [] },
        restrictions: [],   // banned tag/category words (user set)
        locked: [],         // locked preferred categories/tags – always represented in rotations
        prefs: {},          // tag -> { score, source:'auto'|'user', locked }
        interactions: {},   // productKey -> { views, buys, ignored, wished, lastSeen, lastBought, name }
        wishlist: [],       // { key, name, price, added, product, notified }
        seen: {},           // productKey -> { count, lastDay }
        rotations: [],      // { day, keys, seed }
        unaffordable: {},   // productKey -> { name, price, day, product }
        products: {},       // remembered validated generated products
        setting: [],        // remembered setting notes { id, text, source, ts }
        interests: [],      // soft hints from chat { text, ts }
        log: [],            // transparent change log
    };
}

export function normalizeMemory(m) {
    const d = newMemory();
    if (!m || typeof m !== 'object' || Array.isArray(m)) return d;
    for (const k of Object.keys(d)) {
        const bad = m[k] === undefined || m[k] === null || typeof m[k] !== typeof d[k] || Array.isArray(m[k]) !== Array.isArray(d[k]);
        if (bad) m[k] = d[k];
    }
    for (const k of Object.keys(d.purpose)) if (m.purpose[k] === undefined) m.purpose[k] = d.purpose[k];
    return m;
}

export function memLog(m, text) {
    m.log.unshift({ ts: Date.now(), text: truncate(text, 200) });
    capFront(m.log, MEM_LIMITS.log);
    m.updated = Date.now();
}

export function bumpPref(m, tag, delta, source = 'auto') {
    tag = slug(tag);
    if (!tag || tag === 'item') return;
    const p = m.prefs[tag] ||= { score: 0, source, locked: false };
    const factor = p.source === 'user' && source === 'auto' ? 0.5 : 1;
    p.score = Math.round(clamp(p.score + delta * factor, -20, 50) * 100) / 100;
    if (source === 'user') p.source = 'user';
}

function touch(m, product) {
    const it = m.interactions[product.key] ||= { views: 0, buys: 0, ignored: 0, wished: 0, lastSeen: 0, lastBought: 0, name: product.name };
    it.name = product.name;
    return it;
}

export function recordView(m, product) {
    const it = touch(m, product);
    it.views++;
    it.lastSeen = Date.now();
    for (const t of product.tags || []) bumpPref(m, t, 0.2);
    capObject(m.interactions, MEM_LIMITS.interactions, 'lastSeen');
}

export function recordPurchase(m, product) {
    const it = touch(m, product);
    it.buys++;
    it.lastBought = it.lastSeen = Date.now();
    for (const t of product.tags || []) bumpPref(m, t, 2);
    bumpPref(m, product.category, 1);
    delete m.unaffordable[product.key];
    m.updated = Date.now();
}

/** At rotation end: products shown but never viewed or bought count as ignored. */
export function recordRotationEnd(m, products, viewedKeys, boughtKeys) {
    for (const p of products) {
        if (viewedKeys.has(p.key) || boughtKeys.has(p.key)) continue;
        touch(m, p).ignored++;
        for (const t of p.tags || []) bumpPref(m, t, -0.15);
    }
}

export function recordUnaffordable(m, product, day) {
    m.unaffordable[product.key] = { name: product.name, price: product.price, day, product: { ...product } };
    capObject(m.unaffordable, 60, null);
}

export function recordRotation(m, day, keys, seed) {
    m.rotations = m.rotations.filter(r => r.day !== day);
    m.rotations.unshift({ day, keys, seed });
    capFront(m.rotations, MEM_LIMITS.rotations);
    for (const k of keys) {
        const s = m.seen[k] ||= { count: 0, lastDay: '' };
        s.count++;
        s.lastDay = day;
    }
    capObject(m.seen, MEM_LIMITS.seen, null);
}

export function rememberProducts(m, products) {
    for (const p of products) m.products[p.key] = { ...p, remembered: Date.now() };
    capObject(m.products, MEM_LIMITS.products, 'remembered');
}

// ---------------------------------------------------------------- wishlist
export function isWished(m, key) {
    return m.wishlist.some(w => w.key === key);
}

export function toggleWish(m, product) {
    const i = m.wishlist.findIndex(w => w.key === product.key);
    if (i >= 0) {
        m.wishlist.splice(i, 1);
        memLog(m, `Removed "${product.name}" from wishlist`);
        return false;
    }
    m.wishlist.unshift({ key: product.key, name: product.name, price: product.price, added: Date.now(), product: { ...product }, notified: '' });
    capFront(m.wishlist, 50);
    touch(m, product).wished++;
    for (const t of product.tags || []) bumpPref(m, t, 1);
    memLog(m, `Added "${product.name}" to wishlist`);
    return true;
}

// ---------------------------------------------------------------- purpose / restrictions / prefs
export function setPurpose(m, { theme, label, custom = '' }, setBy = 'user') {
    const old = m.purpose;
    if (old.theme !== theme || old.custom !== custom) {
        old.history = [{ theme: old.theme, label: old.label, custom: old.custom, ts: old.ts }, ...(old.history || [])].slice(0, 10);
    }
    m.purpose = { ...old, theme, label: truncate(label, 60), custom: truncate(custom, 200), setBy, ts: Date.now() };
    memLog(m, `Shop purpose set to "${m.purpose.label}"${custom ? ` – ${custom}` : ''} (by ${setBy})`);
}

export function addRestriction(m, word) {
    const w = slug(word);
    if (!w || w === 'item' || m.restrictions.includes(w)) return false;
    m.restrictions.push(w);
    memLog(m, `Restricted: ${w}`);
    return true;
}

export function removeRestriction(m, word) {
    const i = m.restrictions.indexOf(slug(word));
    if (i < 0) return false;
    memLog(m, `Restriction lifted: ${m.restrictions[i]}`);
    m.restrictions.splice(i, 1);
    return true;
}

export function setPref(m, tag, score, locked) {
    tag = slug(tag);
    if (!tag || tag === 'item') return false;
    const p = m.prefs[tag] ||= { score: 0, source: 'user', locked: false };
    p.score = clamp(Number(score) || 0, -20, 50);
    p.source = 'user';
    if (locked !== undefined) p.locked = !!locked;
    memLog(m, `Preference "${tag}" = ${p.score}${p.locked ? ' (locked)' : ''}`);
    return true;
}

export function deletePref(m, tag) {
    if (!m.prefs[slug(tag)]) return false;
    delete m.prefs[slug(tag)];
    memLog(m, `Preference "${tag}" removed`);
    return true;
}

export function toggleLock(m, category) {
    const c = slug(category);
    const i = m.locked.indexOf(c);
    if (i >= 0) m.locked.splice(i, 1); else m.locked.push(c);
    memLog(m, `${i >= 0 ? 'Unlocked' : 'Locked'} category: ${c}`);
    return i < 0;
}

/** Clear purchase-derived learning only (keeps purpose, restrictions, locks, wishlist, user-set prefs). */
export function clearPurchaseLearning(m) {
    for (const [tag, p] of Object.entries(m.prefs)) if (p.source !== 'user' && !p.locked) delete m.prefs[tag];
    for (const it of Object.values(m.interactions)) { it.buys = 0; it.lastBought = 0; }
    memLog(m, 'Cleared purchase-based recommendations (owned items untouched)');
}

export function forgetProduct(m, key) {
    delete m.interactions[key];
    delete m.seen[key];
    delete m.unaffordable[key];
    delete m.products[key];
    m.wishlist = m.wishlist.filter(w => w.key !== key);
    memLog(m, `Forgot product ${key}`);
}

export function addSettingNote(m, text, source = 'user') {
    const t = truncate(String(text || '').trim(), 160);
    if (t.length < 3 || m.setting.some(s => s.text.toLowerCase() === t.toLowerCase())) return false;
    m.setting.unshift({ id: uid('set'), text: t, source, ts: Date.now() });
    capFront(m.setting, MEM_LIMITS.setting);
    memLog(m, `Setting note added: ${t}`);
    return true;
}

export function addInterest(m, text) {
    const t = truncate(String(text || '').trim(), 80);
    if (t.length < 3) return false;
    m.interests = m.interests.filter(i => i.text !== t);
    m.interests.unshift({ text: t, ts: Date.now() });
    capFront(m.interests, MEM_LIMITS.interests);
    return true;
}

/** Top preference tags (positive or locked), locked first. */
export function topPrefs(m, n = 8) {
    return Object.entries(m.prefs)
        .filter(([, p]) => p.score > 0 || p.locked)
        .sort((a, b) => (Number(b[1].locked) - Number(a[1].locked)) || b[1].score - a[1].score)
        .slice(0, n).map(([tag, p]) => ({ tag, ...p }));
}

/** Reset the whole memory but keep its id. Progression is a different object and is untouched. */
export function resetMemory(m) {
    const fresh = newMemory();
    fresh.id = m.id;
    for (const k of Object.keys(m)) delete m[k];
    Object.assign(m, fresh);
    memLog(m, 'Shop memory reset');
}

