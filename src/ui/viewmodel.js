// Pure view-model builders for the System interface.
// No DOM and no SillyTavern imports → fully unit-testable in Node (tests/viewmodel.test.mjs).
// Every number the interface shows is computed here so the UI layer only renders.
import { fmt, slug, truncate, clamp } from '../util.js';
import { RARITY, DURATION, TYPE, isPermanentType, priceBand, explainPrice, computePrice, DIFFICULTY } from '../pricing.js';
import { finalPriceOf, activeEffects, ownedItems } from '../inventory.js';
import { averageDailyEarnings, metric } from '../model.js';
import { topPrefs } from '../memory.js';
import { when, fmtDuration } from '../time.js';
import { LEVELS } from '../content.js';
import { sexStats, sexTotals } from '../stats.js';

// ---------------------------------------------------------------- formatting helpers
export const LABELS = {
    kind: {
        event: 'Event reward', restore: 'Restored event', revoke: 'Revoked event', purchase: 'Purchase',
        refund: 'Refund', adjust: 'Correction', manual: 'Manual correction', milestone: 'Milestone bonus',
        achievement: 'Achievement bonus', refresh: 'Shop refresh', use: 'Item used',
    },
    band: { affordable: 'Affordable', moderate: 'Moderate', aspirational: 'Aspirational' },
    reason: {
        theme: 'Fits the Shop purpose', variety: 'Something different', preference: 'Matches your preferences',
        locked: 'Locked preferred category', upgrade: 'Upgrades something you own', complement: 'Complements your items',
        favourite: 'Bought before', comeback: 'Back again after being unaffordable', wish: 'On your wishlist',
        surprise: 'A surprising find', milestone: 'Milestone offer', story: 'Generated for your story',
    },
    source: { keyword: 'keyword rules', ai: 'AI analysis', catalog: 'built-in catalog', manual: 'manual entry' },
};

export const kindLabel = k => LABELS.kind[k] || k;
export const bandLabel = b => LABELS.band[b] || b;
export const reasonLabel = r => LABELS.reason[r] || '';

export const signed = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;
export const pct = (a, b) => (b > 0 ? clamp(Math.round((a / b) * 100), 0, 100) : 0);
export const typeLabel = p => (TYPE[p?.type]?.label || p?.type || '—');
export const durationLabel = p => (isPermanentType(p?.type) ? 'Permanent' : DURATION[p?.duration]?.label || p?.duration || '—');
export const rarityLabel = p => (RARITY[p?.rarity]?.label || p?.rarity || 'Common');
export const rarityRank = r => ({ common: 0, uncommon: 1, rare: 2, premium: 3 }[r] ?? 0);

/** Sparkline series (0-100 heights) for CSS bar charts. */
export function series(values, buckets = 14) {
    const vals = (values || []).slice(-buckets).map(v => Number(v) || 0);
    const max = Math.max(1, ...vals);
    return vals.map(v => ({ value: v, height: Math.round((v / max) * 100) }));
}

// ---------------------------------------------------------------- Level & Shop unlocks
// LEVELS lives in content.js because it doubles as the Shop's rarity gate (shop.js reads it too).
export { LEVELS };

/**
 * Level progress for the interface, derived from cumulative XP. XP is never spent, so this only
 * ever moves forward.
 */
export function levelModel(xp = 0) {
    const total = Math.max(0, Number(xp) || 0);
    let idx = 0;
    for (let i = 0; i < LEVELS.length; i++) if (total >= LEVELS[i].min) idx = i;
    const cur = LEVELS[idx], next = LEVELS[idx + 1] || null;
    return {
        level: cur.level, name: cur.name, icon: cur.icon,
        xp: total,
        rarities: cur.rarities, rareBoost: cur.rareBoost,
        next: next?.name || null, nextLevel: next?.level ?? null, nextAt: next?.min ?? null,
        toNext: next ? Math.max(0, next.min - total) : 0,
        progress: next ? pct(total - cur.min, next.min - cur.min) : 100,
        unlocksAtNext: next ? next.rarities.filter(r => !cur.rarities.includes(r)) : [],
        maxed: !next,
    };
}

