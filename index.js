// Infinite Points — The System. SillyTavern extension entry point.
//
// This file is the only place that talks to SillyTavern events and wires the pure engine (src/*)
// to the interface (src/ui/*). Everything else stays testable in Node.
import { MODULE, VERSION, fmt, truncate, plainText, uid, deepFill } from './src/util.js';
import { S, initSettings, loadForChat, requestSync, scanHistory, retryFailedAi, setGenerating, ready, persist, mutate, updateInjection, currentInjection, dayKey, assistantSay } from './src/core.js';
import { ctx, confirmPopup, currentOwner, settingSummary } from './src/st.js';
import { saveSettings, replaceState, profileKey } from './src/storage.js';
import { defaultSettings } from './src/defaults.js';
import { ACHIEVEMENTS } from './src/content.js';
import { nextResetMs, fmtDuration } from './src/time.js';
import { endEffect as endEffectPure, ownedItems } from './src/inventory.js';
import { manualAdjust, adjustEvent, revokeEvent as revokeEventPure, awardEvent } from './src/model.js';
import { ensureRotation, manualRefresh, onEconomyChanged, buy, use, milestoneOffers, changePurpose, aiRestock as aiRestockImpl } from './src/market.js';
import { addRestriction, removeRestriction, bumpPref, setPref, deletePref, toggleLock, toggleWish, forgetProduct, clearPurchaseLearning, resetMemory, addSettingNote, addInterest, memLog } from './src/memory.js';
import { exportBundle, parseBundle, download, pickFile, snapshotNow } from './src/backup.js';
import { parseShopCommands, interestHints } from './src/commands.js';
import { recommend } from './src/shop.js';
import { assistantComment } from './src/ai.js';
import { economyModel } from './src/ui/viewmodel.js';
import { mountShell } from './src/ui/shell.js';
import { notify, unreadCount } from './src/ui/notify.js';
import { el, qs, animate } from './src/ui/dom.js';
import * as overviewTab from './src/ui/tabs/overview.js';
import * as shopTab from './src/ui/tabs/shop.js';
import * as inventoryTab from './src/ui/tabs/inventory.js';
import * as statsTab from './src/ui/tabs/stats.js';
import * as achievementsTab from './src/ui/tabs/achievements.js';
import * as historyTab from './src/ui/tabs/history.js';
import * as memoryTab from './src/ui/tabs/memory.js';
import * as settingsTab from './src/ui/tabs/settings.js';

const TABS_MAP = {
    overview: overviewTab, shop: shopTab, inventory: inventoryTab, stats: statsTab,
    achievements: achievementsTab, history: historyTab, memory: memoryTab, settings: settingsTab,
};

let shell = null;
let ticker = null;
let lastDay = '';

// ---------------------------------------------------------------- small helpers
const uiNotify = entry => {
    if (!S.settings?.ui?.notifications && !entry?.force) return null;
    return notify(entry);
};

function resetMs() {
    if (!S.settings) return 0;
    return Math.max(0, nextResetMs(Date.now(), S.settings.shop.timezone, S.settings.shop.resetTime) - Date.now());
}

function aiAvailable() {
    const ai = S.settings?.ai;
    if (!ai) return false;
    return ai.source === 'main' ? true : !!ai.profileId;
}

function ownerLabel() {
    const o = currentOwner();
    return o ? (o.group ? `Group: ${o.name}` : o.name) : 'no chat open';
}

function updateHeader() {
    if (!shell) return;
    shell.setBalance(fmt(S.st?.progress?.balance || 0), S.settings?.currencyName || 'Points');
    shell.setTitle(S.settings?.systemName || 'The System', ownerLabel());
    shell.setStatus(S.aiStatus || (ready() ? 'Watching this chat.' : 'Open a chat to begin.'));
    shell.setReset(ready() ? `Shop resets in ${fmtDuration(resetMs())}` : '');
    shell.setUnread(unreadCount());
}

function rerenderUI() {
    closeEditor();
    shell?.refresh();
    updateHeader();
}

/** In-panel editor modal (keeps the chat usable, unlike a full-screen popup). */
function openEditor(title, contentNode) {
    closeEditor();
    const modal = el('div', { class: 'ipi-modal' }, [
        el('div', { class: 'ipi-modal__head' }, [
            el('span', { class: 'ipi-modal__title', text: title }),
            el('button', { class: 'ipi-iconbtn', title: 'Close', onClick: () => closeEditor() }, [el('span', { text: '✕' })]),
        ]),
        el('div', { class: 'ipi-modal__body' }, [contentNode]),
    ]);
    shell.root.append(modal);
    animate(modal, 'ipi-slidein');
    return modal;
}

