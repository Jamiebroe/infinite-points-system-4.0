// Persistence.
//   chat scope   → chat_metadata.infinite_points.{progress,memory,shop}  (saved inside the chat file)
//   shared scope → extension_settings.infinite_points.profiles / memories (saved with settings)
// Every save also writes a local backup (IndexedDB via localforage) for recovery.
import { MODULE, clone } from './util.js';
import { ctx, chatId, currentOwner } from './st.js';
import { normalizeProgress } from './model.js';
import { normalizeMemory } from './memory.js';

export const newShopState = () => ({ current: null, refreshes: {}, notified: {} });

export function normalizeShop(s) {
    const d = newShopState();
    if (!s || typeof s !== 'object' || Array.isArray(s)) return d;
    for (const k of Object.keys(d)) if (k !== 'current' && (!s[k] || typeof s[k] !== 'object')) s[k] = d[k];
    if (s.current && (!Array.isArray(s.current.items) || !s.current.day)) s.current = null;
    return s;
}

export function chatContainer() {
    const md = ctx().chatMetadata;
    if (!md[MODULE] || typeof md[MODULE] !== 'object') md[MODULE] = { v: 1 };
    const c = md[MODULE];
    if (!c.cmdSeen || typeof c.cmdSeen !== 'object') c.cmdSeen = {};
    return c;
}

export function profileKey(scope) {
    if (scope === 'global') return 'global';
    if (scope === 'character') return currentOwner()?.key || 'global';
    return null;
}

export function storeKeys(s) {
    const id = chatId();
    return {
        progress: s.scope === 'chat' ? `chat:${id}` : `profile:${profileKey(s.scope)}`,
        memory: s.memoryScope === 'chat' ? `chat:${id}` : `memory:${profileKey(s.memoryScope)}`,
    };
}

/** Load (creating if needed) the containers for the active chat according to the scope settings. */
export function loadState(s) {
    const c = chatContainer();
    let progress, memory, shop;
    if (s.scope === 'chat') progress = c.progress = normalizeProgress(c.progress);
    else {
        const k = profileKey(s.scope);
        progress = s.profiles[k] = normalizeProgress(s.profiles[k]);
    }
    if (s.memoryScope === 'chat') {
        memory = c.memory = normalizeMemory(c.memory);
        shop = c.shop = normalizeShop(c.shop);
    } else {
        const box = s.memories[profileKey(s.memoryScope)] ||= {};
        memory = box.memory = normalizeMemory(box.memory);
        shop = box.shop = normalizeShop(box.shop);
    }
    return { progress, memory, shop, container: c, keys: storeKeys(s) };
}

/** Replace stored objects (import, backup restore, scope migration). */
export function replaceState(s, { progress, memory, shop }) {
    const c = chatContainer();
    if (progress) {
        if (s.scope === 'chat') c.progress = normalizeProgress(clone(progress));
        else s.profiles[profileKey(s.scope)] = normalizeProgress(clone(progress));
    }
    if (memory || shop) {
        const box = s.memoryScope === 'chat' ? c : (s.memories[profileKey(s.memoryScope)] ||= {});
        if (memory) box.memory = normalizeMemory(clone(memory));
        if (shop) box.shop = normalizeShop(clone(shop));
    }
}

// ---------------------------------------------------------------- saving
let chatTimer = null, chatTimerId = null;

/** Save chat metadata now. Refuses to save if a different chat is open (prevents cross-chat writes). */
export async function saveChatNow(expectedChatId = chatId()) {
    clearTimeout(chatTimer);
    chatTimer = null;
    if (!expectedChatId || chatId() !== expectedChatId) return false;
    await ctx().saveMetadata();
    return true;
}

export function scheduleChatSave(delay = 700) {
    const id = chatId();
    clearTimeout(chatTimer);
    chatTimerId = id;
    chatTimer = setTimeout(() => {
        chatTimer = null;
        saveChatNow(chatTimerId).catch(e => console.error(`[${MODULE}] chat save failed`, e));
    }, delay);
}

export function hasPendingChatSave() {
    return !!chatTimer;
}

export function saveSettings() {
    ctx().saveSettingsDebounced();
}