// ---------------------------------------------------------------- economy snapshot
export function economyModel({ settings, progress }) {
    const avg = averageDailyEarnings(progress);
    const earn = Number(settings?.economy?.earnRate ?? 1) || 1;
    const diff = DIFFICULTY[settings?.economy?.difficulty] || DIFFICULTY.normal;
    const baseline = Math.round(250 * diff.earn * earn);
    return {
        difficulty: diff.label,
        priceMultiplier: Number(settings?.economy?.priceMultiplier ?? 1),
        earnRate: earn,
        expectedDaily: Math.round(avg ?? baseline),
        measured: avg !== null,
        measuredDays: Object.keys(progress?.daily || {}).length,
        spent: progress?.spent || 0,
        lifetime: progress?.lifetime || 0,
        balance: progress?.balance || 0,
    };
}

/** Price of a hypothetical product under the current economy settings (used by the Settings tab). */
export function pricePreview(sample, economy) {
    if (!sample) return null;
    const price = computePrice(sample, economy);
    return { price, priceText: fmt(price), why: explainPrice(sample, economy) };
}

// ---------------------------------------------------------------- overview
export function overviewModel({ settings, progress, memory, rotation, resetMs = 0, aiStatus = '', now = Date.now(), achievementsTotal = 0 }) {
    const owned = ownedItems(progress);
    const effects = activeEffects(progress, '', 0);
    const today = progress.daily?.[rotation?.day || ''] || 0;
    const econ = economyModel({ settings, progress });
    const events = Object.values(progress.counts || {}).reduce((s, c) => s + (c.count || 0), 0);
    const items = rotation?.items || [];
    return {
        systemName: settings?.systemName || 'The System',
        currency: settings?.currencyName || 'Points',
        balance: progress?.balance || 0,
        lifetime: progress?.lifetime || 0,
        spent: progress?.spent || 0,
        earnedToday: today,
        expectedDaily: econ.expectedDaily,
        level: levelModel(progress?.xp || 0),
        events,
        categoriesUsed: Object.values(progress.counts || {}).filter(c => c.count > 0).length,
        purchases: progress?.stats?.purchases || 0,
        owned: {
            total: owned.length,
            permanent: owned.filter(i => i.type === 'permanent').length,
            equipment: owned.filter(i => i.type === 'equipment').length,
            consumable: owned.filter(i => i.type === 'consumable').length,
            service: owned.filter(i => i.type === 'service').length,
        },
        effects: effects.length,
        achievements: { unlocked: Object.keys(progress.achievements || {}).length, total: achievementsTotal },
        shop: {
            day: rotation?.day || '',
            size: items.length,
            affordable: items.filter(i => finalPriceOf(i) <= (progress?.balance || 0)).length,
            soldOut: items.filter(i => i.stock !== null && i.stock !== undefined && i.sold >= i.stock).length,
            purpose: memory?.purpose?.label || 'General Depravity',
            resetMs,
            wishlistInShop: (memory?.wishlist || []).filter(w => items.some(i => i.key === w.key)).length,
        },
        aiStatus,
        now,
    };
}