function closeEditor() {
    qs('.ipi-modal', shell?.root || document)?.remove();
}

async function saveAll({ rerender = true } = {}) {
    try { saveSettings(); } catch (e) { console.warn(`[${MODULE}] settings save failed`, e); }
    try { await persist(); } catch (e) { console.warn(`[${MODULE}] state save failed`, e); }
    updateInjection();
    if (rerender) rerenderUI();
}

/** Words from a free-text restriction, minus filler. */
const FILLER = new Set(['anymore', 'again', 'more', 'any', 'items', 'item', 'products', 'product', 'things', 'thing', 'please', 'the', 'a', 'an', 'me', 'from', 'now', 'on', 'of', 'and', 'to', 'sell', 'selling', 'offer', 'offering', 'stock', 'stocking', 'show', 'showing', 'ban', 'block', 'exclude', 'remove', 'all']);
function words(text) {
    return String(text || '').toLowerCase().split(/[^\p{L}\p{N}-]+/u)
        .map(w => w.trim()).filter(w => w.length > 2 && !FILLER.has(w)).slice(0, 4);
}

/** The interface context handed to every tab. */
function buildCtx() {
    return {
        settings: S.settings,
        progress: S.st?.progress || null,
        memory: S.st?.memory || null,
        rotation: S.st?.shop?.current || null,
        ready: ready(),
        chatId: S.chat,
        msgCount: (ctx().chat || []).length,
        resetMs: resetMs(),
        aiStatus: S.aiStatus,
        chatLabel: ownerLabel(),
        achievements: ACHIEVEMENTS,
        aiAvailable: aiAvailable(),
        shell,
        notify: uiNotify,
        save: saveAll,
        rerender: rerenderUI,
        assistantLog: () => S.assistantLog,
        injectionPreview: () => currentInjection(),
        openEditor,
        closeEditor,
        actions,
    };
}

// ---------------------------------------------------------------- actions
function handleBonuses(bonuses) {
    for (const b of bonuses || []) {
        if (b.type === 'achievement') uiNotify({ kind: 'achievement', title: 'Achievement unlocked', text: `${b.icon} ${b.name} (+${fmt(b.bonus)} ${S.settings.currencyName})` });
        else if (b.type === 'milestone') uiNotify({ kind: 'milestone', title: 'Milestone reached', text: `${b.name} (+${fmt(b.bonus)} ${S.settings.currencyName})` });
    }
    if (bonuses?.length) milestoneOffers(bonuses);
}

