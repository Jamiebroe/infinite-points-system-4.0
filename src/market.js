// Shop runtime: daily rotation lifecycle, purchases, purpose changes, AI restock, assistant.
import { MODULE, uid, esc, fmt, truncate, slug } from './util.js';
import { S, ready, env, dayKey, persist, updateInjection, hook, assistantSay } from './core.js';
import { ctx, toast, confirmPopup, settingSummary } from './st.js';
import { nextResetMs, fmtDuration } from './time.js';
import { generateRotation, registerRotation, closeRotation, repriceRotation, purposeKey, addMilestoneOffer, THEMES } from './shop.js';
import { purchase, useItem, finalPriceOf, ownedItems } from './inventory.js';
import { recordPurchase, recordView, recordUnaffordable, isWished, setPurpose,
    rememberProducts, topPrefs, memLog } from './memory.js';
import { matchTheme } from './catalog/index.js';
import { generateProducts, interpretPurpose, assistantComment } from './ai.js';
import { templateComment } from './context.js';
import { RARITY, explainPrice } from './pricing.js';
import { postLedger } from './model.js';

// ---------------------------------------------------------------- private assistant
/**
 * Send a System Shop assistant remark. Templates are used first (instant, offline, free);
 * when `assistant.useAi` is enabled the AI rewrites the same remark and the nicer version is
 * appended to the assistant log. Failures are swallowed – the assistant never breaks a purchase.
 */
function comment(kind, vars = {}) {
    const a = S.settings?.assistant;
    if (!a?.enabled) return;
    const text = templateComment(a.personality, kind, vars);
    if (!text) return;
    assistantSay(text, kind);
    if (a.toasts && S.settings.ui?.notifications) toast('info', text, `${a.name} · Shop assistant`);
    if (a.useAi) {
        const situation = `${text} Situation: ${Object.entries(vars).map(([k, v]) => `${k} = ${v}`).join(', ')}.`;
        assistantComment(S.settings, situation)
            .then(t => { if (t) assistantSay(t, kind); })
            .catch(e => console.warn(`[${MODULE}] assistant comment failed`, e));
    }
}

// ---------------------------------------------------------------- rotation lifecycle
/** Ensure today's rotation exists. Never regenerates an existing same-day rotation. */
export function ensureRotation({ silent = false } = {}) {
    if (!ready()) return null;
    const { shop, memory, progress } = S.st;
    const day = dayKey();
    let rot = shop.current;
    // Same day → keep the stored rotation exactly as it is (prices stay fixed until the next reset).
    if (rot && rot.day === day) return rot;
    if (rot) closeRotation(rot, memory);
    const refreshes = shop.refreshes[day] || 0;
    const pk = purposeKey(memory);
    const extra = Object.values(memory.products).filter(p => p.genDay === day && p.purposeKey === pk);
    rot = generateRotation({ m: memory, p: progress, settings: S.settings, day, refreshes, extraProducts: extra });
    rot.viewed = [];
    shop.current = rot;
    registerRotation(rot, memory);
    for (const k of Object.keys(shop.refreshes)) if (k < day) delete shop.refreshes[k];
    persist();
    if (!silent) onNewRotation(rot);
    return rot;
}

function onNewRotation(rot) {
    const { memory, shop } = S.st;
    const wished = rot.items.filter(i => isWished(memory, i.key));
    for (const w of wished) {
        const entry = memory.wishlist.find(x => x.key === w.key);
        if (entry && entry.notified !== rot.day) {
            entry.notified = rot.day;
            if (S.settings.ui.notifications) toast('success', `${w.name} is in today's Shop (${fmt(finalPriceOf(w))} ${S.settings.currencyName}).`, '⭐ Wishlist item available');
            comment('wish', { item: w.name });
        }
    }
    shop.notified[rot.day] = true;
    const rare = rot.items.find(i => i.rarity === 'premium') || rot.items.find(i => i.rarity === 'rare');
    if (rare && !wished.length) comment('rare', { item: rare.name, rarity: RARITY[rare.rarity].label.toLowerCase() });
    else if (!wished.length) comment('rotation', { items: rot.items.slice(0, 3).map(i => i.name).join(', ') });
    hook('refresh');
}

