// Natural-language Shop command parsing (pure).
// A message is only treated as a command when ALL of these hold:
//   1. it was written by the User (callers must not pass character messages),
//   2. the command text is OUTSIDE quoted dialogue,
//   3. the text explicitly addresses the System/Shop – in brackets/OOC, or a line beginning "System," / "Shop:" –
//   4. it contains a recognised intent phrase.
// Everything else is ordinary roleplay.
import { stripQuoted } from './util.js';

const BLOCK_RX = [
    /\[\s*((?:system|shop|ooc)\b[^\]]{2,300})\]/gi,
    /\(\(\s*([^)]{3,300})\)\)/g,
    /\(\s*(ooc\s*:[^)]{2,300})\)/gi,
    /\{\s*((?:system|shop)\b[^}]{2,300})\}/gi,
];
const LINE_RX = /^\s*(?:hey\s+|ok(?:ay)?\s+|alright\s+)?(?:system|shop|the system)\s*[,:!-]\s*(.{3,300})$/gim;
const ADDRESS_RX = /\b(system|shop|store|market)\b/i;
const CLEAN_VALUE = s => String(s || '').replace(/^(?:a|an|the)\s+/i, '').replace(/\s*(?:please|thanks|thank you|now|instead|from now on)\s*[.!]*$/i, '').replace(/[.!?;]+$/g, '').trim();

const INTENTS = [
    { kind: 'theme', rx: /\b(?:change|switch|set|turn|convert|transform|make|update)\s+(?:the\s+|my\s+|your\s+)?(?:shop|store|system shop|market)(?:'s)?\s*(?:theme|purpose|focus|category|type|inventory|stock)?\s*(?:to|into|so it sells|so that it sells|to sell|to focus on|to be about)\s+(.{2,120})/i },
    { kind: 'theme', rx: /\b(?:shop|store)\s*(?:theme|purpose|focus|category)\s*(?:[:=]|is|should be|will be)\s*(.{2,120})/i },
    { kind: 'theme', rx: /\b(?:focus|refocus|dedicate)\s+(?:the\s+|my\s+)?(?:shop|store)\s+(?:on|around|to)\s+(.{2,120})/i },
    { kind: 'theme', rx: /\b(?:i\s+want|give\s+me|i'd\s+like|i\s+would\s+like|let's\s+have|make\s+it)\s+(?:a|an|the)\s+(.{2,80}?)\s+(?:shop|store)\b/i },
    { kind: 'theme', rx: /\b(?:i\s+want|i'd\s+like|i\s+would\s+like)\s+(?:the\s+|a\s+)?(?:shop|store)\s+(?:to\s+(?:sell|focus\s+on|offer|be\s+about)|focused\s+on|for|of|that\s+sells|selling)\s+(.{2,120})/i },
    { kind: 'theme', rx: /\b(?:shop|store)\s+(?:should|must|will)\s+(?:only\s+)?(?:sell|focus\s+on|offer|specialize\s+in|be\s+about)\s+(.{2,120})/i },
    { kind: 'restrict', rx: /\b(?:don't|do\s+not|never|stop)\s+(?:sell(?:ing)?|offer(?:ing)?|stock(?:ing)?|show(?:ing)?)\s+(?:me\s+)?(?:any\s+)?(.{2,80})/i },
    { kind: 'restrict', rx: /\b(?:no\s+more|exclude|ban|remove\s+all|block)\s+(.{2,80})/i },
    { kind: 'unrestrict', rx: /\b(?:allow|unban|unblock|you\s+can\s+sell)\s+(.{2,80})\s+again\b/i },
    { kind: 'unrestrict', rx: /\b(?:allow|unban|unblock)\s+(.{2,80})/i },
    { kind: 'prefer', rx: /\b(?:more|prioriti[sz]e|i\s+(?:like|love|prefer|want\s+more))\s+(.{2,80})/i },
    { kind: 'avoid', rx: /\b(?:less|fewer|i\s+(?:dislike|don't\s+like|hate))\s+(.{2,80})/i },
    { kind: 'refresh', rx: /\b(?:refresh|reroll|re-roll|restock|regenerate|new)\s+(?:the\s+)?(?:shop|store|stock|inventory|items|products)\b/i },
    { kind: 'open', rx: /\b(?:open|show|display)\s+(?:the\s+|my\s+)?(?:shop|store|status|system|inventory)\b/i },
];

const MAJOR = new Set(['theme', 'restrict', 'unrestrict', 'refresh']);

/** Candidate command snippets in a user message (outside quotes). */
export function commandCandidates(text) {
    const src = stripQuoted(String(text || ''));
    const out = [];
    for (const rx of BLOCK_RX) {
        rx.lastIndex = 0;
        let m;
        while ((m = rx.exec(src)) !== null) {
            const inner = m[1].trim();
            if (ADDRESS_RX.test(inner) || /^ooc\b/i.test(inner)) out.push(inner.replace(/^(?:system|shop|ooc)\s*[:,-]?\s*/i, ''));
        }
    }
    LINE_RX.lastIndex = 0;
    let m;
    while ((m = LINE_RX.exec(src)) !== null) out.push(m[1].trim());
    // overlapping patterns (e.g. "((OOC: ...))" also matches "(OOC: ...)") → dedupe
    const seen = new Set();
    return out.filter(c => {
        const k = c.toLowerCase().replace(/^ooc\s*:\s*/, '').replace(/\W+/g, ' ').trim();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

/**
 * Parse Shop commands from a User message.
 * @returns {{kind:string, value:string, raw:string, major:boolean}[]}
 */
export function parseShopCommands(text) {
    const res = [];
    for (const cand of commandCandidates(text)) {
        for (const intent of INTENTS) {
            const m = intent.rx.exec(cand);
            if (!m) continue;
            if (intent.kind === 'restrict' && !/\b(?:shop|store|sell|offer|stock|items?|products?)\b/i.test(cand) && !/^(?:no more|exclude|ban)\b/i.test(cand)) continue;
            const value = CLEAN_VALUE(m[1] || '');
            if (intent.kind !== 'refresh' && intent.kind !== 'open' && value.length < 2) continue;
            res.push({ kind: intent.kind, value, raw: cand, major: MAJOR.has(intent.kind) });
            break; // one intent per candidate
        }
    }
    return res;
}

// ---------------------------------------------------------------- passive interest signals
const WISH_RX = [
    /\bi\s+wish\s+i\s+(?:had|could|was|were|knew)\s+([^.!?\n]{3,80})/i,
    /\bif\s+only\s+i\s+(?:had|could|was|were)\s+([^.!?\n]{3,80})/i,
    /\bi\s+(?:really\s+)?need\s+(?:a|an|some)\s+([^.!?\n]{3,60})/i,
];

/** Soft interest hints from ordinary User narration/dialogue (never applied as commands). */
export function interestHints(text) {
    const src = String(text || '');
    const hints = [];
    for (const rx of WISH_RX) {
        const m = rx.exec(src);
        if (m) hints.push(CLEAN_VALUE(m[1]).toLowerCase());
    }
    return hints;
}
