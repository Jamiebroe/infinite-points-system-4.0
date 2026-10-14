// Engine: owns runtime state and connects storage, chat sync, shop, commands and AI context.
import { MODULE, deepFill, uid, truncate, capObject, plainText } from './util.js';
import { defaultSettings } from './defaults.js';
import { ACHIEVEMENTS } from './content.js';
import { ctx, chatId, hasChat, userName, toast, currentOwner } from './st.js';
import { loadState, replaceState, scheduleChatSave, saveChatNow, saveSettings } from './storage.js';
import { writeBackup, readBackups } from './backup.js';
import { dayKeyFor } from './time.js';
import { describeChat, reconcile, changedMessages, clearBaseline, contentHash, slotIds } from './sync.js';
import { detectEvents, mentionedNames } from './detect.js';
import { analyzeEvents } from './ai.js';
import { expireEffects, activeEffects } from './inventory.js';
import { buildInjection } from './context.js';

export const S = {
    settings: null, st: null, chat: null, syncId: null,
    generating: false, restocking: false, aiStatus: '', lastWI: [],
    assistantLog: [], hooks: {}, ready: false,
};

export const hook = (name, ...args) => {
    try { return S.hooks[name]?.(...args); } catch (e) { console.error(`[${MODULE}] hook ${name} failed`, e); }
};

export function initSettings() {
    const es = ctx().extensionSettings;
    if (!es[MODULE] || typeof es[MODULE] !== 'object') es[MODULE] = defaultSettings();
    S.settings = deepFill(es[MODULE], defaultSettings());
    for (const k of ['categories', 'intensity', 'milestones']) if (!Array.isArray(S.settings[k])) S.settings[k] = defaultSettings()[k];
    return S.settings;
}

export const dayKey = (now = Date.now()) => dayKeyFor(now, S.settings.shop.timezone, S.settings.shop.resetTime);

export function env(extra = {}) {
    return {
        now: Date.now(), day: dayKey(), settings: S.settings, achievements: ACHIEVEMENTS,
        cats: Object.fromEntries(S.settings.categories.map(c => [c.id, c])), chatId: S.syncId,
        msgCount: ctx().chat?.length || 0, ...extra,
    };
}

export const ready = () => !!S.st && S.chat === chatId();

// ---------------------------------------------------------------- persistence
let backupTimer = null;
export async function persist({ immediate = false } = {}) {
    const s = S.settings, st = S.st;
    if (!st) return;
    if (s.scope !== 'chat' || s.memoryScope !== 'chat') saveSettings();
    if (immediate && !S.generating) {
        try { await saveChatNow(S.chat); } catch (e) { console.error(`[${MODULE}] save failed`, e); toast('error', 'Could not save System data to the chat file. A local backup is kept.', 'Infinite Points'); }
    } else scheduleChatSave();
    clearTimeout(backupTimer);
    const key = `chat:${S.chat}`;
    backupTimer = setTimeout(() => {
        if (!s.backups.enabled || S.st !== st) return;
        writeBackup(key, { progress: st.progress, memory: st.memory, shop: st.shop }, s.backups.keep).catch(e => console.warn(`[${MODULE}] backup failed`, e));
    }, immediate ? 0 : 1500);
}

/** If the local backup is a strict continuation of the loaded data, recover it (interrupted save). */
async function tryRecover() {
    const st = S.st;
    let rec;
    try { rec = await readBackups(`chat:${S.chat}`); } catch { return; }
    const live = rec?.live?.data;
    if (!live || S.st !== st) return;
    const recovered = [];
    const lp = live.progress, cp = st.progress;
    if (lp && lp.id === cp.id && lp.updated > cp.updated && Array.isArray(lp.ledger) && (!cp.ledger.length || lp.ledger.some(t => t.id === cp.ledger[0].id))) {
        replaceState(S.settings, { progress: lp });
        recovered.push('progression');
    }
    const lm = live.memory, cm = st.memory;
    if (lm && lm.id === cm.id && lm.updated > cm.updated) {
        replaceState(S.settings, { memory: lm, shop: live.shop });
        recovered.push('shop memory');
    }
    if (recovered.length) {
        Object.assign(S.st, loadState(S.settings));
        toast('info', `Recovered unsaved ${recovered.join(' and ')} from the local backup.`, 'Infinite Points');
        await persist({ immediate: true });
    }
}