export function timeToReset() {
    const ms = nextResetMs(Date.now(), S.settings.shop.timezone, S.settings.shop.resetTime) - Date.now();
    return { ms, text: fmtDuration(ms) };
}

/** Manual refresh. Owned items are never affected; requires confirmation and respects daily limits. */
export async function manualRefresh({ skipConfirm = false } = {}) {
    if (!ready()) return false;
    const rot = ensureRotation();
    const { shop, progress } = S.st;
    const day = rot.day;
    const used = shop.refreshes[day] || 0;
    const limit = Number(S.settings.shop.manualRefreshesPerDay) || 0;
    if (used >= limit) { toast('warning', `You have used all ${limit} manual refresh(es) for today.`, 'Shop'); return false; }
    const cost = Math.max(0, Math.round(Number(S.settings.shop.manualRefreshCost) || 0));
    if (cost > progress.balance) { toast('warning', `A refresh costs ${fmt(cost)} ${S.settings.currencyName}.`, 'Shop'); return false; }
    if (!skipConfirm) {
        const ok = await confirmPopup(`<h3>Refresh today's Shop?</h3><p>Today's products will be replaced with a new selection${cost ? ` for <b>${fmt(cost)} ${esc(S.settings.currencyName)}</b>` : ''}.</p><p>✅ Your inventory, purchases, balance and wishlist are <b>not</b> affected.</p><p>Refreshes left today: ${limit - used}</p>`, 'Refresh');
        if (!ok) return false;
    }
    if (S.st.shop.current !== rot) return false;
    if (cost) postLedger(progress, 'refresh', -cost, 'Shop refresh', env());
    closeRotation(rot, S.st.memory);
    shop.refreshes[day] = used + 1;
    shop.current = null;
    const fresh = ensureRotation({ silent: true });
    await persist({ immediate: true });
    toast('success', 'The Shop has been restocked.', 'Shop');
    onNewRotation(fresh);
    return true;
}

/** Called when economy settings change: reprice today's rotation only after explicit confirmation. */
export async function onEconomyChanged() {
    if (!ready() || !S.st.shop.current) return;
    const ok = await confirmPopup('<h3>Apply new pricing to today\'s Shop?</h3><p>You changed economy settings. Prices in the current rotation stay fixed unless you apply the change now. Otherwise new prices start with the next rotation.</p>', 'Apply now', 'Next rotation');
    if (ok) {
        repriceRotation(S.st.shop.current, S.settings);
        await persist({ immediate: true });
        hook('refresh');
    }
}

// ---------------------------------------------------------------- purchases
let buying = false;

/** Purchase with confirmation. Guarded against double clicks (lock + idempotent op id). */
export async function buy(key, { skipConfirm = false } = {}) {
    if (!ready() || buying) return false;
    const rot = ensureRotation();
    const item = rot.items.find(i => i.key === key);
    if (!item) { toast('error', 'That product is no longer in the Shop.', 'Shop'); return false; }
    const price = finalPriceOf(item);
    const { progress, memory } = S.st;
    if (progress.balance < price) {
        recordUnaffordable(memory, item, rot.day);
        persist();
        toast('warning', `You need ${fmt(price - progress.balance)} more ${S.settings.currencyName} for ${item.name}.`, 'Not enough Points');
        return false;
    }
    buying = true;
    const opId = uid('op');
    try {
        if (!skipConfirm) {
            const ok = await confirmPopup(`<h3>${esc(item.icon)} Buy ${esc(item.name)}?</h3>
                <p>${esc(item.description)}</p><p><b>Effect:</b> ${esc(item.effect)}</p>
                <p><b>Price:</b> ${fmt(price)} ${esc(S.settings.currencyName)}${item.offer ? ` <s>${fmt(item.price)}</s> (${esc(item.offer.label)})` : ''}<br>
                <b>Balance after purchase:</b> ${fmt(progress.balance - price)}</p>`, `Buy for ${fmt(price)}`);
            if (!ok) return false;
        }
        if (!ready() || S.st.progress !== progress || S.st.shop.current !== rot) { toast('error', 'The chat changed – purchase cancelled. Nothing was charged.', 'Shop'); return false; }
        const res = purchase(progress, rot, key, env({ opId, wished: isWished(memory, key) }));
        if (!res.ok) { toast('warning', res.error, 'Purchase failed'); return false; }
        recordPurchase(memory, item);
        await persist({ immediate: true });
        updateInjection();
        hook('purchased', res);
        hook('bonuses', res.bonuses);
        comment('purchase', { item: item.name });
        hook('refresh');
        return true;
    } catch (e) {
        console.error(`[${MODULE}] purchase failed`, e);
        toast('error', `Purchase failed: ${e.message}`, 'Shop');
        return false;
    } finally {
        buying = false;
    }
}

