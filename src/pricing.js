// Deterministic pricing formula + product validation.
// Prices depend ONLY on product attributes and the user's explicit economy settings,
// never on the current balance.
import { clamp } from './util.js';

export const UNIT = 10;
export const RARITIES = ['common', 'uncommon', 'rare', 'premium'];
export const RARITY = {
    common: { mult: 1.0, weight: 1.0, label: 'Common', band: [1, 4] },
    uncommon: { mult: 1.6, weight: 0.6, label: 'Uncommon', band: [2, 6] },
    rare: { mult: 2.8, weight: 0.28, label: 'Rare', band: [4, 8] },
    premium: { mult: 5.0, weight: 0.1, label: 'Premium', band: [6, 10] },
};
export const DURATIONS = ['instant', 'scene', 'day', 'week', 'permanent'];
export const DURATION = {
    instant: { mult: 0.45, label: 'Instant' },
    scene: { mult: 0.7, label: 'One scene' },
    day: { mult: 1.0, label: 'One day' },
    week: { mult: 1.8, label: 'One week' },
    permanent: { mult: 4.0, label: 'Permanent' },
};
export const TYPES = ['consumable', 'permanent', 'equipment', 'service'];
export const TYPE = {
    consumable: { mult: 1.0, label: 'Consumable' },
    permanent: { mult: 1.0, label: 'Permanent upgrade' },
    equipment: { mult: 0.8, label: 'Equipment' },
    service: { mult: 0.9, label: 'Special service' },
};
export const DIFFICULTY = {
    relaxed: { label: 'Relaxed', price: 0.7, earn: 1.3 },
    normal: { label: 'Normal', price: 1.0, earn: 1.0 },
    hard: { label: 'Hard', price: 1.5, earn: 0.85 },
    brutal: { label: 'Brutal', price: 2.2, earn: 0.7 },
};
export const REALITY_MULT = 2.5;
/** Assumed points per day for a brand-new user before any history exists. */
export const BASELINE_DAILY = 250;

export function isPermanentType(type) {
    return type === 'permanent' || type === 'equipment';
}

/** Round to "nice" shop prices. */
export function nicePrice(n) {
    n = Math.max(5, Number(n) || 0);
    const step = n < 50 ? 5 : n < 200 ? 10 : n < 1000 ? 25 : n < 5000 ? 50 : n < 20000 ? 250 : 500;
    return Math.max(5, Math.round(n / step) * step);
}

/** Economy settings → effective multipliers. */
export function economyFactors(econ = {}) {
    const d = DIFFICULTY[econ.difficulty] || DIFFICULTY.normal;
    return {
        price: d.price * clamp(econ.priceMultiplier ?? 1, 0.1, 10),
        earn: d.earn * clamp(econ.earnRate ?? 1, 0.1, 10),
    };
}

function effectiveDuration(p) {
    return isPermanentType(p.type) ? 'permanent' : (DURATION[p.duration] ? p.duration : 'day');
}

/** Base value from attributes (before economy multipliers). */
export function baseValue(p) {
    const power = clamp(Math.round(p.power ?? 1), 1, 10);
    const utility = clamp(Math.round(p.utility ?? 5), 1, 10);
    const r = RARITY[p.rarity] || RARITY.common;
    const dur = DURATION[effectiveDuration(p)];
    const t = TYPE[p.type] || TYPE.consumable;
    const uses = clamp(Math.round(p.uses ?? 1), 1, 20);
    const bundle = isPermanentType(p.type) ? 1 : Math.pow(uses, 0.85);
    const reality = p.realityAltering ? REALITY_MULT : 1;
    return UNIT * Math.pow(power, 1.7) * r.mult * dur.mult * t.mult * (0.75 + utility * 0.05) * bundle * reality;
}

export function computePrice(p, econ = {}) {
    return nicePrice(baseValue(p) * economyFactors(econ).price);
}

/** Human-readable price explanation. */
export function explainPrice(p, econ = {}) {
    const f = economyFactors(econ);
    const r = RARITY[p.rarity] || RARITY.common;
    const d = DURATION[effectiveDuration(p)];
    const parts = [`power ${p.power}/10`, `utility ${p.utility}/10`, `${r.label} ×${r.mult}`, `${d.label} ×${d.mult}`];
    if ((p.uses ?? 1) > 1 && !isPermanentType(p.type)) parts.push(`${p.uses} uses`);
    if (p.realityAltering) parts.push(`reality-altering ×${REALITY_MULT}`);
    if (Math.abs(f.price - 1) > 0.001) parts.push(`economy ×${f.price.toFixed(2)}`);
    return parts.join(' · ');
}

/** Rarity suggested for a power level. */
export function rarityForPower(power) {
    if (power <= 2) return 'common';
    if (power <= 4) return 'uncommon';
    if (power <= 7) return 'rare';
    return 'premium';
}

export function discounted(price, pct) {
    return nicePrice(price * (1 - clamp(pct, 0, 90) / 100));
}

/** Affordability bucket of a price relative to expected daily earnings. */
export function priceBand(price, dailyEarn) {
    const d = Math.max(20, dailyEarn || BASELINE_DAILY);
    const ratio = price / d;
    if (ratio <= 1) return 'affordable';
    if (ratio <= 5) return 'moderate';
    return 'aspirational';
}
