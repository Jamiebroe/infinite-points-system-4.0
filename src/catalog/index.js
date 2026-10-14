// Built-in product catalogs, parsed into validated products with formula prices.
import { GENERAL } from './general.js';
import { LEVERAGE, SURVEILLANCE } from './leverage.js';
import { INFLUENCE, SUPERNATURAL } from './influence.js';
import { RESTRAINT, DEGRADATION } from './restraint.js';
import { BODY, SETUPS } from './body.js';
import { FETISH } from './fetish.js';
import { SNEAK } from './sneak.js';
import { rarityForPower } from '../pricing.js';
import { slug } from '../util.js';

const TYPE_CODE = { c: 'consumable', p: 'permanent', e: 'equipment', s: 'service' };
const DUR_CODE = { i: 'instant', s: 'scene', d: 'day', w: 'week', '-': 'permanent' };

// ADULTS ONLY. Themes are organised by MEANS, not by product type: each one answers "how do I
// make this happen to someone". There is no combat, quest or crafting catalogue, and no romance,
// dating or gift category — a product that only expresses affection has no place here.
//
// Adding a theme: give it a label, an icon, a `data` string in the pipe format above and a
// `keywords` list. matchTheme() maps free text from the chat onto these, so the Shop can be
// re-aimed at whatever the current scene is actually about.
export const THEMES = {
    general: { label: 'Mixed Means', icon: '🔮', data: GENERAL,
        keywords: ['general', 'mixed', 'anything', 'everything', 'whatever', 'assorted', 'misc', 'miscellaneous', 'means', 'tools', 'default'] },
    leverage: { label: 'Blackmail & Leverage', icon: '📸', data: LEVERAGE,
        keywords: ['blackmail', 'leverage', 'bribe', 'bribery', 'extortion', 'coercion', 'coerce', 'compromise', 'compromising', 'evidence', 'secret', 'secrets', 'scandal', 'photo', 'photos', 'recording', 'recordings', 'debt', 'debts', 'contract', 'contracts', 'file', 'files', 'dirt', 'proof'] },
    surveillance: { label: 'Surveillance & Intel', icon: '👁️', data: SURVEILLANCE,
        keywords: ['surveillance', 'spy', 'spying', 'spies', 'intel', 'intelligence', 'recon', 'reconnaissance', 'watch', 'watching', 'camera', 'cameras', 'bug', 'bugs', 'tracker', 'tracking', 'stalk', 'stalking', 'follow', 'following', 'scrying', 'observation', 'monitoring', 'information'] },
    influence: { label: 'Influence & Compulsion', icon: '🌀', data: INFLUENCE,
        keywords: ['influence', 'compulsion', 'hypnosis', 'hypnotic', 'hypnotise', 'hypnotize', 'control', 'suggestion', 'suggestions', 'obedience', 'obey', 'submission', 'submissive', 'dominance', 'domination', 'charm', 'charms', 'authority', 'command', 'commands', 'persuasion', 'drugs', 'aphrodisiac', 'aphrodisiacs', 'mind'] },
    supernatural: { label: 'Supernatural Means', icon: '😈', data: SUPERNATURAL,
        keywords: ['supernatural', 'magic', 'magical', 'occult', 'demon', 'demons', 'devil', 'succubus', 'incubus', 'spirit', 'spirits', 'possession', 'curse', 'curses', 'ritual', 'rituals', 'tentacles', 'monster', 'monsters', 'witchcraft', 'spell', 'spells', 'psychic'] },
    restraint: { label: 'Capture & Restraint', icon: '⛓️', data: RESTRAINT,
        keywords: ['restraint', 'restraints', 'bondage', 'rope', 'ropes', 'cuffs', 'handcuffs', 'shibari', 'collar', 'collars', 'leash', 'gag', 'gags', 'blindfold', 'blindfolds', 'chains', 'bdsm', 'capture', 'captivity', 'captive', 'cage', 'cages', 'binding', 'bindings', 'tied', 'impact', 'spank', 'spanking', 'paddle', 'paddling', 'crop', 'flog', 'flogging', 'choke', 'choking', 'throat', 'breath play', 'cuckold', 'cuckolding', 'scarf'] },
    body: { label: 'Body & Performance', icon: '🧬', data: BODY,
        keywords: ['body', 'bodies', 'stamina', 'endurance', 'physique', 'anatomy', 'performance', 'flexibility', 'sensitivity', 'arousal', 'refractory', 'vitality', 'size', 'fluids', 'enhancement', 'enhancements', 'stamina'] },
    setups: { label: 'Setups & Opportunities', icon: '🚪', data: SETUPS,
        keywords: ['setup', 'setups', 'situation', 'situations', 'location', 'locations', 'places', 'scene', 'scenes', 'opportunity', 'opportunities', 'isolation', 'disguise', 'disguises', 'access', 'private', 'privacy', 'room', 'rooms', 'roleplay', 'scenario', 'scenarios', 'opportunity'] },
    degradation: { label: 'Degradation & Display', icon: '📢', data: DEGRADATION,
        keywords: ['degradation', 'degrade', 'degrading', 'humiliation', 'humiliate', 'shame', 'shaming', 'shameful', 'display', 'exhibition', 'exhibitionism', 'expose', 'exposure', 'public', 'pet', 'petplay', 'ownership', 'owned', 'slut', 'slutty', 'whore', 'filthy'] },
    fetish: { label: 'Fetish & Kink', icon: '🪢', data: FETISH,
        keywords: ['fetish', 'fetishes', 'kink', 'kinky', 'bdsm', 'shibari', 'petplay', 'pet play', 'chastity', 'watersports', 'foot', 'feet', 'toes', 'sadism', 'masochism', 'subspace', 'kink gear', 'toys', 'dressup', 'dress up', 'outfit', 'outfits', 'wardrobe', 'dirty talk', 'massage', 'oiling', 'breath play', 'impact', 'cuckold'] },
    sneak: { label: 'Sneaking & Stealing', icon: '🥷', data: SNEAK,
        keywords: ['sneak', 'sneaking', 'stealth', 'steal', 'stealing', 'theft', 'thief', 'peep', 'peeping', 'voyeur', 'voyeurism', 'panties', 'underwear', 'panty raid', 'trespass', 'break in', 'breaking in', 'stalking', 'stalker'] },
};

