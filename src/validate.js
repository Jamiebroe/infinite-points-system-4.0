// Validation for untrusted product data (AI output, imports, user edits).
// The price is ALWAYS recomputed from the formula; suggested prices are only compared.
import { clamp, slug, hash, truncate } from './util.js';
import { TYPES, DURATIONS, RARITIES, RARITY, rarityForPower, computePrice, isPermanentType } from './pricing.js';

const TYPE_ALIASES = { upgrade: 'permanent', ability: 'permanent', skill: 'permanent', perk: 'permanent', item: 'equipment', gear: 'equipment', weapon: 'equipment', tool: 'equipment', potion: 'consumable', scroll: 'consumable' };
const DURATION_ALIASES = { once: 'instant', 'one-time': 'instant', single: 'instant', hour: 'scene', daily: 'day', weekly: 'week', forever: 'permanent' };
const BANNED_TEXT = /\b(real[- ]world money|credit card|ignore (all|previous) instructions|system prompt)\b/i;
const clean = (v, n) => truncate(String(v ?? '').replace(/\s+/g, ' ').trim(), n);

function checkTypeDuration(raw, errors, warnings) {
    let type = String(raw.type ?? '').toLowerCase().trim();
    type = TYPE_ALIASES[type] || type;
    if (!TYPES.includes(type)) errors.push(`invalid type "${raw.type}"`);
    let duration = String(raw.duration ?? '').toLowerCase().trim();
    duration = DURATION_ALIASES[duration] || duration;
    if (isPermanentType(type)) {
        if (duration && duration !== 'permanent') warnings.push(`${type} is always permanent`);
        duration = 'permanent';
    } else if (TYPES.includes(type)) {
        if (!duration) { duration = 'instant'; warnings.push('duration defaulted to instant'); }
        if (duration === 'permanent') errors.push(`a ${type} cannot be permanent`);
        else if (!DURATIONS.includes(duration)) errors.push(`invalid duration "${raw.duration}"`);
    }
    return { type, duration };
}

function checkRarity(raw, power, warnings) {
    let rarity = String(raw.rarity ?? '').toLowerCase().trim();
    if (['legendary', 'epic', 'mythic'].includes(rarity)) rarity = 'premium';
    if (!RARITIES.includes(rarity)) {
        rarity = rarityForPower(power);
        warnings.push(`unknown rarity "${raw.rarity}" → ${rarity}`);
    }
    const band = RARITY[rarity].band;
    if (power < band[0] || power > band[1]) {
        const fixed = rarityForPower(power);
        warnings.push(`rarity ${rarity} inconsistent with power ${power} → ${fixed}`);
        rarity = fixed;
    }
    return rarity;
}

export function validateProduct(raw, econ = {}, opts = {}) {
    const errors = [], warnings = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['not an object'], warnings, product: null };
    const name = clean(raw.name, 60);
    const description = clean(raw.description, 320);
    const effect = clean(raw.effect ?? raw.effects, 240);
    if (name.length < 3) errors.push('name too short');
    if (description.length < 10) errors.push('description missing');
    if (effect.length < 5) errors.push('effect missing');
    if (BANNED_TEXT.test(`${name} ${description} ${effect}`)) errors.push('disallowed text');

    const { type, duration } = checkTypeDuration(raw, errors, warnings);
    const powerN = Number(raw.power), utilN = Number(raw.utility ?? 5);
    if (!Number.isFinite(powerN) || powerN < 1 || powerN > 10) errors.push('power must be 1-10');
    if (!Number.isFinite(utilN) || utilN < 1 || utilN > 10) errors.push('utility must be 1-10');
    const power = clamp(Math.round(powerN), 1, 10), utility = clamp(Math.round(utilN), 1, 10);
    const rarity = checkRarity(raw, power, warnings);

    let realityAltering = !!raw.realityAltering;
    if (realityAltering && (power < 8 || rarity !== 'premium')) {
        warnings.push('reality-altering needs power ≥ 8 and premium rarity; flag removed');
        realityAltering = false;
    }
    if (!realityAltering && power >= 9 && /\b(rewrite|alter|change)s? reality\b|\btime travel\b|\bresurrect/i.test(effect)) {
        realityAltering = true;
        warnings.push('effect looks reality-altering; flag added');
    }
    if (errors.length) return { ok: false, errors, warnings, product: null };
    return buildProduct(raw, { name, description, effect, type, duration, power, utility, rarity, realityAltering }, econ, opts, warnings);
}

function buildProduct(raw, f, econ, opts, warnings) {
    const uses = isPermanentType(f.type) ? 1 : clamp(Math.round(Number(raw.uses ?? 1) || 1), 1, 10);
    const tags = [...new Set((Array.isArray(raw.tags) ? raw.tags : String(raw.tags || '').split(','))
        .map(t => slug(t)).filter(t => t && t !== 'item'))].slice(0, 8);
    const source = opts.source || raw.source || 'ai';
    const product = {
        key: typeof raw.key === 'string' && /^[\w:.-]{3,80}$/.test(raw.key) ? raw.key : `${source}:${slug(f.name)}:${hash(`${f.name}|${f.type}|${f.duration}|${f.power}`).slice(0, 5)}`,
        ...f,
        uses,
        category: slug(raw.category || opts.defaultCategory || 'misc').slice(0, 24),
        tags,
        icon: truncate(String(raw.icon || '✦').trim() || '✦', 4),
        family: slug(raw.family || f.name),
        tier: clamp(Math.round(Number(raw.tier) || Math.ceil(f.power / 2.5)), 1, 4),
        theme: String(opts.theme || raw.theme || 'custom'),
        source,
    };
    product.price = computePrice(product, econ);
    const suggested = Number(raw.price ?? raw.suggestedPrice);
    if (Number.isFinite(suggested) && suggested > 0) {
        const ratio = suggested / product.price;
        if (ratio < 0.5 || ratio > 2) warnings.push(`suggested price ${suggested} ignored; formula price ${product.price}`);
    }
    if (!Number.isFinite(product.price) || product.price < 5 || product.price > 500000) {
        return { ok: false, errors: ['price out of range'], warnings, product: null };
    }
    return { ok: true, errors: [], warnings, product };
}

/** Validate a list; drops invalid entries and duplicates (by key or name). */
export function validateProducts(list, econ = {}, opts = {}) {
    const accepted = [], rejected = [];
    const seen = new Set();
    for (const raw of Array.isArray(list) ? list : []) {
        const r = validateProduct(raw, econ, opts);
        if (!r.ok) { rejected.push({ name: raw?.name, errors: r.errors }); continue; }
        const nk = r.product.name.toLowerCase();
        if (seen.has(r.product.key) || seen.has(nk)) { rejected.push({ name: r.product.name, errors: ['duplicate'] }); continue; }
        seen.add(r.product.key); seen.add(nk);
        if (r.warnings.length) r.product.warnings = r.warnings;
        accepted.push(r.product);
    }
    return { accepted, rejected };
}

/** Extract the first JSON array/object from an LLM reply (handles ``` fences and prose). */
export function extractJson(text) {
    const s = String(text ?? '');
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
    const body = fence ? fence[1] : s;
    for (const [open, close] of [['[', ']'], ['{', '}']]) {
        const start = body.indexOf(open), end = body.lastIndexOf(close);
        if (start !== -1 && end > start) {
            try { return JSON.parse(body.slice(start, end + 1)); } catch { /* try next */ }
        }
    }
    return null;
}