// ---------------------------------------------------------------- shop
export function shopItemModel(item, { settings, progress, memory, daily, now = Date.now() } = {}) {
    const price = finalPriceOf(item);
    const owned = progress?.inventory?.[item.key];
    const permanent = isPermanentType(item.type);
    const soldOut = item.stock !== null && item.stock !== undefined && item.sold >= item.stock;
    const wished = (memory?.wishlist || []).some(w => w.key === item.key);
    const affordable = (progress?.balance || 0) >= price;
    const band = item.band || priceBand(price, daily);
    return {
        key: item.key,
        name: item.name,
        icon: item.icon || '✦',
        description: item.description,
        effect: item.effect,
        type: item.type,
        typeLabel: typeLabel(item),
        duration: item.duration,
        durationLabel: durationLabel(item),
        showDuration: !isPermanentType(item.type),
        rarity: item.rarity,
        rarityLabel: rarityLabel(item),
        rarityRank: rarityRank(item.rarity),
        power: item.power,
        utility: item.utility,
        uses: item.uses,
        realityAltering: !!item.realityAltering,
        tags: item.tags || [],
        theme: item.theme,
        source: item.source,
        sourceLabel: LABELS.source[item.source] || item.source || '—',
        family: item.family,
        tier: item.tier,
        price,
        priceText: fmt(price),
        listPrice: item.price,
        listPriceText: fmt(item.price),
        offer: item.offer || null,
        offerLabel: item.offer ? `${item.offer.label} −${item.offer.pct}%` : '',
        stock: item.stock,
        sold: item.sold || 0,
        stockLabel: item.stock === null || item.stock === undefined ? 'Unlimited' : soldOut ? 'Sold out' : `${item.stock - (item.sold || 0)} left`,
        soldOut,
        owned: (owned?.qty || 0) > 0,
        ownedQty: owned?.qty || 0,
        charges: owned?.charges || 0,
        alreadyOwned: permanent && (owned?.qty || 0) > 0,
        affordable,
        canBuy: !soldOut && affordable && !(permanent && (owned?.qty || 0) > 0),
        wished,
        band,
        bandLabel: bandLabel(band),
        why: reasonLabel(item.reason),
        reason: item.reason || '',
        priceWhy: explainPrice(item, settings?.economy),
        updated: now,
    };
}

export function shopModel({ settings, progress, memory, rotation, resetMs = 0, now = Date.now() }) {
    const daily = averageDailyEarnings(progress) ?? 250;
    const items = (rotation?.items || []).map(i => shopItemModel(i, { settings, progress, memory, daily, now }));
    return {
        day: rotation?.day || '',
        purpose: {
            theme: memory?.purpose?.theme || 'general',
            label: memory?.purpose?.label || 'General Depravity',
            custom: memory?.purpose?.custom || '',
            setBy: memory?.purpose?.setBy || 'default',
            since: memory?.purpose?.ts || 0,
        },
        resetMs,
        refreshes: rotation?.refreshes || 0,
        viewed: rotation?.viewed || [],
        items,
        affordable: items.filter(i => i.canBuy).length,
        wishlist: (memory?.wishlist || []).filter(w => items.some(i => i.key === w.key)).map(w => w.key),
        banned: (memory?.restrictions || []).slice(),
        economy: economyModel({ settings, progress }),
        balance: progress?.balance || 0,
        currency: settings?.currencyName || 'Points',
        empty: items.length === 0,
    };
}

// ---------------------------------------------------------------- inventory
export function inventoryItemModel(inv, { settings, chatId, msgCount = 0, effects = [] } = {}) {
    const permanent = isPermanentType(inv.type);
    const live = (effects || []).filter(e => !e.ended && e.key === inv.key);
    return {
        key: inv.key,
        name: inv.name,
        icon: inv.icon || '✦',
        description: inv.description,
        effect: inv.effect,
        type: inv.type,
        typeLabel: typeLabel(inv),
        duration: inv.duration,
        durationLabel: durationLabel(inv),
        showDuration: !isPermanentType(inv.type),
        rarity: inv.rarity,
        rarityLabel: rarityLabel(inv),
        rarityRank: rarityRank(inv.rarity),
        power: inv.power,
        utility: inv.utility,
        uses: inv.uses || 1,
        tags: inv.tags || [],
        theme: inv.theme,
        family: inv.family,
        tier: inv.tier,
        qty: inv.qty,
        charges: inv.charges || 0,
        permanent,
        usable: !permanent && (inv.charges || 0) > 0,
        lastPrice: inv.lastPrice,
        lastPriceText: fmt(inv.lastPrice || 0),
        acquiredText: when(inv.acquired),
        history: (inv.history || []).map(h => ({ ts: h.ts, whenText: when(h.ts), priceText: fmt(h.price) })),
        active: live.length > 0,
        activeLabel: live.length ? `${Math.max(0, live[0].messages - (msgCount - (live[0].startCount ?? 0)))} messages left` : '',
    };
}

