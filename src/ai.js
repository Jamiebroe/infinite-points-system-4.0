// Optional AI integration. All AI output is untrusted:
//  - event analysis may only reference existing category ids; points always come from the rules;
//  - generated products pass validateProducts() and receive formula prices.
// On any failure callers fall back to keyword detection / the built-in catalog.
import { ctx } from './st.js';
import { extractJson, validateProducts } from './validate.js';
import { truncate, plainText, clamp } from './util.js';
import { categoryXp } from './content.js';
import { TYPES, DURATIONS, RARITIES } from './pricing.js';

/** Connection Manager profiles usable for requests (empty when unavailable). */
export function listProfiles() {
    try {
        return ctx().ConnectionManagerRequestService.getSupportedProfiles().map(p => ({ id: p.id, name: p.name }));
    } catch {
        return [];
    }
}

/** Send a prompt via the configured source. Returns raw text. */
export async function generate(settings, systemPrompt, userPrompt, maxTokens) {
    const c = ctx();
    const tokens = clamp(maxTokens || settings.ai?.maxTokens || 900, 100, 4000);
    if (settings.ai?.source === 'profile' && settings.ai.profileId) {
        const res = await c.ConnectionManagerRequestService.sendRequest(
            settings.ai.profileId,
            [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            tokens,
            { stream: false, extractData: true, includePreset: true, includeInstruct: true },
        );
        return typeof res === 'string' ? res : (res?.content ?? '');
    }
    return await c.generateRaw({ prompt: userPrompt, systemPrompt, responseLength: tokens, trimNames: false });
}

export function withTimeout(promise, ms, label = 'AI request') {
    let t;
    return Promise.race([promise, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${label} timed out`)), ms); })])
        .finally(() => clearTimeout(t));
}

// ---------------------------------------------------------------- event analysis
export async function analyzeEvents(settings, message, previousText) {
    const cats = settings.categories.filter(c => c.enabled);
    if (!cats.length) return [];
    const catList = cats.map(c => `- ${c.id}: ${c.name} (e.g. ${truncate(c.keywords, 90)})`).join('\n');
    const sys = 'You are a strict event classifier for a fictional roleplay game. Output only JSON. Never invent categories.';
    const user = [
        'Which reward categories does the LATEST message clearly depict actually HAPPENING in the story (not planned, wished, failed, negated, hypothetical or merely mentioned)?',
        `Categories:\n${catList}`,
        `Intensity: none, ${settings.intensity.map(t => t.id).join(', ')}.`,
        previousText ? `Previous message (context only):\n"""${truncate(plainText(previousText), 600)}"""` : '',
        `LATEST message${message.isUser ? ' (by the user)' : ` (by ${message.name || 'the character'})`}:\n"""${truncate(plainText(message.text), 2500)}"""`,
        'Reply with ONLY a JSON array like [{"category":"kiss","intensity":"major","evidence":"short quote"}], or [] if nothing qualifies. Max 3 entries.',
    ].filter(Boolean).join('\n\n');
    const data = extractJson(await withTimeout(generate(settings, sys, user, 300), 90_000));
    if (!Array.isArray(data)) throw new Error('AI returned no JSON array');
    const out = [];
    for (const e of data.slice(0, settings.detection.maxEventsPerMessage || 3)) {
        const cat = cats.find(c => c.id === String(e?.category || '').trim());
        if (!cat || out.some(o => o.catId === cat.id)) continue;
        const tier = settings.intensity.find(t => t.id === String(e.intensity || '').toLowerCase());
        out.push({
            catId: cat.id, base: Number(cat.points) || 0, xp: categoryXp(cat), mult: tier ? Number(tier.mult) || 1 : 1, intensity: tier?.id || null,
            snippet: truncate(String(e.evidence || ''), 200), keyword: 'AI', source: 'ai',
        });
    }
    return out;
}

// ---------------------------------------------------------------- shop purpose interpretation
export async function interpretPurpose(settings, request) {
    const sys = 'You configure a fictional in-story shop. Output only JSON.';
    const user = `The user asked for: """${truncate(request, 300)}"""\nReturn {"label":"short shop name (max 40 chars)","summary":"one sentence: what the shop sells","tags":["5-10 lowercase single-word product tags"]}`;
    const data = extractJson(await withTimeout(generate(settings, sys, user, 250), 60_000));
    if (!data || typeof data !== 'object' || !data.label) throw new Error('AI could not interpret the shop purpose');
    return {
        label: truncate(String(data.label), 40),
        summary: truncate(String(data.summary || ''), 200),
        tags: (Array.isArray(data.tags) ? data.tags : []).map(t => String(t).toLowerCase().replace(/[^a-z0-9-]/g, '')).filter(Boolean).slice(0, 10),
    };
}

// ---------------------------------------------------------------- product generation
export async function generateProducts(settings, { purpose, setting, owned = [], prefs = [], restrictions = [], recentNames = [], count = 6, storyContext = '' }) {
    const sys = 'You design products for a private, supernatural "System Shop" in an adult fictional roleplay. Adults only. Every product must be a means of getting, compelling, exposing or enduring a sexual act — leverage, surveillance, compulsion, restraint, physical capability, or a setup that creates the opportunity. Never offer romance, dating, courtship, gifts or affection. Output only JSON.';
    const user = [
        `Shop purpose: ${purpose.label}${purpose.custom ? ` – ${purpose.custom}` : ''}`,
        setting ? `Setting:\n${truncate(setting, 900)}` : '',
        storyContext ? `Recent story:\n${truncate(storyContext, 900)}` : '',
        owned.length ? `The user already owns: ${owned.join(', ')}. Do not offer these again; complementary items or stronger versions are welcome.` : '',
        prefs.length ? `The user tends to like: ${prefs.join(', ')}.` : '',
        restrictions.length ? `NEVER offer anything related to: ${restrictions.join(', ')}.` : '',
        recentNames.length ? `Avoid repeating these recent products: ${recentNames.join(', ')}.` : '',
        'Read the recent story and invent products that would be immediately useful against the specific people, places and secrets in it. Prefer a concrete tool over a vague mood.',
        `Create ${count} varied products: several cheap consumables, some mid-tier items and exactly one powerful aspirational product.`,
        `Each product: {"name","icon"(one emoji),"description"(1-2 sentences fitting the setting),"effect"(precise: what it does in the story),"type"(${TYPES.join('|')}),"duration"(${DURATIONS.join('|')}; "permanent" only for permanent/equipment),"power"(1-10, honest strength),"utility"(1-10),"rarity"(${RARITIES.join('|')}),"uses"(1-5 for consumables/services),"realityAltering"(true only for reality-bending effects),"tags"(3-6 lowercase words),"family"(base ability name shared by weaker/stronger versions)}.`,
        'Do NOT include prices – they are calculated by the System. Reply with ONLY a JSON array.',
    ].filter(Boolean).join('\n\n');
    const data = extractJson(await withTimeout(generate(settings, sys, user, Math.max(900, settings.ai?.maxTokens || 900)), 120_000));
    const list = Array.isArray(data) ? data : Array.isArray(data?.products) ? data.products : null;
    if (!list) throw new Error('AI returned no product list');
    return validateProducts(list, settings.economy, {
        source: 'ai',
        theme: purpose.theme === 'custom' ? `custom:${purpose.label}` : purpose.theme,
        defaultCategory: purpose.label,
    });
}

// ---------------------------------------------------------------- private assistant
export const PERSONALITIES = {
    neutral: 'neutral and concise',
    professional: 'polite, professional and helpful, like a concierge',
    mysterious: 'cryptic, mysterious and quietly knowing',
    playful: 'cheerful, playful and enthusiastic',
    mischievous: 'teasing, mischievous and a little smug (never cruel)',
};

export async function assistantComment(settings, situation) {
    const a = settings.assistant;
    const sys = `You are ${a.name}, a private System Shop assistant that only the user can perceive. Personality: ${PERSONALITIES[a.personality] || PERSONALITIES.neutral}. Story characters cannot see or hear you. You never make purchases. Reply with at most 2 short sentences, no quotation marks.`;
    const text = await withTimeout(generate(settings, sys, situation, 120), 45_000, 'Assistant');
    return truncate(plainText(text).replace(/^["']|["']$/g, ''), 280);
}