function parseLine(line, theme) {
    const f = line.split('|').map(s => s.trim());
    if (f.length < 11) return null;
    const [icon, name, t, d, power, utility, uses, tags, description, effect, family, flags = ''] = f;
    const type = TYPE_CODE[t];
    const p = Number(power);
    return {
        key: `${theme}:${slug(name)}`,
        icon, name, type,
        duration: type === 'permanent' || type === 'equipment' ? 'permanent' : DUR_CODE[d],
        power: p, utility: Number(utility), uses: Number(uses) || 1,
        rarity: rarityForPower(p),
        realityAltering: flags.includes('R'),
        tags: tags.split(',').map(s => s.trim()).filter(Boolean),
        category: theme, theme, description, effect,
        family: slug(family || name),
        source: 'catalog',
    };
}

let cache = null;
/** Raw (unpriced) catalog products, keyed by theme. Prices are computed later by the shop. */
export function catalog() {
    if (cache) return cache;
    cache = {};
    for (const [theme, def] of Object.entries(THEMES)) {
        cache[theme] = def.data.split('\n').map(l => l.trim()).filter(Boolean).map(l => parseLine(l, theme)).filter(Boolean);
        // tier = position within family (weak → strong)
        const fam = {};
        for (const p of cache[theme].sort((a, b) => a.power - b.power)) {
            fam[p.family] = (fam[p.family] || 0) + 1;
            p.tier = fam[p.family];
        }
    }
    return cache;
}

export function allCatalogProducts() {
    return Object.values(catalog()).flat();
}

/** Map free text to the best matching built-in theme id (or null). */
export function matchTheme(text) {
    const t = ` ${String(text || '').toLowerCase()} `;
    let best = null, bestScore = 0;
    for (const [id, def] of Object.entries(THEMES)) {
        let score = 0;
        for (const k of def.keywords) if (t.includes(` ${k} `) || t.includes(` ${k},`) || t.includes(` ${k}.`) || t.includes(` ${k}s `)) score += k.length > 6 ? 2 : 1;
        if (t.includes(def.label.toLowerCase())) score += 3;
        if (score > bestScore) { best = id; bestScore = score; }
    }
    return best;
}

/** Tags associated with free text (used for custom themes without AI). */
export function tagsForText(text) {
    const t = String(text || '').toLowerCase();
    const tags = new Set();
    for (const p of allCatalogProducts()) for (const tag of p.tags) if (tag.length > 3 && t.includes(tag)) tags.add(tag);
    return [...tags];
}