export function inventoryModel({ settings, progress, chatId, msgCount = 0 }) {
    const effects = activeEffects(progress, chatId, msgCount);
    const groups = [
        { id: 'permanent', label: 'Permanent abilities', icon: '💠', items: [] },
        { id: 'equipment', label: 'Equipment', icon: '🎽', items: [] },
        { id: 'consumable', label: 'Consumables', icon: '🧪', items: [] },
        { id: 'service', label: 'Services', icon: '📜', items: [] },
    ];
    for (const inv of ownedItems(progress)) {
        const model = inventoryItemModel(inv, { settings, chatId, msgCount, effects });
        (groups.find(g => g.id === model.type) || groups[2]).items.push(model);
    }
    for (const g of groups) g.items.sort((a, b) => b.power - a.power || a.name.localeCompare(b.name));
    return {
        groups: groups.filter(g => g.items.length),
        empty: groups.every(g => !g.items.length),
        total: groups.reduce((s, g) => s + g.items.length, 0),
        effects: effects.map(e => ({
            id: e.id, key: e.key, name: e.name, icon: e.icon, effect: e.effect,
            startedText: when(e.started),
            remaining: Math.max(0, e.messages - (msgCount - (e.startCount ?? 0))),
            total: e.messages,
            progress: pct(msgCount - (e.startCount ?? 0), e.messages),
        })),
        currency: settings?.currencyName || 'Points',
    };
}

// ---------------------------------------------------------------- statistics
function memoryStats(memory) {
    const m = memory || {};
    return {
        purpose: m.purpose?.label || '—',
        preferences: Object.keys(m.prefs || {}).length,
        locked: (m.locked || []).length,
        restrictions: (m.restrictions || []).length,
        wishlist: (m.wishlist || []).length,
        tracked: Object.keys(m.interactions || {}).length,
        remembered: Object.keys(m.products || {}).length,
        rotations: (m.rotations || []).length,
        settingNotes: (m.setting || []).length,
        interests: (m.interests || []).length,
        topPrefs: topPrefs(m, 6).map(p => ({ tag: p.tag, score: p.score, locked: !!p.locked, source: p.source })),
    };
}