// ---------------------------------------------------------------- chat load
export async function loadForChat() {
    S.chat = chatId();
    S.st = null;
    S.syncId = null;
    if (!S.settings.enabled || !hasChat()) {
        updateInjection();
        hook('refresh');
        return;
    }
    S.st = loadState(S.settings);
    const c = S.st.container;
    if (!c.syncId) { c.syncId = uid('sync'); c.boundChat = S.chat; }
    if (c.boundChat !== S.chat) {
        // Chat was branched, copied or renamed: start a fresh message namespace and baseline it,
        // so messages that were already rewarded can never be rewarded again.
        c.syncId = uid('sync');
        c.boundChat = S.chat;
        c.initialized = 0;
    }
    S.syncId = c.syncId;
    await tryRecover();
    if (S.chat !== chatId()) return;
    updateInjection();
    hook('refresh');
    requestSync(50);
    hook('chatLoaded');
}

// ---------------------------------------------------------------- chat synchronisation
let syncTimer = null, syncing = false, syncAgain = false;
const aiCache = new Map();      // `${syncId}|${slot}|${hash}` -> detected[] | 'pending' | 'failed'
const aiQueue = [];
let aiBusy = false;

export function requestSync(delay = 400) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { runSync().catch(e => console.error(`[${MODULE}] sync failed`, e)); }, delay);
}

function involved(m) {
    const owner = currentOwner();
    const members = owner?.members || [];
    const names = new Set();
    if (!m.isUser && m.name) names.add(m.name);
    for (const n of mentionedNames(m.text, members)) names.add(n);
    if (!names.size && members.length === 1) names.add(members[0]);
    return [...names];
}

function keywordDetect(m) {
    const d = S.settings.detection;
    if (m.isUser ? !d.scanUser : !d.scanChar) return [];
    return detectEvents(m.text, S.settings.categories, {
        intensity: S.settings.intensity, isUser: m.isUser, ignoreQuoted: d.ignoreQuoted, maxEvents: d.maxEventsPerMessage,
    });
}

function queueAi(m, cacheKey, prevText, fallback) {
    aiCache.set(cacheKey, 'pending');
    aiQueue.push({ m, cacheKey, prevText, fallback });
    pumpAi();
}

async function pumpAi() {
    if (aiBusy) return;
    aiBusy = true;
    try {
        while (aiQueue.length) {
            const job = aiQueue.shift();
            S.aiStatus = `Analyzing message #${job.m.idx}…`;
            hook('status');
            try {
                const res = await analyzeEvents(S.settings, job.m, job.prevText);
                aiCache.set(job.cacheKey, res);
            } catch (e) {
                console.warn(`[${MODULE}] AI analysis failed`, e);
                aiCache.set(job.cacheKey, S.settings.detection.aiFallback ? job.fallback : 'failed');
                S.aiStatus = `AI analysis failed (${truncate(e.message, 60)})${S.settings.detection.aiFallback ? ' – used keywords' : ' – use Event History to add events manually'}`;
                hook('status');
            }
        }
        if (!/failed/.test(S.aiStatus)) S.aiStatus = '';
        hook('status');
    } finally {
        aiBusy = false;
    }
    requestSync(50);
}

function makeDetector(rawChat) {
    const mode = S.settings.detection.mode;
    return m => {
        const d = S.settings.detection;
        if (!d.enabled || (m.isUser ? !d.scanUser : !d.scanChar)) return [];
        const kw = keywordDetect(m);
        let result = kw;
        if (mode === 'ai' || (mode === 'hybrid' && kw.length)) {
            const key = `${S.syncId}|${m.slot}|${contentHash(m.text)}`;
            const cached = aiCache.get(key);
            if (cached === undefined) { queueAi(m, key, rawChat[m.idx - 1]?.mes || '', kw); return null; }
            if (cached === 'pending') return null;
            if (cached === 'failed') return null;
            result = cached;
        }
        return result.map(r => ({ ...r, chars: involved(m) }));
    };
}