export async function use(key) {
    if (!ready()) return false;
    const inv = S.st.progress.inventory[key];
    if (!inv) return false;
    const ok = await confirmPopup(`<h3>Use ${esc(inv.icon)} ${esc(inv.name)}?</h3><p>${esc(inv.effect)}</p><p>${inv.duration && inv.duration !== 'instant' ? `Lasts: ${esc(inv.duration)}. ` : ''}The AI will be told the effect is active.</p>`, 'Use');
    if (!ok || !ready()) return false;
    const res = useItem(S.st.progress, key, env());
    if (!res.ok) { toast('warning', res.error, 'Inventory'); return false; }
    await persist({ immediate: true });
    updateInjection();
    toast('success', `${inv.name} used.${res.effect ? ' Effect is now active.' : ''}`, 'Inventory');
    hook('refresh');
    return true;
}

export function viewed(key) {
    if (!ready()) return;
    const rot = S.st.shop.current;
    const item = rot?.items.find(i => i.key === key);
    if (!item) return;
    rot.viewed ||= [];
    if (!rot.viewed.includes(key)) rot.viewed.push(key);
    recordView(S.st.memory, item);
    persist();
}

export const priceExplanation = item => explainPrice(item, S.settings.economy);

/** Milestone special offers (called from award handling). */
export function milestoneOffers(bonuses) {
    if (!ready()) return;
    const rot = ensureRotation({ silent: true });
    for (const b of bonuses || []) {
        if (b.type !== 'milestone') continue;
        const item = addMilestoneOffer(rot, S.st.memory, S.st.progress, S.settings, b.id);
        if (item) {
            toast('success', `${item.name} is available at ${item.offer.pct}% off today.`, `🎁 Milestone offer: ${b.name}`);
            comment('milestone', { name: b.name });
        }
    }
}


// ---------------------------------------------------------------- shop purpose
/** Resolve free text to a purpose object (built-in theme or custom). */
export async function resolvePurpose(text) {
    const theme = matchTheme(text);
    if (theme) return { theme, label: THEMES[theme].label, custom: '' };
    const p = { theme: 'custom', label: truncate(text.replace(/\b(items?|products?|things?)\b/gi, '').trim() || text, 40), custom: text, tags: [] };
    if (S.settings.shop.useAi) {
        try {
            const r = await interpretPurpose(S.settings, text);
            Object.assign(p, { label: r.label, custom: r.summary || text, tags: r.tags });
        } catch (e) { console.warn(`[${MODULE}] purpose interpretation failed`, e); }
    }
    return p;
}