export function statsModel({ settings, progress, memory, achievements = [] }) {
    const econ = economyModel({ settings, progress });
    const counts = Object.values(progress?.counts || {});
    const totalEvents = counts.reduce((s, c) => s + (c.count || 0), 0);
    const totalEventPoints = counts.reduce((s, c) => s + (c.points || 0), 0);
    const dailyKeys = Object.keys(progress?.daily || {}).sort();
    const recentDays = dailyKeys.slice(-14);
    const categories = counts.map(c => ({
        name: c.name || 'Unknown', count: c.count || 0, points: c.points || 0,
        share: pct(c.points || 0, Math.max(1, totalEventPoints)),
        icon: (settings?.categories || []).find(x => x.name === c.name)?.icon || '•',
        lastText: when(c.last),
    })).sort((a, b) => b.points - a.points);
    const characters = Object.entries(progress?.characters || {}).map(([name, c]) => ({
        name, count: c.count || 0, points: c.points || 0, lastText: when(c.last),
        cats: Object.entries(c.cats || {}).map(([catId, n]) => ({ catId, n })).sort((a, b) => b.n - a.n).slice(0, 3),
        recent: (c.recent || []).slice(0, 3).map(r => ({ ts: r.ts, whenText: when(r.ts), catName: r.catName, points: r.points, snippet: truncate(r.snippet, 120) })),
    })).sort((a, b) => b.points - a.points);
    const sexRows = sexStats(progress, settings?.user?.gender);
    const sexMax = Math.max(1, ...sexRows.map(r => r.count));
    return {
        cards: [
            { label: 'Current balance', value: fmt(progress?.balance || 0), hint: settings?.currencyName || 'Points' },
            { label: 'Lifetime earned', value: fmt(progress?.lifetime || 0), hint: `${econ.measured ? 'measured' : 'baseline'} ≈ ${fmt(econ.expectedDaily)}/day` },
            { label: 'Points spent', value: fmt(progress?.spent || 0), hint: `${progress?.stats?.purchases || 0} purchases` },
            { label: 'Events rewarded', value: fmt(totalEvents), hint: `${categories.length} categories used` },
            { label: 'Purchases', value: fmt(progress?.stats?.purchases || 0), hint: `${progress?.stats?.rareBuy || 0} rare · ${progress?.stats?.premiumBuy || 0} premium` },
            { label: 'Items used', value: fmt(progress?.stats?.used || 0), hint: `${progress?.stats?.wishBuy || 0} from wishlist` },
            { label: 'Achievements', value: `${Object.keys(progress?.achievements || {}).length}/${achievements.length}`, hint: 'unlocked' },
            { label: 'Active effects', value: fmt(activeEffects(progress, '', 0).length), hint: 'running now' },
        ],
        categories,
        characters,
        daily: recentDays.map(d => ({ day: d, value: progress.daily[d] })),
        dailySeries: series(recentDays.map(d => progress.daily[d]), 14),
        memory: memoryStats(memory),
        economy: econ,
        sex: sexRows.map(r => ({ ...r, share: pct(r.count, sexMax) })),
        sexTotals: sexTotals(progress),
        totalEvents,
        totalEventPoints,
    };
}

// ---------------------------------------------------------------- achievements & milestones
export function achievementModel({ settings, progress, achievements = [] }) {
    const rows = achievements.map(a => {
        const current = metric(progress, a.cond);
        return {
            id: a.id, icon: a.icon, name: a.name, desc: a.desc, cond: a.cond, n: a.n,
            unlocked: !!progress?.achievements?.[a.id],
            atText: when(progress?.achievements?.[a.id]?.ts),
            current, progress: pct(current, a.n),
        };
    });
    const milestones = (settings?.milestones || []).map(m => {
        const threshold = Math.max(1, Number(m.threshold) || 1);
        const current = m.kind === 'events'
            ? Object.values(progress?.counts || {}).reduce((s, c) => s + (c.count || 0), 0)
            : progress?.lifetime || 0;
        return {
            id: m.id, name: m.name, kind: m.kind, threshold: Number(m.threshold) || 0, bonus: Number(m.bonus) || 0,
            enabled: m.enabled !== false,
            reached: !!progress?.milestones?.[m.id],
            atText: when(progress?.milestones?.[m.id]?.ts),
            current, progress: pct(current, threshold),
        };
    });
    return {
        unlocked: rows.filter(r => r.unlocked),
        locked: rows.filter(r => !r.unlocked).sort((a, b) => b.progress - a.progress),
        milestones,
        count: rows.filter(r => r.unlocked).length,
        total: rows.length,
        bonus: Number(settings?.achievementBonus) || 0,
    };
}

// ---------------------------------------------------------------- event history & ledger
export function eventRows(progress, { limit = 200, catId = '', includeRevoked = true } = {}) {
    return (progress?.events || [])
        .filter(e => (includeRevoked || !e.revoked) && (!catId || e.catId === catId))
        .slice(0, limit)
        .map(e => ({
            id: e.id, key: e.key, icon: e.icon || '•', catId: e.catId, catName: e.catName,
            points: e.points, pointsText: signed(e.points),
            intensity: e.intensity || '', base: e.base, mult: e.mult,
            snippet: truncate(e.snippet || '', 200),
            chars: e.chars || [],
            source: e.source || 'keyword',
            sourceLabel: LABELS.source[e.source] || e.source,
            adjusted: !!e.adjusted,
            revoked: !!e.revoked, revokedReason: e.revokedReason || '',
            ts: e.ts, whenText: when(e.ts), idx: e.idx,
        }));
}

