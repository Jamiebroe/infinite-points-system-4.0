// Purchases & inventory (pure). Every purchase is an idempotent operation (opId): retrying the
// same click / double click can never deduct twice.
import { uid, capFront, capObject } from './util.js';
import { postLedger, checkProgress, LIMITS } from './model.js';
import { isPermanentType } from './pricing.js';

export const MAX_STACK = 99;

/** Price actually charged (offer price when a special offer applies). */
export function finalPriceOf(item) {
    return Math.round(item?.offer ? item.offer.price : item?.price);
}

/**
 * Buy an item from the current rotation.
 * @param {object} p progression
 * @param {object} rot current rotation (mutated: sold count)
 * @param {string} key product key
 * @param {object} env { now, day, settings, achievements, opId, wished }
 * @returns {{ok:boolean, error?:string, code?:string, entry?:object, item?:object, price?:number, bonuses?:object[]}}
 */
export function purchase(p, rot, key, env) {
    if (env.opId && p.ops[env.opId]) return { ok: false, code: 'duplicate', error: 'This purchase was already processed.' };
    const item = rot?.items?.find(i => i.key === key);
    if (!item) return { ok: false, code: 'missing', error: 'That product is not in today\'s Shop.' };
    if (item.stock !== null && item.stock !== undefined && item.sold >= item.stock) return { ok: false, code: 'soldout', error: `${item.name} is sold out for today.` };
    const owned = p.inventory[key];
    if (isPermanentType(item.type) && owned?.qty > 0) return { ok: false, code: 'owned', error: `You already own ${item.name}.` };
    if (!isPermanentType(item.type) && (owned?.qty || 0) >= MAX_STACK) return { ok: false, code: 'stack', error: `You can't carry more than ${MAX_STACK} of ${item.name}.` };
    const price = finalPriceOf(item);
    if (!Number.isFinite(price) || price < 0) return { ok: false, code: 'price', error: 'Invalid price.' };
    if (p.balance < price) return { ok: false, code: 'funds', error: `Not enough Points: ${item.name} costs ${price}, you have ${p.balance}.` };

    // --- commit (all-or-nothing: no awaits, no throws below) ---
    const entry = postLedger(p, 'purchase', -price, `Bought ${item.icon || ''} ${item.name}${item.offer ? ` (${item.offer.label} −${item.offer.pct}%)` : ''}`.trim(), env, key);
    const inv = p.inventory[key] ||= {
        key, name: item.name, icon: item.icon, type: item.type, duration: item.duration, rarity: item.rarity,
        power: item.power, utility: item.utility, uses: item.uses || 1, description: item.description, effect: item.effect,
        tags: item.tags || [], category: item.category, family: item.family, tier: item.tier || 1, theme: item.theme,
        qty: 0, charges: 0, acquired: env.now, lastPrice: price, history: [],
    };
    inv.qty += 1;
    if (!isPermanentType(item.type)) inv.charges += Math.max(1, item.uses || 1);
    inv.lastPrice = price;
    inv.history.unshift({ ts: env.now, price, tx: entry.id });
    capFront(inv.history, 20);
    item.sold = (item.sold || 0) + 1;
    p.stats.purchases++;
    if (item.rarity === 'rare' || item.rarity === 'premium') p.stats.rareBuy++;
    if (item.rarity === 'premium') p.stats.premiumBuy++;
    if (env.wished) p.stats.wishBuy++;
    if (env.opId) { p.ops[env.opId] = { ts: env.now, tx: entry.id }; capObject(p.ops, 500, 'ts'); }
    return { ok: true, entry, item: inv, price, bonuses: checkProgress(p, env) };
}

/** Use a consumable / service charge. Starts a timed effect when the duration is not instant. */
export function useItem(p, key, env) {
    const inv = p.inventory[key];
    if (!inv || inv.qty <= 0) return { ok: false, error: 'You do not own that item.' };
    if (isPermanentType(inv.type)) return { ok: false, error: `${inv.name} is permanent and always active.` };
    if (inv.charges <= 0) return { ok: false, error: 'No uses left.' };
    inv.charges -= 1;
    const perUnit = Math.max(1, inv.uses || 1);
    inv.qty = Math.ceil(inv.charges / perUnit);
    p.stats.used++;
    let effect = null;
    if (inv.duration && inv.duration !== 'instant') {
        const msgs = { scene: env.settings?.effects?.sceneMessages ?? 12, day: env.settings?.effects?.dayMessages ?? 40, week: env.settings?.effects?.weekMessages ?? 200 }[inv.duration] ?? 12;
        effect = { id: uid('fx'), key, name: inv.name, icon: inv.icon, effect: inv.effect, started: env.now, startCount: env.msgCount ?? 0, messages: msgs, chat: env.chatId || '' };
        p.effects.unshift(effect);
        capFront(p.effects, LIMITS.effects);
    }
    postLedger(p, 'use', 0, `Used ${inv.icon || ''} ${inv.name}`.trim(), env, key);
    if (inv.qty <= 0) inv.depleted = env.now;
    return { ok: true, item: inv, effect };
}

/** Effects still active given the current chat message count. */
export function activeEffects(p, chatId, msgCount) {
    return p.effects.filter(e => !e.ended && (!e.chat || e.chat === chatId) && msgCount - (e.startCount ?? 0) < e.messages);
}

/** Mark expired effects; returns those that just expired. */
export function expireEffects(p, chatId, msgCount, now) {
    const out = [];
    for (const e of p.effects) {
        if (e.ended || (e.chat && e.chat !== chatId)) continue;
        if (msgCount - (e.startCount ?? 0) >= e.messages) { e.ended = now; out.push(e); }
    }
    return out;
}

export function endEffect(p, id, now) {
    const e = p.effects.find(x => x.id === id);
    if (e && !e.ended) { e.ended = now; return e; }
    return null;
}

/** Owned items grouped for display / AI context. */
export function ownedItems(p) {
    return Object.values(p.inventory).filter(i => i.qty > 0);
}