const actions = {
    // ------------------------------------------------ points & events
    adjustPoints(amount) {
        mutate((st, e) => {
            const r = manualAdjust(st.progress, amount, 'Manual correction', e);
            if (!r.ok) { uiNotify({ kind: 'warning', title: 'Correction failed', text: r.error, force: true }); return; }
            uiNotify({ kind: 'success', title: 'Points updated', text: `${amount > 0 ? '+' : ''}${fmt(amount)} ${S.settings.currencyName}`, icon: '✎' });
            handleBonuses(r.bonuses);
        });
    },

    adjustEvent(key, points) {
        mutate((st, e) => {
            const r = adjustEvent(st.progress, key, points, e, 'manual correction');
            if (!r.ok) { uiNotify({ kind: 'warning', title: 'Correction failed', text: r.error, force: true }); return; }
            uiNotify({ kind: 'success', title: 'Event corrected', text: `Now worth ${fmt(points)} ${S.settings.currencyName}.`, icon: '✎' });
        });
    },

    revokeEvent(key) {
        mutate((st, e) => {
            const tx = revokeEventPure(st.progress, key, e, 'revoked manually');
            if (tx) uiNotify({ kind: 'warning', title: 'Event revoked', text: `Removed ${fmt(-tx.amount)} ${S.settings.currencyName}.`, icon: '↩️' });
        });
    },

    addEvent(catId, text, points) {
        mutate((st, e) => {
            const cat = (S.settings.categories || []).find(c => c.id === catId);
            if (!cat) { uiNotify({ kind: 'warning', title: 'Add event', text: 'Choose a category first.', force: true }); return; }
            const key = `${S.syncId}|manual|${uid('m')}`;
            const r = awardEvent(st.progress, {
                key, fp: null, chat: S.syncId, slot: `manual:${key}`, idx: -1,
                catId: cat.id, catName: cat.name, icon: cat.icon, base: cat.points, mult: 1,
                points: Number.isFinite(points) && points > 0 ? points : undefined,
                intensity: null, snippet: String(text || 'Manually credited event'), chars: [], source: 'manual',
            }, e);
            if (r.status === 'duplicate') { uiNotify({ kind: 'info', title: 'Add event', text: 'That event was already credited.', force: true }); return; }
            uiNotify({ kind: 'award', title: 'Event added', text: `${cat.icon} ${cat.name} +${fmt(r.event.points)} ${S.settings.currencyName}` });
            handleBonuses(r.bonuses);
        });
    },

    scanHistory() {
        const n = scanHistory();
        uiNotify({ kind: 'info', title: 'Scanning history', text: n ? `Checking ${n} earlier message(s) for events…` : 'Nothing new to scan.', force: true });
    },

    retryAi() {
        retryFailedAi();
        uiNotify({ kind: 'info', title: 'AI analysis', text: 'Retrying previously failed messages…', force: true });
    },

    // ------------------------------------------------ shop
    async refreshShop() { await manualRefresh(); rerenderUI(); },

    async aiRestock() {
        if (!aiAvailable()) { uiNotify({ kind: 'warning', title: 'AI restock', text: 'Configure an AI source in Settings → AI first.', force: true }); return; }
        await aiRestockImpl({ rebuild: true });
        rerenderUI();
    },

    async buy(key) { await buy(key); rerenderUI(); },
    async use(key) { await use(key); rerenderUI(); },

    wish(key) {
        mutate(st => {
            const item = st.shop.current?.items.find(i => i.key === key) || st.memory.products[key];
            if (!item) return;
            const added = toggleWish(st.memory, item);
            uiNotify({ kind: 'info', title: added ? 'Added to wishlist' : 'Removed from wishlist', text: item.name, icon: '⭐' });
        });
    },

    unwish(key) {
        mutate(st => {
            const entry = st.memory.wishlist.find(w => w.key === key);
            if (entry) toggleWish(st.memory, entry);
        });
    },

    prefer(tag) {
        mutate(st => {
            bumpPref(st.memory, tag, 6, 'user');
            memLog(st.memory, `You asked for more "${tag}" products`);
            uiNotify({ kind: 'info', title: 'Preference saved', text: `The Shop will favour “${tag}”.`, icon: '💚' });
        });
    },

    ban(word) {
        mutate(st => {
            const list = words(word);
            let added = 0;
            for (const w of list) if (addRestriction(st.memory, w)) added++;
            if (added) uiNotify({ kind: 'info', title: 'Banned from the Shop', text: list.join(', '), icon: '🚫' });
            else uiNotify({ kind: 'warning', title: 'Nothing to ban', text: 'Try a more specific word.', force: true });
        });
    },

    unban(word) {
        mutate(st => { if (removeRestriction(st.memory, word)) uiNotify({ kind: 'info', title: 'Ban lifted', text: word, icon: '✅' }); });
    },

    forgetProduct(key) {
        mutate(st => { forgetProduct(st.memory, key); uiNotify({ kind: 'info', title: 'Forgotten', text: 'Removed from Shop Memory (your items are untouched).', icon: '🧹' }); });
    },

    setPref(tag, score, locked) {
        mutate(st => {
            if (!setPref(st.memory, tag, score, locked)) { uiNotify({ kind: 'warning', title: 'Preference', text: 'That tag is not valid.', force: true }); return; }
            uiNotify({ kind: 'success', title: 'Preference saved', text: `${tag} = ${score}${locked ? ' (locked)' : ''}`, icon: '🧩' });
        });
    },

    deletePref(tag) { mutate(st => deletePref(st.memory, tag)); },

    toggleLock(category) {
        mutate(st => {
            const locked = toggleLock(st.memory, category);
            uiNotify({ kind: 'info', title: locked ? 'Category locked' : 'Category unlocked', text: category, icon: '🔒' });
        });
    },

    async changePurpose(text) { await changePurpose(text, { source: 'manual' }); rerenderUI(); },

    async setPurposeTheme(themeId) {
        const theme = THEMES[themeId];
        if (!theme) return;
        await changePurpose(theme.label, { source: 'manual' });
        rerenderUI();
    },

    recommendations() {
        if (!ready() || !S.settings.recommendations?.enabled) return [];
        try { return recommend(S.st.memory, S.st.progress, S.settings, S.st.shop.current, 4); } catch (e) { console.warn(`[${MODULE}] recommendations failed`, e); return []; }
    },

    async economyChanged() { await onEconomyChanged(); rerenderUI(); },

    economySnapshot() { return economyModel({ settings: S.settings, progress: S.st?.progress || {} }); },

    // ------------------------------------------------ inventory
    endEffect(id) { mutate(st => { endEffectPure(st.progress, id, Date.now()); uiNotify({ kind: 'info', title: 'Effect ended', icon: '🛑' }); }); },

    // ------------------------------------------------ shop memory
    addSettingNote(text) { mutate(st => { if (addSettingNote(st.memory, text, 'user')) uiNotify({ kind: 'success', title: 'Setting note saved', text: truncate(text, 80), icon: '📝' }); }); },

    deleteSettingNote(id) {
        mutate(st => {
            const i = st.memory.setting.findIndex(s => s.id === id);
            if (i >= 0) { const [removed] = st.memory.setting.splice(i, 1); memLog(st.memory, `Setting note removed: ${truncate(removed.text, 60)}`); }
        });
    },

    clearLearning() {
        mutate(st => {
            clearPurchaseLearning(st.memory);
            uiNotify({ kind: 'info', title: 'Learning cleared', text: 'Purchase-based recommendations were cleared. Your items, Points and wishlist are untouched.', icon: '🧹' });
        });
    },

    exportMemory() {
        if (!ready()) return;
        const bundle = exportBundle(S.settings, { progress: null, memory: S.st.memory, shop: S.st.shop }, { onlyMemory: true });
        download(`infinite-points-memory-${stamp()}.json`, bundle);
        uiNotify({ kind: 'success', title: 'Shop Memory exported', icon: '⬇️' });
    },

    async importMemory() {
        const text = await pickFile();
        if (!text) return;
        try {
            const data = parseBundle(text);
            const ok = await confirmPopup('<h3>Import Shop Memory?</h3><p>This replaces Shop Memory for the current scope. Your Points, inventory and ledger are not affected.</p>', 'Import');
            if (!ok) return;
            mutate(st => { if (data.memory) Object.assign(st.memory, data.memory); });
            uiNotify({ kind: 'success', title: 'Shop Memory imported', icon: '⬆️' });
        } catch (e) {
            uiNotify({ kind: 'error', title: 'Import failed', text: e.message, force: true });
        }
    },

    async resetMemory() {
        const ok = await confirmPopup('<h3>Reset Shop Memory?</h3><p>Everything the Shop has learned — preferences, bans, wishlist, history and purpose — is deleted.</p><p><b>Your Points, inventory, achievements and transaction ledger are NOT touched.</b></p>', 'Reset memory', 'Keep it');
        if (!ok) return;
        mutate(st => { resetMemory(st.memory); });
        uiNotify({ kind: 'warning', title: 'Shop Memory reset', text: 'Progression is untouched.', icon: '⚠️' });
    },

    // ------------------------------------------------ data & safety
    exportData() {
        if (!ready()) { uiNotify({ kind: 'warning', title: 'Export', text: 'Open a chat first.', force: true }); return; }
        const bundle = exportBundle(S.settings, { progress: S.st.progress, memory: S.st.memory, shop: S.st.shop }, { includeSettings: true });
        download(`infinite-points-${stamp()}.json`, bundle);
        uiNotify({ kind: 'success', title: 'Exported', text: 'Progression, inventory, ledger, Shop Memory and settings.', icon: '⬇️' });
    },

    async importData() {
        const text = await pickFile();
        if (!text) return;
        try {
            const data = parseBundle(text);
            const ok = await confirmPopup(`<h3>Import this file?</h3><p>Progression: <b>${data.progress ? 'yes' : 'no'}</b><br>Shop Memory: <b>${data.memory ? 'yes' : 'no'}</b><br>Settings: <b>${data.settings ? 'yes' : 'no'}</b></p><p>Data in the current scope is replaced. Export first if you are unsure.</p>`, 'Import');
            if (!ok) return;
            replaceState(S.settings, data);
            if (data.settings) deepFill(S.settings, data.settings);
            saveSettings();
            await loadForChat();
            applyTheme();
            rerenderUI();
            uiNotify({ kind: 'success', title: 'Import complete', icon: '⬆️' });
        } catch (e) {
            uiNotify({ kind: 'error', title: 'Import failed', text: e.message, force: true });
        }
    },

    async snapshot() {
        if (!ready()) return;
        const ok = await snapshotNow(`chat:${S.chat}`, { progress: S.st.progress, memory: S.st.memory, shop: S.st.shop }, S.settings.backups.keep, 'manual');
        uiNotify({ kind: ok ? 'success' : 'warning', title: ok ? 'Snapshot saved' : 'Snapshot unavailable', text: ok ? 'Stored in your browser.' : 'Browser storage is not available.', force: true, icon: '📸' });
    },

    exportCsv(text) {
        const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `infinite-points-ledger-${stamp()}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    },

    exportEvents(rows) {
        download(`infinite-points-events-${stamp()}.json`, { format: 'infinite-points-events', version: VERSION, exported: new Date().toISOString(), events: rows });
    },

    async resetProgression() {
        mutate(st => {
            if (S.settings.scope === 'chat') { delete st.container.progress; st.container.initialized = 0; }
            else delete S.settings.profiles[profileKey(S.settings.scope)];
        });
        await loadForChat();
        rerenderUI();
        uiNotify({ kind: 'warning', title: 'Progression cleared', text: 'A fresh progression was created for this scope.', icon: '⚠️' });
    },

    resetSettings() {
        ctx().extensionSettings[MODULE] = defaultSettings();
        initSettings();
        saveSettings();
        applyTheme();
        rerenderUI();
        uiNotify({ kind: 'success', title: 'Settings reset', text: 'Progression and Shop Memory were kept.', icon: '♻️' });
    },

    resetButtonPos() {
        S.settings.ui.buttonPos = null;
        saveAll();
        if (shell) {
            shell.fab.style.left = shell.fab.style.top = '';
            shell.fab.style.right = shell.fab.style.bottom = '';
        }
        try { localStorage.removeItem('infinite_points_button_pos'); } catch { /* ignore */ }
        uiNotify({ kind: 'info', title: 'Button position reset', icon: '🎯' });
    },

    async changeScope(key, value) {
        if (!S.settings[key] || S.settings[key] === value) return;
        const ok = await confirmPopup(`<h3>Change storage scope?</h3><p><b>${key === 'scope' ? 'Progression' : 'Shop Memory'}</b> will now use: <b>${value}</b>.</p><p>Each scope keeps its own separate data — nothing is copied, merged or deleted. Existing data stays available if you switch back.</p>`, 'Change scope');
        if (!ok) { rerenderUI(); return; }
        S.settings[key] = value;
        saveSettings();
        await loadForChat();
        rerenderUI();
        uiNotify({ kind: 'success', title: 'Storage scope changed', text: value, icon: '🗄' });
    },

    async confirmThen(question, fn) {
        const ok = await confirmPopup(`<h3>Please confirm</h3><p>${question}</p>`, 'Confirm');
        if (!ok) return;
        await fn();
    },

    async askAssistant(text) {
        if (!aiAvailable()) { uiNotify({ kind: 'warning', title: 'Assistant', text: 'Configure an AI source first.', force: true }); return; }
        const owned = ownedItems(S.st.progress).map(i => i.name).slice(0, 20).join(', ') || 'nothing yet';
        const wish = (S.st.memory.wishlist || []).map(w => w.name).join(', ') || 'nothing';
        const situation = [
            `The user asks: "${truncate(text, 200)}"`,
            `Shop purpose: ${S.st.memory.purpose.label}.`,
            `Balance: ${S.st.progress.balance} ${S.settings.currencyName}. Lifetime: ${S.st.progress.lifetime}.`,
            `Owns: ${owned}.`,
            `Wishlist: ${wish}.`,
            `Today's products: ${(S.st.shop.current?.items || []).map(i => `${i.name} (${i.price})`).join(', ') || 'none'}.`,
            'Recommend at most two specific products and explain briefly why they suit this user. Never buy anything.',
        ].join('\n');
        try {
            const reply = await assistantComment(S.settings, situation);
            assistantSay(reply, 'reply');
            rerenderUI();
        } catch (e) {
            uiNotify({ kind: 'error', title: 'Assistant', text: truncate(e.message, 120), force: true });
        }
    },
};

function stamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// ---------------------------------------------------------------- engine hooks
function onAwards(res, expired) {
    for (const ev of res.awarded) {
        uiNotify({ kind: 'award', icon: ev.icon, title: `+${fmt(ev.points)} ${S.settings.currencyName}`, text: `${ev.catName}${ev.intensity ? ` · ${ev.intensity}` : ''}` });
    }
    for (const ev of res.restored) uiNotify({ kind: 'info', icon: '↩️', title: 'Reward restored', text: `${ev.catName} +${fmt(ev.points)}` });
    for (const ev of res.revoked) uiNotify({ kind: 'warning', icon: '↩️', title: 'Reward revoked', text: `${fmt(ev.points)} ${S.settings.currencyName}` });
    for (const e of expired) uiNotify({ kind: 'info', icon: '⌛', title: 'Effect expired', text: e.name });
    handleBonuses(res.bonuses);
    if (res.awarded.length) shell?.pulse('award');
    updateHeader();
}

function onPurchased(res) {
    uiNotify({ kind: 'purchase', icon: res.item?.icon || '🛒', title: `Bought ${res.item?.name || 'item'}`, text: `${fmt(res.price)} ${S.settings.currencyName} · balance ${fmt(S.st.progress.balance)}` });
    handleBonuses(res.bonuses);
    shell?.pulse('purchase');
    updateHeader();
}