async function runSync() {
    if (!ready() || !S.settings.enabled) return;
    if (S.generating) { syncAgain = true; return; }
    if (syncing) { syncAgain = true; return; }
    syncing = true;
    try {
        const raw = ctx().chat || [];
        const messages = describeChat(raw);
        // ignore a trailing placeholder ("..." while a swipe is being generated)
        const last = messages[messages.length - 1];
        const skipIdx = last && (!last.text.trim() || last.text.trim() === '...') ? last.idx : undefined;
        const c = S.st.container, p = S.st.progress;
        // Baseline when this chat has never been synced *for this progression object*.
        // That covers a brand-new chat and a progression-scope change, so existing history is
        // never paid retroactively when you switch to a scope that starts empty.
        const baseline = !c.initialized || c.progressId !== p.id;
        const fresh = baseline ? [] : changedMessages(p, S.syncId, messages, { skipIdx }).filter(m => m.isUser);
        const e = env();
        const res = reconcile(p, S.syncId, messages, makeDetector(raw), e, { baseline, revokeOnDelete: S.settings.detection.revokeOnDelete, skipIdx });
        if (baseline) { c.initialized = Date.now(); c.progressId = p.id; }
        handleCommands(fresh, c);
        const expired = expireEffects(p, S.syncId, raw.length, e.now);
        const changed = res.awarded.length || res.restored.length || res.revoked.length || res.baselined || expired.length || res.bonuses.length;
        if (changed) {
            await persist();
            hook('awards', res, expired);
        }
        updateInjection();
        hook('refresh');
    } finally {
        syncing = false;
        if (syncAgain) { syncAgain = false; requestSync(200); }
    }
}

function handleCommands(fresh, c) {
    if (!S.settings.commands.enabled || !fresh.length) return;
    for (const m of fresh) {
        const h = contentHash(m.text);
        const k = `${S.syncId}|${m.slot}`;
        if (c.cmdSeen[k] === h) continue;
        c.cmdSeen[k] = h;
        hook('userMessage', m);
    }
    capObject(c.cmdSeen, 500, null);
}

/** Manual "scan history": award events in messages that existed before the System was attached. */
export function scanHistory() {
    if (!ready()) return 0;
    const n = clearBaseline(S.st.progress, S.syncId);
    requestSync(10);
    return n;
}

export function retryFailedAi() {
    for (const [k, v] of aiCache) if (v === 'failed') aiCache.delete(k);
    S.aiStatus = '';
    requestSync(10);
}

export function setGenerating(v) {
    S.generating = v;
    if (!v) requestSync(300);
}


// ---------------------------------------------------------------- AI context injection
export const INJECT_KEY = `${MODULE}_status`;

export function currentInjection() {
    if (!ready()) return '';
    return buildInjection({
        settings: S.settings, progress: S.st.progress, memory: S.st.memory,
        effects: activeEffects(S.st.progress, S.syncId, ctx().chat?.length || 0), userName: userName(),
    });
}

/** Register/clear the extension prompt. Works alongside World Info and Author's Note (separate slot). */
export function updateInjection() {
    const c = ctx();
    const inj = S.settings?.injection;
    const text = S.settings?.enabled && inj?.enabled ? currentInjection() : '';
    // positions: 0 = IN_PROMPT (after story string), 1 = IN_CHAT (at depth); role 0 = system
    const position = inj?.position === 'prompt' ? 0 : 1;
    const depth = Math.max(0, Math.min(50, Number(inj?.depth) || 0));
    c.setExtensionPrompt(INJECT_KEY, text, position, depth, !!inj?.scan, 0);
}

// ---------------------------------------------------------------- generic mutations with save
/** Run a state mutation, then persist and refresh. */
export async function mutate(fn, { immediate = true } = {}) {
    if (!ready()) { toast('warning', 'Open a chat first.', 'Infinite Points'); return null; }
    const result = fn(S.st, env());
    await persist({ immediate });
    updateInjection();
    hook('refresh');
    return result;
}

export function assistantSay(text, kind = 'info') {
    if (!text) return;
    S.assistantLog.unshift({ ts: Date.now(), text, kind });
    S.assistantLog.length = Math.min(S.assistantLog.length, 30);
    hook('assistant', text);
}

export { plainText, slotIds };

