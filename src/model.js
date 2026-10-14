// Progression model: balance, ledger, events. Pure functions operating on plain objects.
// All balance changes go through postLedger() so the ledger is a complete audit trail.
import { uid, capFront, capObject } from './util.js';
import { economyFactors } from './pricing.js';
import { LEVELS, levelFor, FETISH_IDS, XP_PER_POINT, XP_PER_ACHIEVEMENT } from './content.js';

export const LIMITS = { ledger: 2000, events: 1000, awarded: 6000, msgs: 6000, effects: 60, charRecent: 25, days: 60 };
const EARN_KINDS = new Set(['event', 'restore', 'revoke', 'adjust', 'milestone', 'achievement']);

export function newProgress() {
    return {
        v: 1, id: uid('prog'), created: Date.now(), updated: Date.now(),
        balance: 0, lifetime: 0, spent: 0, xp: 0,
        ledger: [], events: [], awarded: {}, fps: {}, msgs: {},
        counts: {}, characters: {}, inventory: {}, effects: [],
        milestones: {}, achievements: {}, daily: {}, ops: {},
        stats: { purchases: 0, rareBuy: 0, premiumBuy: 0, wishBuy: 0, used: 0 },
    };
}

/** Repair / fill a loaded progress object so older or partially corrupt data keeps working. */
export function normalizeProgress(p) {
    const d = newProgress();
    if (!p || typeof p !== 'object' || Array.isArray(p)) return d;
    for (const k of Object.keys(d)) {
        const bad = p[k] === undefined || p[k] === null || typeof p[k] !== typeof d[k] || Array.isArray(p[k]) !== Array.isArray(d[k]);
        if (bad) p[k] = d[k];
    }
    for (const k of ['balance', 'lifetime', 'spent', 'xp']) p[k] = Number.isFinite(Number(p[k])) ? Math.round(Number(p[k])) : 0;
    for (const k of Object.keys(d.stats)) if (typeof p.stats[k] !== 'number') p.stats[k] = 0;
    return p;
}

function trimDaily(daily) {
    const keys = Object.keys(daily).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - LIMITS.days))) delete daily[k];
}

export function postLedger(p, kind, amount, note, env, ref = null) {
    amount = Math.round(Number(amount) || 0);
    p.balance += amount;
    if (EARN_KINDS.has(kind) || kind === 'manual') p.lifetime = Math.max(0, p.lifetime + amount);
    if (kind === 'purchase' || kind === 'refresh') p.spent += -amount;
    if (kind === 'refund') p.spent = Math.max(0, p.spent - amount);
    if (EARN_KINDS.has(kind) && env?.day) {
        p.daily[env.day] = (p.daily[env.day] || 0) + amount;
        trimDaily(p.daily);
    }
    const entry = { id: uid('tx'), ts: env?.now ?? Date.now(), kind, amount, balance: p.balance, note: String(note || ''), ref };
    p.ledger.unshift(entry);
    capFront(p.ledger, LIMITS.ledger);
    p.updated = entry.ts;
    return entry;
}

function bumpCount(p, ev, sign, env) {
    const c = p.counts[ev.catId] ||= { name: ev.catName, count: 0, points: 0, last: 0, lastIdx: -1 };
    c.name = ev.catName || c.name;
    c.count = Math.max(0, c.count + sign);
    c.points += sign * ev.points;
    if (sign > 0) { c.last = env.now; c.lastIdx = ev.idx ?? -1; }
    for (const name of ev.chars || []) {
        const ch = p.characters[name] ||= { count: 0, points: 0, last: 0, cats: {}, recent: [] };
        ch.count = Math.max(0, ch.count + sign);
        ch.points += sign * ev.points;
        ch.cats[ev.catId] = Math.max(0, (ch.cats[ev.catId] || 0) + sign);
        if (sign > 0) {
            ch.last = env.now;
            ch.recent.unshift({ ts: env.now, catId: ev.catId, catName: ev.catName, points: ev.points, snippet: String(ev.snippet || '').slice(0, 120) });
            capFront(ch.recent, LIMITS.charRecent);
        }
    }
}

export function eventPoints(base, mult, settings) {
    return Math.max(0, Math.round((Number(base) || 0) * (Number(mult) || 1) * economyFactors(settings?.economy).earn));
}

/**
 * XP for one act. The category's own tuned `xp` is the scale — hand-set for difficulty, extremeness
 * and availability — and is deliberately NOT derived from the act's Points, so economy settings and
 * multipliers the user bought cannot move the level track. `levels.xpMult` scales every award
 * uniformly if the user wants to speed the whole track up or slow it down.
 */