function onAssistant() {
    if (shell?.isOpen()) shell.refresh();
    else shell?.setUnread(unreadCount());
}

/** Remember the setting once per chat so generated products fit the world. */
function maybeRememberSetting() {
    try {
        if (!ready()) return;
        const m = S.st.memory;
        if ((m.setting || []).some(s => s.source === 'auto')) return;
        const summary = settingSummary(220);
        if (summary) addSettingNote(m, summary, 'auto');
    } catch (e) { console.warn(`[${MODULE}] setting note failed`, e); }
}

function onChatLoaded() {
    ensureRotation({ silent: true });
    maybeRememberSetting();
    lastDay = dayKey();
    updateHeader();
    if (shell?.isOpen()) shell.refresh();
}

/** Natural-language Shop commands written by the User (never by characters). */
async function onUserMessage(m) {
    if (!ready() || !S.settings.commands.enabled) return;
    if (S.settings.commands.passive) {
        for (const hint of interestHints(m.text)) mutate(st => { addInterest(st.memory, hint); });
    }
    const cmds = parseShopCommands(m.text);
    if (!cmds.length) return;
    for (const cmd of cmds) {
        try {
            if (cmd.kind === 'theme') await changePurpose(cmd.value, { source: 'chat' });
            else if (cmd.kind === 'restrict') actions.ban(cmd.value);
            else if (cmd.kind === 'unrestrict') for (const w of words(cmd.value)) actions.unban(w);
            else if (cmd.kind === 'prefer') actions.prefer(cmd.value);
            else if (cmd.kind === 'avoid') mutate(st => bumpPref(st.memory, cmd.value, -5, 'user'));
            else if (cmd.kind === 'refresh') await manualRefresh();
            else if (cmd.kind === 'open') {
                const v = cmd.value.toLowerCase();
                shell?.open({ tab: v.includes('inventory') ? 'inventory' : v.includes('status') ? 'overview' : 'shop' });
            }
        } catch (e) {
            console.warn(`[${MODULE}] shop command failed`, e);
        }
    }
    uiNotify({ kind: 'info', icon: '⚙️', title: 'System command recognised', text: cmds.map(c => c.kind).join(', '), force: true });
}