export function ledgerRows(progress, { limit = 200, kinds = null, query = '' } = {}) {
    const q = String(query || '').toLowerCase().trim();
    return (progress?.ledger || [])
        .filter(t => (!kinds || kinds.includes(t.kind)) && (!q || String(t.note || '').toLowerCase().includes(q)))
        .slice(0, limit)
        .map(t => ({
            id: t.id, kind: t.kind, kindLabel: kindLabel(t.kind), note: t.note,
            amount: t.amount, amountText: signed(t.amount), positive: t.amount > 0, negative: t.amount < 0,
            balance: t.balance, balanceText: fmt(t.balance),
            ref: t.ref, ts: t.ts, whenText: when(t.ts),
        }));
}

export function ledgerKinds(progress) {
    const set = new Map();
    for (const t of progress?.ledger || []) set.set(t.kind, (set.get(t.kind) || 0) + 1);
    return [...set.entries()].map(([kind, count]) => ({ kind, label: kindLabel(kind), count })).sort((a, b) => b.count - a.count);
}

/** CSV text for the current ledger (used by Export in Event History). */
export function ledgerCsv(rows) {
    const head = ['timestamp', 'iso', 'kind', 'amount', 'balance', 'note'];
    const body = (rows || []).map(r => [r.ts, new Date(r.ts).toISOString(), r.kind, r.amount, r.balance, String(r.note || '').replace(/"/g, '""')]);
    return [head, ...body].map(cols => cols.map(c => `"${String(c)}"`).join(',')).join('\r\n');
}

// ---------------------------------------------------------------- shop memory
export function memoryModel({ memory, settings, rotation }) {
    const m = memory || {};
    const nameOf = key => m.interactions?.[key]?.name || m.products?.[key]?.name || m.unaffordable?.[key]?.name || key;
    const inShop = new Set((rotation?.items || []).map(i => i.key));
    return {
        purpose: {
            theme: m.purpose?.theme || 'general',
            label: m.purpose?.label || 'General Depravity',
            custom: m.purpose?.custom || '',
            setBy: m.purpose?.setBy || 'default',
            setAtText: when(m.purpose?.ts),
            history: (m.purpose?.history || []).map(h => ({ label: h.label, theme: h.theme, whenText: when(h.ts) })),
        },
        preferences: topPrefs(m, 50).map(p => ({ tag: p.tag, score: p.score, locked: !!p.locked, source: p.source })),
        allPrefs: Object.entries(m.prefs || {}).map(([tag, p]) => ({ tag, score: p.score, locked: !!p.locked, source: p.source }))
            .sort((a, b) => (Number(b.locked) - Number(a.locked)) || b.score - a.score),
        locked: (m.locked || []).slice(),
        restrictions: (m.restrictions || []).slice(),
        wishlist: (m.wishlist || []).map(w => ({
            key: w.key, name: w.name, price: w.price, priceText: fmt(w.price || 0),
            addedText: when(w.added), inShop: inShop.has(w.key), product: w.product || null,
        })),
        interactions: Object.entries(m.interactions || {}).map(([key, it]) => ({
            key, name: it.name || nameOf(key), views: it.views || 0, buys: it.buys || 0, ignored: it.ignored || 0, wished: it.wished || 0,
            lastSeenText: when(it.lastSeen), lastBoughtText: when(it.lastBought || 0),
        })).sort((a, b) => (b.buys - a.buys) || (b.views - a.views)).slice(0, 100),
        unaffordable: Object.entries(m.unaffordable || {}).map(([key, u]) => ({
            key, name: u.name || key, priceText: fmt(u.price || 0), day: u.day,
        })),
        rememberedProducts: Object.entries(m.products || {}).map(([key, p]) => ({
            key, name: p.name, rarityLabel: rarityLabel(p), priceText: fmt(p.price || 0), source: p.source || 'ai', genDay: p.genDay || '',
        })).sort((a, b) => String(b.genDay).localeCompare(String(a.genDay))).slice(0, 120),
        rotations: (m.rotations || []).map(r => ({ day: r.day, count: (r.keys || []).length, names: (r.keys || []).slice(0, 5).map(nameOf) })),
        settingNotes: (m.setting || []).map(s => ({ id: s.id, text: s.text, source: s.source, whenText: when(s.ts) })),
        interests: (m.interests || []).map(i => ({ text: i.text, whenText: when(i.ts) })),
        log: (m.log || []).slice(0, 80).map(l => ({ whenText: when(l.ts), text: l.text })),
        stats: memoryStats(m),
        currency: settings?.currencyName || 'Points',
    };
}

// ---------------------------------------------------------------- editor drafts (Settings tab validation)
/** Build a new category from form input. Returns { ok, category?, error? }. */
export function categoryDraft(raw = {}, existingIds = []) {
    const name = String(raw.name || '').trim();
    if (name.length < 2) return { ok: false, error: 'Category name must be at least 2 characters.' };
    if (!String(raw.keywords || '').trim()) return { ok: false, error: 'Add at least one keyword so events can be detected.' };
    const base = slug(name) || 'category';
    let id = String(raw.id || '').trim() || base;
    if (!/^[\w-]{2,40}$/.test(id)) return { ok: false, error: 'The id may only contain letters, numbers, dashes and underscores.' };
    if (!raw.id) { let n = 1; while (existingIds.includes(id)) id = `${base}-${++n}`; }
    const points = Math.round(Number(raw.points));
    if (!Number.isFinite(points) || points < 1 || points > 10000) return { ok: false, error: 'Reward must be between 1 and 10,000.' };
    return {
        ok: true,
        category: {
            id, name: truncate(name, 40), icon: truncate(String(raw.icon || '•').trim() || '•', 4),
            enabled: raw.enabled !== false, points,
            cooldown: clamp(Math.round(Number(raw.cooldown) || 0), 0, 50),
            tags: truncate(String(raw.tags || ''), 80),
            keywords: truncate(String(raw.keywords || '').trim(), 600),
        },
    };
}

/** Build a milestone from form input. */
export function milestoneDraft(raw = {}, existingIds = []) {
    const name = String(raw.name || '').trim();
    if (name.length < 2) return { ok: false, error: 'Milestone name must be at least 2 characters.' };
    const kind = raw.kind === 'events' ? 'events' : 'lifetime';
    const threshold = Math.round(Number(raw.threshold));
    if (!Number.isFinite(threshold) || threshold < 1) return { ok: false, error: 'Threshold must be a positive number.' };
    const bonus = Math.round(Number(raw.bonus) || 0);
    if (bonus < 0 || bonus > 100000) return { ok: false, error: 'Bonus must be between 0 and 100,000.' };
    let id = String(raw.id || '').trim() || `m_${kind}_${threshold}`;
    if (!/^[\w-]{2,40}$/.test(id)) return { ok: false, error: 'The id may only contain letters, numbers, dashes and underscores.' };
    if (!raw.id) { let n = 1; while (existingIds.includes(id)) id = `m_${kind}_${threshold}_${++n}`; }
    return { ok: true, milestone: { id, name: truncate(name, 40), kind, threshold, bonus, enabled: raw.enabled !== false } };
}

/** Build an intensity tier from form input. */
export function intensityDraft(raw = {}, existingIds = []) {
    const label = String(raw.label || '').trim();
    if (label.length < 2) return { ok: false, error: 'Intensity label must be at least 2 characters.' };
    if (!String(raw.words || '').trim()) return { ok: false, error: 'Add at least one trigger word.' };
    const mult = Number(raw.mult);
    if (!Number.isFinite(mult) || mult <= 0 || mult > 20) return { ok: false, error: 'Multiplier must be greater than 0 and at most 20.' };
    const base = slug(label) || 'tier';
    let id = String(raw.id || '').trim() || base;
    if (!/^[\w-]{2,40}$/.test(id)) return { ok: false, error: 'The id may only contain letters, numbers, dashes and underscores.' };
    if (!raw.id) { let n = 1; while (existingIds.includes(id)) id = `${base}-${++n}`; }
    return { ok: true, tier: { id, label: truncate(label, 30), mult: Math.round(mult * 100) / 100, words: truncate(String(raw.words).trim(), 300) } };
}

/** Validate the numbers in the economy settings form. */
export function economyDraft(raw = {}) {
    const difficulty = ['relaxed', 'normal', 'hard', 'brutal'].includes(raw.difficulty) ? raw.difficulty : 'normal';
    const earnRate = Number(raw.earnRate);
    const priceMultiplier = Number(raw.priceMultiplier);
    if (!Number.isFinite(earnRate) || earnRate < 0.1 || earnRate > 10) return { ok: false, error: 'Earning rate must be between 0.1 and 10.' };
    if (!Number.isFinite(priceMultiplier) || priceMultiplier < 0.1 || priceMultiplier > 10) return { ok: false, error: 'Price multiplier must be between 0.1 and 10.' };
    return { ok: true, economy: { difficulty, earnRate: Math.round(earnRate * 100) / 100, priceMultiplier: Math.round(priceMultiplier * 100) / 100 } };
}

/** Validate the daily-shop settings form. */
export function shopDraft(raw = {}) {
    const resetTime = String(raw.resetTime || '').trim();
    if (!/^\d{1,2}:\d{2}$/.test(resetTime)) return { ok: false, error: 'Reset time must look like 00:00 or 6:30.' };
    const size = Math.round(Number(raw.size));
    if (!Number.isFinite(size) || size < 4 || size > 16) return { ok: false, error: 'Products per rotation must be between 4 and 16.' };
    const discount = Math.round(Number(raw.dailyOfferDiscount));
    if (!Number.isFinite(discount) || discount < 0 || discount > 90) return { ok: false, error: 'Daily offer discount must be between 0 and 90%.' };
    const refreshes = Math.round(Number(raw.manualRefreshesPerDay));
    if (!Number.isFinite(refreshes) || refreshes < 0 || refreshes > 20) return { ok: false, error: 'Manual refreshes per day must be between 0 and 20.' };
    const cost = Math.round(Number(raw.manualRefreshCost) || 0);
    if (cost < 0 || cost > 1000000) return { ok: false, error: 'Refresh cost must be between 0 and 1,000,000.' };
    const aiProducts = Math.round(Number(raw.aiProducts));
    if (!Number.isFinite(aiProducts) || aiProducts < 2 || aiProducts > 10) return { ok: false, error: 'AI products per rotation must be between 2 and 10.' };
    return {
        ok: true,
        shop: {
            timezone: String(raw.timezone || 'local'), resetTime, size,
            dailyOfferDiscount: discount, manualRefreshesPerDay: refreshes, manualRefreshCost: cost,
            surpriseChance: clamp(Number(raw.surpriseChance) || 0, 0, 1),
            useAi: !!raw.useAi, aiProducts,
        },
    };
}

/** Human summary of what the current economy means for the player. */
export function economyHint(econ, currency = 'Points') {
    if (!econ) return '';
    const d = econ.expectedDaily || 250;
    return `A typical day earns about ${fmt(d)} ${currency}. Ordinary consumables stay well under that; permanent upgrades are a multi-day goal.`;
}

/** Summary line for the reset countdown. */
export function resetLine(resetMs) {
    if (!resetMs || resetMs <= 0) return 'rotating…';
    return `next rotation in ${fmtDuration(resetMs)}`;
}
