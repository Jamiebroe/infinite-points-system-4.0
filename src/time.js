// Timezone-aware daily rotation helpers (pure, uses Intl only).
import { clamp } from './util.js';

export function isValidTimeZone(tz) {
    if (!tz || typeof tz !== 'string') return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

export function localTimeZone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
        return 'UTC';
    }
}

/** Resolve the configured timezone ('' / 'local' = browser timezone). */
export function resolveTimeZone(tz) {
    if (!tz || tz === 'local') return localTimeZone();
    return isValidTimeZone(tz) ? tz : 'UTC';
}

const dtfCache = new Map();
function dtf(tz) {
    if (!dtfCache.has(tz)) {
        dtfCache.set(tz, new Intl.DateTimeFormat('en-US', {
            timeZone: tz, hourCycle: 'h23',
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
        }));
    }
    return dtfCache.get(tz);
}

/** Wall-clock parts of an instant in a timezone. */
export function tzParts(ms, tz) {
    const zone = isValidTimeZone(tz) ? tz : 'UTC';
    const out = {};
    for (const p of dtf(zone).formatToParts(new Date(ms))) {
        if (p.type !== 'literal') out[p.type] = Number(p.value);
    }
    if (out.hour === 24) out.hour = 0;
    return { y: out.year, m: out.month, d: out.day, h: out.hour, mi: out.minute, s: out.second };
}

function tzOffset(ms, tz) {
    const p = tzParts(ms, tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** Convert a wall-clock time in tz to a UTC instant (two passes to settle DST). */
export function wallToUtc(y, m, d, h, mi, tz) {
    const guess = Date.UTC(y, m - 1, d, h, mi, 0);
    let t = guess - tzOffset(guess, tz);
    t = guess - tzOffset(t, tz);
    return t;
}

export function parseResetTime(str) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || '').trim());
    if (!m) return { h: 0, mi: 0 };
    return { h: clamp(Number(m[1]), 0, 23), mi: clamp(Number(m[2]), 0, 59) };
}

function ymd(y, m, d) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** The "shop day" (YYYY-MM-DD) an instant belongs to, given timezone and daily reset time. */
export function dayKeyFor(ms, tz, resetTime = '00:00') {
    const zone = resolveTimeZone(tz);
    const p = tzParts(ms, zone);
    const r = parseResetTime(resetTime);
    const before = p.h * 60 + p.mi < r.h * 60 + r.mi;
    return ymd(p.y, p.m, p.d - (before ? 1 : 0));
}

/** UTC instant (ms) of the next shop reset after `ms`. */
export function nextResetMs(ms, tz, resetTime = '00:00') {
    const zone = resolveTimeZone(tz);
    const p = tzParts(ms, zone);
    const r = parseResetTime(resetTime);
    let t = wallToUtc(p.y, p.m, p.d, r.h, r.mi, zone);
    if (t <= ms) {
        const nd = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
        t = wallToUtc(nd.getUTCFullYear(), nd.getUTCMonth() + 1, nd.getUTCDate(), r.h, r.mi, zone);
    }
    if (t <= ms) t += 24 * 3600 * 1000;
    return t;
}

export function fmtDuration(ms) {
    ms = Math.max(0, ms);
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${m}m ${String(sec).padStart(2, '0')}s`;
}

/** Whole days from dayKey a to dayKey b (b - a). */
export function daysBetween(a, b) {
    const pa = String(a).split('-').map(Number), pb = String(b).split('-').map(Number);
    if (pa.length < 3 || pb.length < 3) return 0;
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

export function when(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
