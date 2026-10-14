// Test helper: a jsdom browser environment plus a fake SillyTavern context.
// Not a test file itself (so it is not picked up by the test glob).
// Requires the jsdom devDependency: run `npm install` before `npm test`.
let JSDOM;
try {
    ({ JSDOM } = await import('jsdom'));
} catch {
    throw new Error('The DOM-based test suites need jsdom. Run `npm install` first (see README → For developers).');
}

/** Install window/document/localStorage globals once per process. */
export function installDom() {
    if (globalThis.window && globalThis.document) return globalThis.window;
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
    const w = dom.window;
    globalThis.window = w;
    globalThis.document = w.document;
    globalThis.Element = w.Element;
    globalThis.Node = w.Node;
    globalThis.HTMLElement = w.HTMLElement;
    globalThis.localStorage = w.localStorage;
    globalThis.matchMedia = w.matchMedia;
    if (!w.matchMedia) {
        w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
        globalThis.matchMedia = w.matchMedia;
    }
    if (!w.URL.createObjectURL) w.URL.createObjectURL = () => 'blob:test';
    if (!w.URL.revokeObjectURL) w.URL.revokeObjectURL = () => {};
    return w;
}

export const EVENT_TYPES = {
    APP_READY: 'app_ready',
    CHAT_CHANGED: 'chat_id_changed',
    CHAT_LOADED: 'chatLoaded',
    MESSAGE_SENT: 'message_sent',
    MESSAGE_RECEIVED: 'message_received',
    MESSAGE_EDITED: 'message_edited',
    MESSAGE_DELETED: 'message_deleted',
    MESSAGE_UPDATED: 'message_updated',
    MESSAGE_SWIPED: 'message_swiped',
    MESSAGE_SWIPE_DELETED: 'message_swipe_deleted',
    MORE_MESSAGES_LOADED: 'more_messages_loaded',
    GENERATION_STARTED: 'generation_started',
    GENERATION_ENDED: 'generation_ended',
    GENERATION_STOPPED: 'generation_stopped',
    USER_MESSAGE_RENDERED: 'user_message_rendered',
    CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
    WORLD_INFO_ACTIVATED: 'world_info_activated',
    SETTINGS_UPDATED: 'settings_updated',
};

export const POPUP_TYPE = { TEXT: 0, CONFIRM: 1, INPUT: 2, DISPLAY: 3, CROP: 4 };
export const POPUP_RESULT = { AFFIRMATIVE: 1, NEGATIVE: 0, CANCELLED: -1 };

export function makeEventSource() {
    const handlers = new Map();
    return {
        on(type, fn) { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(fn); return this; },
        once(type, fn) { return this.on(type, fn); },
        off(type, fn) { const l = handlers.get(type) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); return this; },
        removeListener(type, fn) { return this.off(type, fn); },
        makeLast() { return this; },
        async emit(type, ...args) { for (const fn of [...(handlers.get(type) || [])]) await fn(...args); },
        listenerCount(type) { return (handlers.get(type) || []).length; },
    };
}

let clock = Date.parse('2026-10-14T12:00:00Z');

/** A chat message in the shape SillyTavern stores. */
export function message(text, isUser = false, name = isUser ? 'You' : 'Alice') {
    clock += 60_000;
    const send_date = new Date(clock).toISOString();
    return { name, is_user: isUser, mes: text, send_date, swipes: [text], swipe_id: 0, swipe_info: [{ send_date, extra: {} }], extra: {} };
}

/**
 * Create a fake SillyTavern context and install it as globalThis.SillyTavern.
 * Returns the context so tests can mutate the chat / read saved metadata.
 */
export function createFakeST({ chatId = 'chatA', chat = [], character = null, characters = null, groupId = null, groups = [] } = {}) {
    const eventSource = makeEventSource();
    const extensionSettings = {};
    const chatMetadata = {};
    const metaStore = {};
    const st = {
        eventSource,
        eventTypes: EVENT_TYPES,
        event_types: EVENT_TYPES,
        extensionSettings,
        chatMetadata,
        chat,
        characters: characters || [character || { name: 'Alice', avatar: 'alice.png', description: 'A wandering knight.', scenario: 'A crumbling kingdom.' }],
        characterId: 0,
        groupId,
        groups,
        name1: 'You',
        name2: 'Alice',
        POPUP_TYPE,
        POPUP_RESULT,
        _chatId: chatId,
        _metaStore: metaStore,
        _saves: 0,
        _settingsSaves: 0,
        _prompt: null,
        _popupAnswer: POPUP_RESULT.AFFIRMATIVE,
        _generateReply: '[]',
        getCurrentChatId() { return st._chatId; },
        async saveMetadata() { st._saves++; return true; },
        saveSettingsDebounced() { st._settingsSaves++; },
        async saveChat() { return true; },
        setExtensionPrompt(key, value, position, depth, scan, role) { st._prompt = { key, value, position, depth, scan, role }; },
        async callGenericPopup(html, type) {
            st._lastPopup = { html, type };
            if (type === POPUP_TYPE.CONFIRM) return st._popupAnswer;
            if (type === POPUP_TYPE.INPUT) return st._popupAnswer === POPUP_RESULT.AFFIRMATIVE ? '' : false;
            return '';
        },
        substituteParams: t => String(t ?? ''),
        async generateRaw() { return st._generateReply; },
        ConnectionManagerRequestService: {
            getSupportedProfiles: () => [],
            async sendRequest() { return st._generateReply; },
        },
        onlineStatus: 'no_connection',
    };
    metaStore[chatId] = chatMetadata;
    globalThis.SillyTavern = {
        getContext: () => st,
        libs: { DOMPurify: { sanitize: s => s }, localforage: null },
    };
    return st;
}

/**
 * Switch the fake context to another chat (simulates SillyTavern's chat switching).
 * Like SillyTavern, each chat owns its own chatMetadata object.
 */
export function switchChat(st, chatId, chat) {
    if (st._chatId) st._metaStore[st._chatId] = st.chatMetadata;
    st._chatId = chatId;
    st.chatMetadata = st._metaStore[chatId] ||= {};
    if (chat) st.chat = chat;
    return st;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Advance the engine's debounced sync and wait for it to settle. */
export async function settle(ms = 90) {
    await sleep(ms);
}