function installHooks() {
    S.hooks.refresh = () => { if (shell?.isOpen()) shell.refresh(); updateHeader(); };
    S.hooks.status = () => updateHeader();
    S.hooks.awards = onAwards;
    S.hooks.bonuses = handleBonuses;
    S.hooks.purchased = onPurchased;
    S.hooks.assistant = onAssistant;
    S.hooks.chatLoaded = onChatLoaded;
    S.hooks.userMessage = onUserMessage;
}

// ---------------------------------------------------------------- rendering
function renderTab(body, tabId) {
    const tab = TABS_MAP[tabId] || overviewTab;
    tab.render(body, buildCtx());
}

function applyTheme() {
    shell?.setTheme(S.settings.ui);
    shell?.setFabVisible(S.settings.ui.showButton !== false);
}

let tickCount = 0;
function startTicker() {
    clearInterval(ticker);
    ticker = setInterval(() => {
        updateHeader();
        const day = dayKey();
        if (day !== lastDay) {
            lastDay = day;
            ensureRotation();
            if (shell?.isOpen()) shell.refresh();
        }
        // Refresh the visible tab about once a minute, but never while the user is typing.
        if (shell?.isOpen() && ++tickCount % 60 === 0) {
            const ae = document.activeElement;
            if (!ae || !/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) shell.refresh();
        }
    }, 1000);
    // In Node (automated tests) an interval would keep the process alive; browsers have no unref.
    if (typeof ticker === 'object' && typeof ticker?.unref === 'function') ticker.unref();
}