/** Change the Shop purpose. Always asks for confirmation unless `confirmed`. */
export async function changePurpose(text, { source = 'manual', confirmed = false } = {}) {
    if (!ready()) return false;
    const target = await resolvePurpose(text);
    const cur = S.st.memory.purpose;
    if (cur.theme === target.theme && (target.theme !== 'custom' || slug(cur.custom) === slug(target.custom))) {
        toast('info', `The Shop already sells ${cur.label}.`, 'Shop');
        return false;
    }
    if (!confirmed) {
        const ok = await confirmPopup(`<h3>Change the Shop's purpose?</h3>
            <p>${source === 'chat' ? 'You asked the System in chat' : 'Requested'}: <i>${esc(truncate(text, 140))}</i></p>
            <p><b>${esc(cur.label)}</b> → <b>${esc(target.label)}</b>${target.theme === 'custom' ? ' (custom)' : ''}</p>
            <p>New products will match this purpose starting with the next restock. Your inventory, balance, wishlist and other preferences are kept.</p>`,
        'Change purpose', 'Keep current');
        if (!ok) { memLog(S.st.memory, `Declined purpose change to "${target.label}"`); persist(); return false; }
    }
    if (!ready()) return false;
    setPurpose(S.st.memory, target, source === 'chat' ? 'chat command' : 'user');
    if (target.tags) S.st.memory.purpose.tags = target.tags;
    await persist({ immediate: true });
    updateInjection();
    hook('refresh');
    const restock = await confirmPopup(`<h3>Restock now?</h3><p>Restock today's Shop with <b>${esc(target.label)}</b> products now? This does not use a manual refresh. Owned items are not affected.</p>`, 'Restock now', 'Wait for next rotation');
    if (restock && ready()) await restockForPurpose();
    return true;
}

async function restockForPurpose() {
    const { shop, memory } = S.st;
    const rot = shop.current;
    if (rot) closeRotation(rot, memory);
    const day = dayKey();
    // A purpose change gives a new seed (purpose is part of it); refresh count is unchanged.
    shop.current = null;
    if (S.settings.shop.useAi) await aiRestock({ quiet: true });
    const fresh = ensureRotation({ silent: true });
    await persist({ immediate: true });
    onNewRotation(fresh);
    return day;
}

/** Generate AI products for today (validated & priced by formula), then rebuild the rotation. */
export async function aiRestock({ quiet = false, rebuild = false } = {}) {
    if (!ready() || S.restocking) return false;
    S.restocking = true;
    hook('status');
    const { memory, progress } = S.st;
    try {
        const owned = ownedItems(progress).map(i => i.name).slice(0, 30);
        const recent = memory.rotations.slice(0, 3).flatMap(r => r.keys).map(k => memory.interactions[k]?.name || memory.products[k]?.name).filter(Boolean).slice(0, 25);
        const story = (ctx().chat || []).slice(-6).map(m => `${m.name}: ${truncate(m.mes, 300)}`).join('\n');
        // World Info entries that fired in this chat keep generated products consistent with the lorebook.
        const lore = (S.lastWI || []).slice(0, 8).join('; ');
        const { accepted, rejected } = await generateProducts(S.settings, {
            purpose: memory.purpose, setting: [settingSummary(), lore ? `Active lore: ${lore}` : '', ...memory.setting.map(s => s.text)].filter(Boolean).join('\n'),
            owned, prefs: topPrefs(memory, 6).map(p => p.tag), restrictions: memory.restrictions, recentNames: recent,
            count: Math.max(2, Math.min(10, Number(S.settings.shop.aiProducts) || 6)), storyContext: story,
        });
        const day = dayKey();
        const pk = purposeKey(memory);
        for (const p of accepted) { p.genDay = day; p.purposeKey = pk; }
        rememberProducts(memory, accepted);
        memLog(memory, `AI generated ${accepted.length} product(s) for ${memory.purpose.label}${rejected.length ? `, rejected ${rejected.length} invalid` : ''}`);
        if (!quiet) toast(accepted.length ? 'success' : 'warning', `${accepted.length} new product(s) passed validation${rejected.length ? `, ${rejected.length} rejected` : ''}.`, 'AI Restock');
        if (rebuild && S.st.shop.current?.day === day) {
            closeRotation(S.st.shop.current, memory);
            S.st.shop.current = null;
            const fresh = ensureRotation({ silent: true });
            onNewRotation(fresh);
        }
        await persist({ immediate: true });
        return accepted.length > 0;
    } catch (e) {
        console.warn(`[${MODULE}] AI restock failed`, e);
        toast('warning', `AI product generation failed (${truncate(e.message, 80)}). The built-in catalog is used instead; your data is unchanged.`, 'AI Restock');
        return false;
    } finally {
        S.restocking = false;
        hook('status');
        hook('refresh');
    }
}

