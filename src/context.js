// Builds the compact System summary injected into the AI prompt (pure).
// Priority order keeps the most important facts when the character budget is tight:
// rules/privacy → permanent abilities → active effects → equipment → consumables → balance/purpose.
import { truncate, fmt } from './util.js';
import { isPermanentType } from './pricing.js';

export function buildInjection({ settings, progress, memory, effects = [], userName = 'User' }) {
    const inj = settings.injection || {};
    const max = Math.max(300, Number(inj.maxChars) || 1400);
    const sys = settings.systemName || 'The System';
    const owned = Object.values(progress.inventory || {}).filter(i => i.qty > 0);
    const perms = owned.filter(i => i.type === 'permanent').sort((a, b) => b.power - a.power);
    const equip = owned.filter(i => i.type === 'equipment').sort((a, b) => b.power - a.power);
    const cons = owned.filter(i => !isPermanentType(i.type));

    const head = `[${sys} – private status of ${userName}. Only ${userName} can see the System interface; other characters cannot perceive it unless ${userName} reveals it. Abilities and items listed here are real in the story and work exactly as described. Do not invent new System purchases or change the Point balance.]`;
    const sections = [];
    if (perms.length) sections.push({ title: 'Permanent abilities', lines: perms.map(i => `${i.name}: ${i.effect}`) });
    if (effects.length) sections.push({ title: 'Active temporary effects', lines: effects.map(e => `${e.name}: ${e.effect}`) });
    if (equip.length) sections.push({ title: 'Equipment', lines: equip.map(i => `${i.name}: ${i.effect}`) });
    if (cons.length) sections.push({ title: 'Carried items (unused)', lines: cons.map(i => `${i.name} ×${i.qty}${i.uses > 1 ? ` (${i.charges} uses)` : ''}`) });
    const tail = [];
    if (inj.includeBalance !== false) tail.push(`${settings.currencyName || 'Points'}: ${fmt(progress.balance)}`);
    if (inj.includePurpose !== false && memory?.purpose?.label) tail.push(`System Shop sells: ${memory.purpose.label}`);

    let out = head;
    const add = s => { if (out.length + s.length + 1 <= max) { out += `\n${s}`; return true; } return false; };
    for (const sec of sections) {
        if (!add(`${sec.title}:`)) break;
        let dropped = 0;
        for (const line of sec.lines) if (!add(`- ${truncate(line, 160)}`)) dropped++;
        if (dropped) add(`- (+${dropped} more)`);
    }
    if (!sections.length) add('No abilities or items owned yet.');
    if (tail.length) add(tail.join(' | '));
    return out;
}

// ---------------------------------------------------------------- assistant templates (used when AI is off / fails)
const TEMPLATES = {
    neutral: { rotation: 'New stock is available: {items}.', rare: 'A {rarity} product is in stock: {item}.', purchase: '{item} acquired.', milestone: 'Milestone reached: {name}.', wish: 'Wishlisted item available: {item}.' },
    professional: { rotation: 'Good day. Today\'s selection includes {items}.', rare: 'May I draw your attention to a {rarity} offering: {item}.', purchase: 'Excellent choice. {item} has been added to your inventory.', milestone: 'Congratulations on reaching {name}. A special offer has been prepared.', wish: 'An item from your wishlist is now available: {item}.' },
    mysterious: { rotation: 'The shelves have shifted while you slept… {items} await.', rare: 'Something {rarity} stirs in the back room: {item}.', purchase: '{item} is yours now. Use it wisely… or don\'t.', milestone: '{name}. The System has noticed you.', wish: 'What you desired has surfaced: {item}.' },
    playful: { rotation: 'Fresh stock, fresh fun! Today: {items}!', rare: 'Ooh, a {rarity} goodie: {item}! Don\'t miss it!', purchase: 'Yay! {item} is all yours!', milestone: 'Woohoo, {name}! Treat yourself!', wish: 'Guess what showed up? {item} from your wishlist!' },
    mischievous: { rotation: 'Restocked. Try not to drool over {items}.', rare: 'A {rarity} {item}… if you can afford it. Heh.', purchase: '{item}? Bold. I approve. Mostly.', milestone: '{name}, hm? Don\'t let it go to your head.', wish: 'Oh look, {item} is back. Your wallet trembles.' },
};

export function templateComment(personality, kind, vars = {}) {
    const set = TEMPLATES[personality] || TEMPLATES.neutral;
    const tpl = set[kind] || TEMPLATES.neutral[kind] || '';
    return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