export function eventXp(catXp, mult, settings) {
    const rate = Number(settings?.levels?.xpMult);
    const r = Number.isFinite(rate) && rate >= 0 ? rate : 1;
    return Math.max(1, Math.round((Number(catXp) || 0) * (Number(mult) || 1) * r));
}

/** XP an event is worth: its category's tuned value, or a Points-derived fallback for custom ones. */
function xpForEvent(ev, settings) {
    const tuned = Number(ev.xp);
    const catXp = Number.isFinite(tuned) ? Math.max(0, tuned) : Math.max(0, Number(ev.base) || 0) * XP_PER_POINT;
    return eventXp(catXp, ev.mult, settings);
}

function liveKeyForFp(p, fp) {
    const k = fp && p.fps[fp];
    return k && p.awarded[k] && !p.awarded[k].revoked ? k : null;
}

/**
 * Award an event exactly once.
 * ev: { key, fp, catId, catName, icon, base, mult, intensity, snippet, chars, idx, source, points? }
 * env: { now, day, settings, achievements }
 * @returns {{status:'awarded'|'restored'|'duplicate', event?:object, bonuses?:object[], reason?:string}}
 */
export function awardEvent(p, ev, env) {
    const existing = p.awarded[ev.key];
    if (existing && !existing.revoked) return { status: 'duplicate', reason: 'already awarded' };
    const fpOwner = liveKeyForFp(p, ev.fp);
    if (fpOwner && fpOwner !== ev.key) return { status: 'duplicate', reason: 'identical event already rewarded' };
    let record, status;
    if (existing) {
        existing.revoked = false;
        existing.last = env.now;
        record = p.events.find(e => e.key === ev.key) || null;
        if (record) { record.revoked = false; delete record.revokedReason; }
        postLedger(p, 'restore', existing.points, `Restored: ${existing.catName}`, env, ev.key);
        p.xp += existing.xp || 0;
        bumpCount(p, existing, +1, env);
        status = 'restored';
        record ||= existing;
    } else {
        const points = Number.isFinite(ev.points) ? Math.max(0, Math.round(ev.points)) : eventPoints(ev.base, ev.mult, env.settings);
        const xp = xpForEvent(ev, env.settings);
        record = {
            id: uid('ev'), key: ev.key, ts: env.now, catId: ev.catId, catName: ev.catName, icon: ev.icon || '•',
            base: Number(ev.base) || 0, mult: Number(ev.mult) || 1, intensity: ev.intensity || null, points, xp,
            snippet: String(ev.snippet || '').slice(0, 240), chars: ev.chars || [], idx: ev.idx ?? -1,
            chat: ev.chat || '', source: ev.source || 'keyword', revoked: false,
        };
        p.events.unshift(record);
        capFront(p.events, LIMITS.events);
        p.awarded[ev.key] = {
            points, xp, catId: record.catId, catName: record.catName, chars: record.chars, idx: record.idx,
            slot: ev.slot || '', chat: ev.chat || '',
            snippet: record.snippet.slice(0, 100), ts: env.now, last: env.now, revoked: false,
        };
        capObject(p.awarded, LIMITS.awarded, 'last');
        const label = `${record.icon} ${record.catName}${record.intensity ? ` (${record.intensity})` : ''}`;
        postLedger(p, 'event', points, label, env, ev.key);
        p.xp += xp;
        bumpCount(p, record, +1, env);
        status = 'awarded';
    }
    if (ev.fp) { p.fps[ev.fp] = ev.key; capObject(p.fps, LIMITS.awarded, null); }
    return { status, event: record, bonuses: checkProgress(p, env) };
}

export function revokeEvent(p, key, env, reason = 'message changed') {
    const a = p.awarded[key];
    if (!a || a.revoked) return null;
    a.revoked = true;
    a.last = env.now;
    const rec = p.events.find(e => e.key === key);
    if (rec) { rec.revoked = true; rec.revokedReason = reason; }
    bumpCount(p, a, -1, env);
    p.xp = Math.max(0, p.xp - (a.xp || 0));
    for (const [fp, k] of Object.entries(p.fps)) if (k === key) delete p.fps[fp];
    return postLedger(p, 'revoke', -a.points, `Revoked: ${a.catName} (${reason})`, env, key);
}

