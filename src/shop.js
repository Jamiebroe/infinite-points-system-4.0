// Daily rotation engine (pure, deterministic). Same inputs → same rotation, so reloads are stable;
// the generated rotation is also persisted, so it never changes until the next reset.
import { seededRng, pickWeightedIndex, hash, slug, clamp } from './util.js';
import { RARITY, computePrice, discounted, priceBand, isPermanentType, economyFactors, BASELINE_DAILY } from './pricing.js';
import { catalog, allCatalogProducts, THEMES, tagsForText, matchTheme } from './catalog/index.js';
import { levelFor, levelAllows } from './content.js';
import { averageDailyEarnings } from './model.js';
import { recordRotation, recordRotationEnd } from './memory.js';
import { daysBetween } from './time.js';

export const econHash = s => hash(JSON.stringify(s?.economy || {}));

export function purposeKey(m) {
    const pu = m.purpose || {};
    return pu.theme === 'custom' ? `custom:${slug(pu.custom || pu.label)}` : (pu.theme || 'general');
}

/** Expected daily earnings – used ONLY to choose a sensible mix of price bands, never to set prices. */
export function expectedDaily(p, settings) {
    return averageDailyEarnings(p) ?? BASELINE_DAILY * economyFactors(settings?.economy).earn;
}

