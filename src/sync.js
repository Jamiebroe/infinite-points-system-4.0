// Chat ⇄ progression reconciliation (pure). Guarantees each event is live at most once.
//
//   event key   = chat | slot | category
//   slot        = stable identity of a message position (first swipe's send_date + author), NOT its index,
//                 so deleting earlier messages does not shift identities.
//   fingerprint = category | normalised text – blocks re-awarding identical content (branches, copy-paste).
//
// Only the currently displayed swipe counts. Swiping away revokes; swiping back restores.
import { hash, normText, capObject } from './util.js';
import { awardEvent, revokeEvent, LIMITS } from './model.js';

/** Stable slot ids for the chat array (collisions get an occurrence suffix). */
export function slotIds(chat) {
    const seen = new Map();
    return (chat || []).map((m, idx) => {
        const first = Array.isArray(m?.swipe_info) && m.swipe_info[0]?.send_date ? m.swipe_info[0].send_date : m?.send_date;
        const base = first ? hash(`${first}|${m?.is_user ? 'u' : 'c'}|${m?.name || ''}`) : `i${idx}`;
        const n = seen.get(base) || 0;
        seen.set(base, n + 1);
        return n ? `${base}~${n}` : base;
    });
}

export const contentHash = text => hash(normText(text));
export const fingerprint = (catId, text) => hash(`${catId}|${normText(text)}`);
export const msgKey = (chatId, slot) => `${chatId}|${slot}`;
export const eventKey = (chatId, slot, catId) => `${chatId}|${slot}|${catId}`;

/** Message descriptors from a SillyTavern chat array. */
export function describeChat(chat) {
    const slots = slotIds(chat);
    return (chat || []).map((m, idx) => ({
        slot: slots[idx], idx, text: String(m?.mes ?? ''), isUser: !!m?.is_user, name: String(m?.name || ''),
        system: !!m?.is_system || !!m?.extra?.isSmallSys,
    }));
}

/** Messages whose content changed since the last reconcile (they need detection). */
export function changedMessages(p, chatId, messages, opts = {}) {
    return messages.filter(m => {
        if (m.system || (opts.skipIdx !== undefined && m.idx === opts.skipIdx)) return false;
        const rec = p.msgs[msgKey(chatId, m.slot)];
        if (!rec) return !opts.baseline;
        return !rec.base && rec.h !== contentHash(m.text);
    });
}

function chatAwardIndex(p, chatId) {
    const byCat = {};
    for (const a of Object.values(p.awarded)) {
        if (!a.revoked && a.chat === chatId) (byCat[a.catId] ||= []).push(a);
    }
    return byCat;
}

function revokeKeys(p, keys, env, reason, res) {
    for (const k of keys) {
        const tx = revokeEvent(p, k, env, reason);
        if (tx) res.revoked.push({ key: k, points: -tx.amount });
    }
}

function onCooldown(awardIdx, d, m) {
    const cd = Number(d.cat.cooldown) || 0;
    if (cd <= 0) return false;
    return (awardIdx[d.catId] || []).some(a => a.slot !== m.slot && Math.abs((a.idx ?? -1e9) - m.idx) < cd);
}

function applyMessage(p, chatId, m, detected, env, awardIdx, res) {
    const cats = env.cats || {};
    const mk = msgKey(chatId, m.slot);
    const desired = new Map();
    for (const d of detected) {
        const cat = cats[d.catId];
        if (cat && cat.enabled) desired.set(eventKey(chatId, m.slot, d.catId), { ...d, cat });
    }
    revokeKeys(p, (p.msgs[mk]?.keys || []).filter(k => !desired.has(k)), env, 'message edited or swiped', res);
    const keys = [];
    for (const [k, d] of desired) {
        if (p.awarded[k] && !p.awarded[k].revoked) { keys.push(k); continue; }
        if (!p.awarded[k] && onCooldown(awardIdx, d, m)) continue;
        const r = awardEvent(p, {
            key: k, fp: fingerprint(d.catId, m.text), chat: chatId, slot: m.slot, idx: m.idx,
            catId: d.catId, catName: d.cat.name, icon: d.cat.icon, base: d.base ?? d.cat.points, mult: d.mult ?? 1,
            intensity: d.intensity, snippet: d.snippet, chars: d.chars || [], source: d.source || 'keyword',
        }, env);
        if (r.status === 'duplicate') { res.duplicates++; continue; }
        keys.push(k);
        (r.status === 'restored' ? res.restored : res.awarded).push(r.event);
        res.bonuses.push(...(r.bonuses || []));
        if (r.status === 'awarded') (awardIdx[d.catId] ||= []).push(p.awarded[k]);
    }
    p.msgs[mk] = { h: contentHash(m.text), keys, idx: m.idx, last: env.now };
}

/**
 * Reconcile the chat with the progression.
 * @param {(m)=>object[]|null} detect detected events for a message, or null when unknown (skipped, retried later)
 * @param {object} env { now, day, settings, achievements, cats: {id: category} }
 * @param {object} opts { baseline, revokeOnDelete, skipIdx }
 */
export function reconcile(p, chatId, messages, detect, env, opts = {}) {
    const res = { awarded: [], restored: [], revoked: [], duplicates: 0, bonuses: [], baselined: 0 };
    const present = new Set();
    const awardIdx = chatAwardIndex(p, chatId);
    for (const m of messages) {
        const mk = msgKey(chatId, m.slot);
        present.add(mk);
        if (m.system || (opts.skipIdx !== undefined && m.idx === opts.skipIdx)) continue;
        const rec = p.msgs[mk];
        const h = contentHash(m.text);
        if (!rec && opts.baseline) {
            p.msgs[mk] = { h, keys: [], base: true, idx: m.idx, last: env.now };
            res.baselined++;
            continue;
        }
        if (rec && (rec.base || rec.h === h)) { rec.idx = m.idx; continue; }
        const detected = detect(m);
        if (!Array.isArray(detected)) continue;
        applyMessage(p, chatId, m, detected, env, awardIdx, res);
    }
    for (const [mk, rec] of Object.entries(p.msgs)) {
        if (!mk.startsWith(`${chatId}|`) || present.has(mk)) continue;
        if (opts.revokeOnDelete !== false) revokeKeys(p, rec.keys || [], env, 'message deleted', res);
        delete p.msgs[mk];
    }
    capObject(p.msgs, LIMITS.msgs, 'last');
    return res;
}

/** Remove baseline markers so existing history can be scanned (manual "Scan history"). */
export function clearBaseline(p, chatId) {
    let n = 0;
    for (const [mk, rec] of Object.entries(p.msgs)) {
        if (mk.startsWith(`${chatId}|`) && rec.base) { delete p.msgs[mk]; n++; }
    }
    return n;
}

/** Whether this chat has ever been seen by the progression. */
export function chatKnown(p, chatId) {
    const prefix = `${chatId}|`;
    return Object.keys(p.msgs).some(k => k.startsWith(prefix));
}