/** Manual correction of one event's reward. */
export function adjustEvent(p, key, newPoints, env, note = '') {
    const a = p.awarded[key];
    if (!a) return { ok: false, error: 'Event not found.' };
    newPoints = Math.max(0, Math.round(Number(newPoints) || 0));
    const diff = newPoints - a.points;
    if (diff === 0) return { ok: false, error: 'No change.' };
    if (!a.revoked && p.balance + diff < 0) return { ok: false, error: 'Correction would make the balance negative.' };
    a.points = newPoints;
    const rec = p.events.find(e => e.key === key);
    if (rec) { rec.points = newPoints; rec.adjusted = true; }
    if (a.revoked) return { ok: true, entry: null };
    const c = p.counts[a.catId];
    if (c) c.points += diff;
    for (const n of a.chars || []) if (p.characters[n]) p.characters[n].points += diff;
    return { ok: true, entry: postLedger(p, 'adjust', diff, `Correction: ${a.catName}${note ? ` – ${note}` : ''}`, env, key) };
}

/** Free-form manual correction. Negative corrections may not push the balance below zero. */
export function manualAdjust(p, amount, note, env) {
    amount = Math.round(Number(amount) || 0);
    if (!amount) return { ok: false, error: 'Amount must be a non-zero number.' };
    if (amount < 0 && p.balance + amount < 0) return { ok: false, error: 'Correction would make the balance negative.' };
    const entry = postLedger(p, 'manual', amount, note || 'Manual correction', env);
    return { ok: true, entry, bonuses: checkProgress(p, env) };
}


// ---------------------------------------------------------------- milestones & achievements

export function metric(p, cond) {
    const key = String(cond ?? '');
    // `cat:<id>` counts the events of one reward category, so an achievement can target one
    // specific act ("finish inside 25 times") without a new hard-coded condition each time.
    if (key.startsWith('cat:')) return p.counts[key.slice(4)]?.count || 0;
    switch (key) {
        case 'events': return Object.values(p.counts).reduce((s, c) => s + (c.count || 0), 0);
        case 'lifetime': return p.lifetime;
        case 'balance': return p.balance;
        case 'purchases': return p.stats.purchases;
        case 'permanents': return Object.values(p.inventory).filter(i => i.qty > 0 && (i.type === 'permanent' || i.type === 'equipment')).length;
        case 'rareBuy': return p.stats.rareBuy;
        case 'premiumBuy': return p.stats.premiumBuy;
        case 'wishBuy': return p.stats.wishBuy;
        case 'categories': return Object.values(p.counts).filter(c => c.count > 0).length;
        case 'partners': return Object.keys(p.characters).length;
        case 'tier': return LEVELS.indexOf(levelFor(p.xp)) + 1;
        case 'level': return LEVELS.indexOf(levelFor(p.xp)) + 1;
        case 'xp': return p.xp;
        case 'fetishes': return FETISH_IDS.filter(id => (p.counts[id]?.count || 0) > 0).length;
        default: return 0;
    }
}

/** Grant newly reached milestones and achievements (once each; never revoked). */
export function checkProgress(p, env, depth = 0) {
    const out = [];
    const s = env.settings || {};
    for (const m of s.milestones || []) {
        if (!m || !m.enabled || p.milestones[m.id]) continue;
        if (metric(p, m.kind === 'events' ? 'events' : 'lifetime') >= Number(m.threshold)) {
            const bonus = Math.max(0, Math.round(Number(m.bonus) || 0));
            p.milestones[m.id] = { ts: env.now, bonus };
            if (bonus > 0) postLedger(p, 'milestone', bonus, `🎯 Milestone: ${m.name}`, env, m.id);
            out.push({ type: 'milestone', id: m.id, name: m.name, bonus });
        }
    }
    for (const a of env.achievements || []) {
        if (p.achievements[a.id]) continue;
        if (metric(p, a.cond) >= a.n) {
            const bonus = Math.max(0, Math.round(Number(s.achievementBonus) || 0));
            const xp = Math.max(0, Math.round(Number(a.xp ?? XP_PER_ACHIEVEMENT) || 0));
            p.achievements[a.id] = { ts: env.now, xp };
            if (bonus > 0) postLedger(p, 'achievement', bonus, `${a.icon} Achievement: ${a.name}`, env, a.id);
            p.xp += xp;
            out.push({ type: 'achievement', id: a.id, name: a.name, icon: a.icon, bonus, xp });
        }
    }
    if (out.length && depth < 3) out.push(...checkProgress(p, env, depth + 1));
    return out;
}

/** Average points earned per active day over recent days (used for product selection only, never pricing). */
export function averageDailyEarnings(p, days = 7) {
    const vals = Object.keys(p.daily).sort().slice(-days).map(k => p.daily[k]).filter(v => v > 0);
    if (vals.length < 2) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
}

