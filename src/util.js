// Pure helpers. No SillyTavern imports so this module is unit-testable in Node.

export const MODULE = 'infinite_points';
export const VERSION = '1.0.0';

export function clone(o) {
    return o === undefined ? undefined : JSON.parse(JSON.stringify(o));
}

/** cyrb53 – fast, well distributed 53-bit string hash, returned as base36. */
export function hash(str, seed = 0) {
    str = String(str ?? '');
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Deterministic PRNG. */
export function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

export function seededRng(seedStr) {
    return mulberry32(parseInt(hash(seedStr).slice(0, 8), 36) >>> 0);
}

/** Weighted pick. Returns index into weights or -1. */
export function pickWeightedIndex(rng, weights) {
    let total = 0;
    for (const w of weights) total += Math.max(0, w || 0);
    if (total <= 0) return -1;
    let r = rng() * total;
    for (let i = 0; i < weights.length; i++) {
        r -= Math.max(0, weights[i] || 0);
        if (r < 0) return i;
    }
    return weights.length - 1;
}

export function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}

export function clamp(n, min, max) {
    n = Number(n);
    if (!Number.isFinite(n)) n = min;
    return Math.min(max, Math.max(min, n));
}

export function fmt(n) {
    n = Number(n) || 0;
    return Math.round(n).toLocaleString('en-US');
}

/** Strip HTML / markdown markers and collapse whitespace (case preserved). */
export function plainText(s) {
    return String(s ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/[_~`#]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function normText(s) {
    return plainText(String(s ?? '').replace(/\*/g, ' ')).toLowerCase();
}

/** Remove quoted dialogue ("...", “...”, «...», 「...」). */
export function stripQuoted(s) {
    return String(s ?? '')
        .replace(/"[^"\n]*"/g, ' ')
        .replace(/“[^”\n]*”/g, ' ')
        .replace(/«[^»\n]*»/g, ' ')
        .replace(/「[^」\n]*」/g, ' ');
}

/** Fill missing keys of target from defaults (recursive for plain objects; arrays are not merged). */
export function deepFill(target, defs) {
    for (const k of Object.keys(defs)) {
        const d = defs[k];
        if (target[k] === undefined || (target[k] === null && d !== null)) {
            target[k] = clone(d);
        } else if (isPlainObject(d) && isPlainObject(target[k])) {
            deepFill(target[k], d);
        }
    }
    return target;
}

export function isPlainObject(o) {
    return !!o && typeof o === 'object' && !Array.isArray(o);
}

export function titleCase(s) {
    return String(s || '').replace(/\b\w/g, c => c.toUpperCase());
}

export function truncate(s, n) {
    s = String(s ?? '');
    return s.length > n ? s.slice(0, Math.max(0, n - 1)).trimEnd() + '…' : s;
}

export function slug(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 48) || 'item';
}

/** Keep only the newest `max` entries of an array that is ordered newest-first. */
export function capFront(arr, max) {
    if (Array.isArray(arr) && arr.length > max) arr.length = max;
    return arr;
}

/** Keep only `max` keys of an object, dropping those with the smallest `field` value. */
export function capObject(obj, max, field = 'last') {
    const keys = Object.keys(obj || {});
    if (keys.length <= max) return obj;
    keys.sort((a, b) => (obj[a]?.[field] || 0) - (obj[b]?.[field] || 0));
    for (const k of keys.slice(0, keys.length - max)) delete obj[k];
    return obj;
}
