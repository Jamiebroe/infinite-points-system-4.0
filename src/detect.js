// Keyword-based event detection (pure). The AI path lives in ai.js and returns the same shape.
import { stripQuoted, plainText } from './util.js';
import { categoryXp } from './content.js';

const rxCache = new Map();
const escRx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NEGATION = /\b(not|never|no|nearly|almost|failed to|unable to|couldn't|could not|didn't|did not|wasn't|was not|won't|without|hardly)\s+(?:\w+\s+){0,2}$/i;

/**
 * Compile a keyword list. Entries are comma or newline separated.
 *   word*      → prefix wildcard (defeat* matches defeated, defeats)
 *   a * b      → up to three words between a and b
 *   re:<regex> → raw regular expression (one per line)
 */
export function compileKeywords(str) {
    const key = String(str || '');
    if (rxCache.has(key)) return rxCache.get(key);
    const out = [];
    for (const line of key.split(/\n+/)) {
        const l = line.trim();
        if (!l) continue;
        if (/^re:/i.test(l)) {
            try { out.push({ src: l, re: new RegExp(l.slice(3).trim(), 'gi') }); } catch { /* invalid regex ignored */ }
            continue;
        }
        for (const part of l.split(/[,;]+/)) {
            const p = part.trim().toLowerCase();
            if (!p) continue;
            const body = p.split(/\s+/).map(tok => {
                if (tok === '*') return '\u0000';
                return escRx(tok).replace(/\\\*/g, '[\\w\'-]*');
            }).join(' ').replace(/ ?\u0000 ?/g, '(?:\\W+[\\w\'-]+){0,3}\\W+').replace(/ /g, '\\W+');
            try { out.push({ src: p, re: new RegExp(`(?<![\\w])${body}(?![\\w])`, 'gi') }); } catch { /* ignore */ }
        }
    }
    rxCache.set(key, out);
    return out;
}

function sentenceAround(text, idx, len) {
    let s = idx, e = idx + len;
    while (s > 0 && !/[.!?\n]/.test(text[s - 1])) s--;
    while (e < text.length && !/[.!?\n]/.test(text[e])) e++;
    return text.slice(s, Math.min(text.length, e + 1)).trim();
}

/** Return the first non-negated match of any compiled keyword. */
export function findMatch(text, compiled) {
    for (const k of compiled) {
        k.re.lastIndex = 0;
        let m;
        while ((m = k.re.exec(text)) !== null) {
            if (m[0].length === 0) { k.re.lastIndex++; continue; }
            const before = text.slice(Math.max(0, m.index - 40), m.index);
            if (!NEGATION.test(before)) return { keyword: k.src, index: m.index, length: m[0].length, match: m[0] };
        }
    }
    return null;
}

/** Pick the strongest intensity tier whose words appear in the sentence. */
export function detectIntensity(sentence, tiers) {
    let best = null;
    for (const t of tiers || []) {
        if (!t || !t.words) continue;
        if (findMatch(sentence, compileKeywords(t.words))) {
            if (!best || Number(t.mult) > Number(best.mult)) best = t;
        }
    }
    return best;
}

/**
 * Detect qualifying events in a message.
 * `base` is the act's Points value and `xp` its tuned level value — they are independent scales.
 * @returns {{catId:string, keyword:string, snippet:string, intensity:string|null, mult:number, base:number, xp:number}[]}
 */
export function detectEvents(rawText, categories, opts = {}) {
    let text = plainText(rawText);
    if (opts.ignoreQuoted) text = stripQuoted(text);
    if (!text) return [];
    const found = [];
    for (const cat of categories || []) {
        if (!cat || !cat.enabled || !cat.keywords) continue;
        if (opts.isUser === true && cat.scanUser === false) continue;
        if (opts.isUser === false && cat.scanChar === false) continue;
        const m = findMatch(text, compileKeywords(cat.keywords));
        if (!m) continue;
        const sentence = sentenceAround(text, m.index, m.length);
        const tier = detectIntensity(sentence, opts.intensity);
        found.push({
            catId: cat.id, keyword: m.keyword, snippet: sentence.slice(0, 220),
            intensity: tier ? tier.id : null, mult: tier ? Number(tier.mult) || 1 : 1,
            base: Number(cat.points) || 0, xp: categoryXp(cat),
        });
    }
    found.sort((a, b) => b.base * b.mult - a.base * a.mult);
    const max = Number(opts.maxEvents) > 0 ? Number(opts.maxEvents) : found.length;
    return found.slice(0, max);
}

/** Names (from a candidate list) mentioned in the text. */
export function mentionedNames(rawText, names) {
    const text = plainText(rawText);
    const out = [];
    for (const n of names || []) {
        const name = String(n || '').trim();
        if (name.length < 2) continue;
        if (new RegExp(`(?<![\\w])${escRx(name)}(?![\\w])`, 'i').test(text)) out.push(name);
    }
    return out;
}