/** Capture World Info entries so generated products stay consistent with the lorebook. */
function onWorldInfo(entries) {
    try {
        S.lastWI = (Array.isArray(entries) ? entries : [])
            .map(e => String(e?.comment || e?.key?.[0] || '').trim() || truncate(plainText(e?.content || ''), 60))
            .filter(Boolean).slice(0, 12);
    } catch { S.lastWI = []; }
}

// ---------------------------------------------------------------- bootstrap
async function boot() {
    const c = ctx();
    initSettings();
    installHooks();

    shell = mountShell({
        render: renderTab,
        onPositionChange: pos => { S.settings.ui.buttonPos = pos; try { saveSettings(); } catch { /* ignore */ } },
        onOpenChange: () => updateHeader(),
    });
    applyTheme();
    shell.setTab(S.settings.ui.startTab || 'overview', { silent: true });

    const { eventSource, event_types } = c;
    if (eventSource && event_types) {
        eventSource.on(event_types.CHAT_CHANGED, async () => {
            try { await loadForChat(); } catch (e) { console.error(`[${MODULE}] chat load failed`, e); }
            updateHeader();
        });

        const syncEvents = [
            event_types.MESSAGE_RECEIVED, event_types.MESSAGE_SENT, event_types.MESSAGE_EDITED,
            event_types.MESSAGE_DELETED, event_types.MESSAGE_UPDATED, event_types.MESSAGE_SWIPED,
            event_types.MESSAGE_SWIPE_DELETED, event_types.CHARACTER_MESSAGE_RENDERED,
            event_types.USER_MESSAGE_RENDERED, event_types.MORE_MESSAGES_LOADED,
        ];
        for (const ev of syncEvents) if (ev) eventSource.on(ev, () => { setGenerating(false); requestSync(350); });

        if (event_types.GENERATION_STARTED) eventSource.on(event_types.GENERATION_STARTED, () => setGenerating(true));
        for (const ev of [event_types.GENERATION_ENDED, event_types.GENERATION_STOPPED]) {
            if (ev) eventSource.on(ev, () => { setGenerating(false); requestSync(500); });
        }
        if (event_types.WORLD_INFO_ACTIVATED) eventSource.on(event_types.WORLD_INFO_ACTIVATED, onWorldInfo);
    }

    await loadForChat();
    updateHeader();
    startTicker();
    console.log(`[${MODULE}] Infinite Points v${VERSION} ready.`);
}

function whenReady() {
    if (globalThis.SillyTavern && typeof SillyTavern.getContext === 'function') {
        boot().catch(e => console.error(`[${MODULE}] startup failed`, e));
        return;
    }
    let tries = 0;
    const t = setInterval(() => {
        if (globalThis.SillyTavern && typeof SillyTavern.getContext === 'function') {
            clearInterval(t);
            boot().catch(e => console.error(`[${MODULE}] startup failed`, e));
        } else if (++tries > 200) {
            clearInterval(t);
            console.error(`[${MODULE}] SillyTavern context never became available; the extension is inactive.`);
        }
    }, 100);
}

whenReady();

/**
 * Exposed for automated tests only (tests/integration.test.mjs drives the real interface
 * and the real engine through this). Nothing in the extension reads it.
 */
export const __test__ = {
    get shell() { return shell; },
    get state() { return S; },
    actions,
    buildCtx,
    boot,
};