function restrictedBy(prod, words) {
    if (!words?.length) return null;
    const hay = ` ${[prod.name, prod.category, ...(prod.tags || []), prod.description, prod.effect].join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
    return words.find(w => hay.includes(` ${w.replace(/-/g, ' ')} `) || hay.includes(` ${w.replace(/-/g, ' ')}s `)) || null;
}

/** Highest owned tier per family for permanent-type products. */
function ownedFamilies(p) {
    const fam = {};
    for (const it of Object.values(p.inventory || {})) {
        if (it.qty > 0 && isPermanentType(it.type) && it.family) fam[it.family] = Math.max(fam[it.family] || 0, it.tier || 1);
    }
    return fam;
}

export function isAllowed(prod, m, p, fam = ownedFamilies(p)) {
    if (restrictedBy(prod, m.restrictions)) return false;
    // Level gate: the rare and expensive end of the catalogue only opens up as XP accumulates.
    if (!levelAllows(p.xp, prod.rarity)) return false;
    if (isPermanentType(prod.type)) {
        if ((p.inventory?.[prod.key]?.qty || 0) > 0) return false;
        if (fam[prod.family] && (prod.tier || 1) <= fam[prod.family]) return false;
    }
    return true;
}

/** Candidate pool with formula prices. Primary = matches purpose; secondary = everything else. */
export function buildPool(m, p, settings) {
    const pk = purposeKey(m);
    const cat = catalog();
    const byKey = new Map();
    const add = (prod, primary) => {
        if (!prod?.key) return;
        const prev = byKey.get(prod.key);
        if (prev && prev.primary) return;
        byKey.set(prod.key, { ...prod, primary, price: computePrice(prod, settings.economy) });
    };
    const custom = m.purpose.theme === 'custom';
    const customTags = custom ? new Set([...tagsForText(m.purpose.custom || m.purpose.label), ...(m.purpose.tags || [])]) : null;
    const customTheme = custom ? matchTheme(m.purpose.custom || m.purpose.label) : null;
    for (const [theme, list] of Object.entries(cat)) {
        for (const prod of list) {
            let primary = !custom && theme === pk;
            if (custom) primary = theme === customTheme || (prod.tags || []).some(t => customTags.has(t));
            add(prod, primary);
        }
    }
    for (const prod of Object.values(m.products || {})) add(prod, prod.theme === pk);
    return [...byKey.values()];
}

// ---------------------------------------------------------------- weighting
function ownedTags(p) {
    const tags = {};
    for (const it of Object.values(p.inventory || {})) if (it.qty > 0) for (const t of it.tags || []) tags[t] = (tags[t] || 0) + 1;
    return tags;
}

function recentDays(m, key, day) {
    const s = m.seen[key];
    return s?.lastDay ? daysBetween(s.lastDay, day) : Infinity;
}

/** Selection weight + the main reason the product is being considered. */
export function weigh(prod, ctx) {
    const { m, fam, otags, day } = ctx;
    let w = (RARITY[prod.rarity] || RARITY.common).weight * (prod.primary ? 4 : 0.2);
    // Higher levels make the rare and premium end of the catalogue show up more often.
    const boost = ctx.tier?.rareBoost || 1;
    if (boost > 1 && (prod.rarity === 'rare' || prod.rarity === 'premium')) w *= boost;
    let reason = prod.primary ? 'theme' : 'variety';
    let pref = 0;
    for (const t of [...(prod.tags || []), prod.category]) pref += m.prefs[slug(t)]?.score || 0;
    w *= Math.max(0.1, 1 + clamp(pref, -10, 30) * 0.06);
    if (pref >= 4) reason = 'preference';
    if ([...(prod.tags || []), prod.category].some(t => m.locked.includes(slug(t)))) { w *= 2; reason = 'locked'; }
    if (isPermanentType(prod.type) && fam[prod.family] && (prod.tier || 1) === fam[prod.family] + 1) { w *= 3; reason = 'upgrade'; }
    else if ((prod.tags || []).some(t => otags[t])) { w *= 1.35; if (reason === 'theme') reason = 'complement'; }
    const ago = recentDays(m, prod.key, day);
    if (ago <= 1) w *= 0.2; else if (ago <= 3) w *= 0.5;
    const it = m.interactions[prod.key];
    if (it) {
        w /= 1 + (it.ignored || 0) * 0.3;
        if (!isPermanentType(prod.type) && it.buys) { w *= 1.3; if (reason === 'theme') reason = 'favourite'; }
    }
    return { w: Math.max(0.0001, w), reason };
}

function takeWeighted(rng, cands, ctx, chosen, filter = () => true) {
    const list = cands.filter(c => !chosen.has(c.key) && filter(c));
    if (!list.length) return null;
    const ws = list.map(c => weigh(c, ctx));
    const i = pickWeightedIndex(rng, ws.map(x => x.w));
    if (i < 0) return null;
    return { prod: list[i], reason: ws[i].reason };
}

function stockFor(rng, prod) {
    if (isPermanentType(prod.type)) return null;
    if (prod.rarity === 'premium') return 1;
    if (prod.rarity === 'rare') return rng() < 0.6 ? 1 + Math.floor(rng() * 2) : null;
    return rng() < 0.25 ? 2 + Math.floor(rng() * 4) : null;
}


const REASON_TEXT = {
    theme: 'Fits the Shop purpose',
    variety: 'Something different for variety',
    preference: 'Matches your remembered preferences',
    locked: 'From a locked preferred category',
    upgrade: 'Upgrades an ability you already own',
    complement: 'Complements items you own',
    favourite: 'You have bought this before',
    comeback: 'Back again – you wanted it but couldn\'t afford it',
    wish: 'On your wishlist',
    surprise: 'A surprising find',
    milestone: 'Special offer for reaching a milestone',
    story: 'Generated for your current story',
};
export const reasonText = r => REASON_TEXT[r] || '';

function seedPicks(rng, pool, m, day, size, extraProducts, chosen) {
    for (const x of extraProducts.slice(0, Math.ceil(size / 2))) {
        const prod = pool.find(c => c.key === x.key);
        if (prod) chosen.set(prod.key, { prod, reason: 'story' });
    }
    const wish = m.wishlist.map(w => pool.find(c => c.key === w.key)).filter(c => c && !chosen.has(c.key));
    if (wish.length && rng() < 0.5) {
        const w = wish[Math.floor(rng() * wish.length)];
        chosen.set(w.key, { prod: w, reason: 'wish' });
    }
    const comeback = Object.keys(m.unaffordable).map(k => pool.find(c => c.key === k))
        .filter(c => c && !chosen.has(c.key) && recentDays(m, c.key, day) >= 2);
    if (comeback.length && rng() < 0.55) {
        const c = comeback[Math.floor(rng() * comeback.length)];
        chosen.set(c.key, { prod: c, reason: 'comeback' });
    }
}

/**
 * Generate the rotation for a shop day.
 * @returns {{day, seed, purpose, purposeLabel, econ, created, refreshes, items: object[]}}
 */
export function generateRotation({ m, p, settings, day, refreshes = 0, now = Date.now(), extraProducts = [] }) {
    const seed = `${m.id}|${day}|${refreshes}|${purposeKey(m)}`;
    const rng = seededRng(seed);
    const fam = ownedFamilies(p);
    const ctx = { m, fam, otags: ownedTags(p), day, tier: levelFor(p.xp) };
    const extras = extraProducts.map(x => ({ ...x, primary: true, price: computePrice(x, settings.economy) }));
    const pool = [...buildPool(m, p, settings).filter(c => !extras.some(x => x.key === c.key)), ...extras].filter(x => isAllowed(x, m, p, fam));
    const size = clamp(Math.round(settings.shop?.size ?? 8), 4, 16);
    const daily = expectedDaily(p, settings);
    const bandOf = c => priceBand(c.price, daily);
    const chosen = new Map();
    const pick = (filter, reasonOverride) => {
        const r = takeWeighted(rng, pool, ctx, chosen, filter);
        if (r) chosen.set(r.prod.key, { prod: r.prod, reason: reasonOverride || r.reason });
        return r;
    };

    seedPicks(rng, pool, m, day, size, extras, chosen);
    for (const lc of m.locked) if (chosen.size < size) pick(c => [...(c.tags || []), c.category].map(slug).includes(lc), 'locked');
    for (const [b, n] of [['affordable', 3], ['moderate', 2], ['aspirational', 1]]) {
        let have = [...chosen.values()].filter(x => bandOf(x.prod) === b).length;
        while (have < n && chosen.size < size) {
            if (!pick(c => c.primary && bandOf(c) === b) && !pick(c => bandOf(c) === b)) break;
            have++;
        }
    }
    if (chosen.size < size && rng() < (settings.shop?.surpriseChance ?? 0.35)) pick(c => !c.primary, 'surprise');
    while (chosen.size < size) if (!pick(c => c.primary) && !pick(() => true)) break;

    const items = [...chosen.values()].slice(0, size).map(({ prod, reason }) => ({
        ...prod, reason, band: bandOf(prod), stock: stockFor(rng, prod), sold: 0, offer: null,
    }));
    const offerable = items.filter(i => i.rarity !== 'premium');
    const pct = clamp(settings.shop?.dailyOfferDiscount ?? 25, 0, 90);
    if (offerable.length && pct > 0) {
        const o = offerable[Math.floor(rng() * offerable.length)];
        o.offer = { pct, price: discounted(o.price, pct), label: 'Daily Special' };
    }
    return { day, seed, purpose: purposeKey(m), purposeLabel: m.purpose.label, econ: econHash(settings), created: now, refreshes, items: sortItems(items) };
}

export function sortItems(items) {
    const order = { common: 0, uncommon: 1, rare: 2, premium: 3 };
    return items.sort((a, b) => (order[a.rarity] - order[b.rarity]) || a.price - b.price);
}


/** Add a milestone special offer to an existing rotation (idempotent per milestone). */
export function addMilestoneOffer(rot, m, p, settings, milestoneId) {
    if (!rot || rot.items.some(i => i.offer?.milestone === milestoneId)) return null;
    const rng = seededRng(`${rot.seed}|${milestoneId}`);
    const fam = ownedFamilies(p);
    const pool = buildPool(m, p, settings).filter(c => c.primary && !rot.items.some(i => i.key === c.key)
        && isAllowed(c, m, p, fam) && (c.rarity === 'rare' || c.rarity === 'uncommon'));
    if (!pool.length) return null;
    const prod = pool[Math.floor(rng() * pool.length)];
    const item = {
        ...prod, reason: 'milestone', band: priceBand(prod.price, expectedDaily(p, settings)), stock: 1, sold: 0,
        offer: { pct: 30, price: discounted(prod.price, 30), label: 'Milestone Offer', milestone: milestoneId },
    };
    rot.items.push(item);
    return item;
}

/** Re-price a rotation – only called when the user explicitly changed economy settings. */
export function repriceRotation(rot, settings) {
    for (const i of rot.items) {
        i.price = computePrice(i, settings.economy);
        if (i.offer) i.offer.price = discounted(i.price, i.offer.pct);
    }
    rot.econ = econHash(settings);
    return rot;
}

/** Close a rotation into memory (shown-but-ignored products). */
export function closeRotation(rot, m) {
    if (!rot || rot.closed) return;
    recordRotationEnd(m, rot.items, new Set(rot.viewed || []), new Set(rot.items.filter(i => i.sold > 0).map(i => i.key)));
    rot.closed = true;
}

export function registerRotation(rot, m) {
    recordRotation(m, rot.day, rot.items.map(i => i.key), rot.seed);
}


/** Recommendations: products from the pool that complement ownership/preferences, with reasons. */
export function recommend(m, p, settings, rot, n = 4) {
    const fam = ownedFamilies(p);
    const ctx = { m, fam, otags: ownedTags(p), day: rot?.day || '', tier: levelFor(p.xp) };
    const inShop = new Set((rot?.items || []).map(i => i.key));
    return buildPool(m, p, settings)
        .filter(c => isAllowed(c, m, p, fam))
        .map(c => ({ c, ...weigh(c, ctx) }))
        .filter(x => ['upgrade', 'complement', 'preference', 'locked', 'favourite'].includes(x.reason))
        .sort((a, b) => b.w - a.w)
        .slice(0, n)
        .map(x => ({ product: x.c, reason: x.reason, why: reasonText(x.reason), inShop: inShop.has(x.c.key) }));
}

export { THEMES, allCatalogProducts };

