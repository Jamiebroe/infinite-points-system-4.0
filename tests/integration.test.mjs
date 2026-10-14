// End-to-end test: boots the real extension (index.js) against a fake SillyTavern
// and drives the real engine + real interface.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, createFakeST, message, switchChat, EVENT_TYPES, POPUP_RESULT, POPUP_TYPE, sleep } from './helpers/st-dom.mjs';

installDom();

const st = createFakeST({
    chatId: 'chatA',
    chat: [message('Good evening, traveller.', true), message('She kissed him at the gate.')],
});

const mod = await import('../index.js');
const { __test__ } = mod;
const { ensureRotation } = await import('../src/market.js');
const { dayKey } = await import('../src/core.js');
const { ownedItems } = await import('../src/inventory.js');

async function waitFor(fn, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (fn()) return true;
        await sleep(25);
    }
    return false;
}

const booted = await waitFor(() => !!__test__.shell && !!__test__.state.st, 8000);

/** Let the debounced chat sync (350 ms) finish. */
const sync = () => sleep(700);

const S = () => __test__.state;
const progress = () => S().st.progress;
const memory = () => S().st.memory;
const ledgerSum = () => progress().ledger.reduce((sum, t) => sum + t.amount, 0);

// Wait for the first sync, which baselines the messages that already existed.
const baselined = await waitFor(() => !!S().st?.container?.initialized, 8000);

test('the extension boots and mounts the interface against the live chat', async () => {
    assert.ok(booted, 'the extension booted');
    assert.ok(baselined, 'the initial baseline sync completed');
    assert.ok(document.querySelector('#ipi-root'), 'interface mounted');
    assert.equal(document.querySelectorAll('.ipi-tab').length, 8, 'eight tabs');
    assert.equal(S().chat, 'chatA');
    assert.equal(S().st.progress.balance, 0, 'existing history is baselined, not rewarded');
    assert.ok(S().st.shop.current, 'a rotation exists');

    const shell = __test__.shell;
    shell.open();
    assert.equal(shell.isOpen(), true);
    assert.equal(document.querySelector('.ipi-balance__unit').textContent, 'Points');
    assert.match(document.querySelector('.ipi-head__sub').textContent, /Alice/);

    // every tab renders against the live engine state without throwing
    for (const id of ['overview', 'shop', 'inventory', 'stats', 'achievements', 'history', 'memory', 'settings']) {
        shell.setTab(id);
        const body = document.querySelector('.ipi-body');
        assert.ok(body.children.length > 0, `${id} rendered`);
        assert.ok(!/failed to render/.test(body.textContent), `${id} rendered without error`);
    }
    assert.ok(st._prompt && st._prompt.key === 'infinite_points_status', 'System status is registered as an extension prompt');
});

test('new qualifying events are rewarded exactly once', async () => {
    st.chat.push(message('He undressed her beneath the altar.'));
    await st.eventSource.emit(EVENT_TYPES.MESSAGE_RECEIVED);
    await sync();

    const p = progress();
    assert.ok(p.balance > 0, `points awarded (balance ${p.balance})`);
    assert.ok(p.events.length >= 1, 'an event was recorded');
    assert.equal(ledgerSum(), p.balance, 'ledger sums to the balance');
    assert.ok(document.querySelectorAll('.ipi-toast').length >= 1, 'a notification was shown');

    const before = p.balance;
    await st.eventSource.emit(EVENT_TYPES.MESSAGE_RECEIVED);
    await sync();
    assert.equal(progress().balance, before, 'reloading the same chat does not award twice');
});

test('editing or regenerating a message revokes, and restoring it restores the reward', async () => {
    const p = progress();
    const before = p.balance;
    const last = st.chat[st.chat.length - 1];
    assert.ok(last, 'a character message exists');

    last.mes = 'She wandered the corridor without incident.';
    last.swipes[0] = last.mes;
    await st.eventSource.emit(EVENT_TYPES.MESSAGE_EDITED);
    await sync();
    assert.ok(progress().balance < before, 'the reward was revoked when the event disappeared');

    last.mes = 'He undressed her beneath the altar.';
    last.swipes[0] = last.mes;
    await st.eventSource.emit(EVENT_TYPES.MESSAGE_EDITED);
    await sync();
    assert.equal(progress().balance, before, 'the reward was restored exactly once');
    assert.equal(ledgerSum(), progress().balance, 'ledger still sums to the balance');
});

test('purchases deduct the exact price once and land in the inventory', async () => {
    await __test__.actions.adjustPoints(50_000);
    await sleep(60);
    const before = progress().balance;
    assert.ok(before >= 50_000, 'points were granted through the ledger');

    const rot = S().st.shop.current;
    const item = rot.items.find(i => i.price <= before) || rot.items[0];
    assert.ok(item, 'a product exists');

    await __test__.actions.buy(item.key);
    await sleep(80);

    const p = progress();
    const price = item.offer ? item.offer.price : item.price;
    assert.ok(p.inventory[item.key], 'the item is in the inventory');
    assert.equal(p.inventory[item.key].qty, 1);
    assert.equal(p.spent, price, 'exactly one price was deducted');
    assert.equal(ledgerSum(), p.balance, 'ledger sums to the balance');
    assert.ok(p.ledger.some(t => t.kind === 'purchase'), 'the purchase is in the ledger');
    assert.ok(item.sold >= 1, 'stock was consumed');
});

test('the AI context lists owned abilities and the balance', async () => {
    const text = __test__.buildCtx().injectionPreview();
    assert.match(text, /The System/i);
    assert.match(text, /Points:/);
    assert.ok(text.length > 60, 'the injection is not empty');
    assert.ok(st._prompt.value.length > 0, 'the prompt was registered with SillyTavern');
});

test('the daily rotation is stable for the same day and rebuilds when the day changes', async () => {
    const rot = ensureRotation();
    assert.equal(rot.day, dayKey());
    assert.equal(ensureRotation(), rot, 'the same object is reused for the same day');
    const keys = rot.items.map(i => i.key);

    // simulate a stale rotation (e.g. SillyTavern was open across the reset)
    rot.day = '2000-01-01';
    const fresh = ensureRotation({ silent: true });
    assert.notEqual(fresh, rot, 'a new rotation was generated');
    assert.equal(fresh.day, dayKey(), 'the new rotation belongs to today');
    assert.equal(fresh.items.length, S().settings.shop.size);
    assert.notDeepEqual(fresh.items.map(i => i.key), keys, 'the selection changed');
    assert.equal(ledgerSum(), progress().balance);
});

test('a manual refresh replaces products but never removes what you own', async () => {
    const owned = Object.keys(progress().inventory);
    assert.ok(owned.length >= 1, 'something is owned');
    const keysBefore = S().st.shop.current.items.map(i => i.key);

    const ok = await __test__.actions.refreshShop();
    await sleep(80);
    assert.notEqual(ok, false, 'the refresh succeeded');
    assert.ok(S().st.shop.current, 'a rotation exists after the refresh');
    assert.notDeepEqual(S().st.shop.current.items.map(i => i.key), keysBefore, 'products changed');
    for (const key of owned) assert.ok(progress().inventory[key], `${key} survived the refresh`);
    assert.equal(progress().inventory[owned[0]].qty, 1, 'quantity untouched');
});

test('switching chats loads that chat\'s own progression', async () => {
    const firstBalance = progress().balance;
    assert.ok(firstBalance > 0);

    switchChat(st, 'chatB', [message('A brand new story begins.', true)]);
    await st.eventSource.emit(EVENT_TYPES.CHAT_CHANGED);
    await sleep(120);

    assert.equal(S().chat, 'chatB', 'the engine followed the chat switch');
    assert.equal(progress().balance, 0, 'the new chat starts fresh');
    assert.equal(ledgerSum(), 0);
    assert.equal(Object.keys(progress().inventory).length, 0, 'no inventory carried over');

    // and the first chat's data is still intact when we switch back
    switchChat(st, 'chatA');
    st.chat = [
        message('Good evening, traveller.', true),
        message('She kissed him at the gate.'),
        message('He undressed her beneath the altar.'),
    ];
    await st.eventSource.emit(EVENT_TYPES.CHAT_CHANGED);
    await sleep(150);
    assert.equal(S().chat, 'chatA');
    assert.ok(progress().balance > 0, 'the original progression came back');
    assert.ok(Object.keys(progress().inventory).length >= 1, 'the inventory came back');
});

test('a natural-language Shop command written in chat changes the purpose (with confirmation)', async () => {
    assert.equal(memory().purpose.theme, 'general', 'starts on the default purpose');

    st.chat.push(message('[System: change the shop to blackmail material]', true));
    await st.eventSource.emit(EVENT_TYPES.MESSAGE_SENT);
    await sync();

    assert.equal(memory().purpose.theme, 'leverage', 'the purpose followed the chat command');
    assert.equal(st._lastPopup.type, POPUP_TYPE.CONFIRM, 'a confirmation was requested');
    assert.ok(memory().log.some(l => /purpose/i.test(l.text)), 'the change was logged in Shop Memory');

    // ordinary roleplay must never be treated as a command
    const before = JSON.stringify(memory().purpose);
    st.chat.push(message('"System, change the shop to weapons," the merchant joked.', true));
    await st.eventSource.emit(EVENT_TYPES.MESSAGE_SENT);
    await sync();
    assert.equal(JSON.stringify(memory().purpose), before, 'quoted dialogue did not change anything');
});

test('declining the confirmation keeps the current purpose', async () => {
    const before = JSON.stringify(memory().purpose);
    st._popupAnswer = POPUP_RESULT.NEGATIVE;
    st.chat.push(message('[System: change the shop to surveillance gear]', true));
    await st.eventSource.emit(EVENT_TYPES.MESSAGE_SENT);
    await sync();
    assert.equal(JSON.stringify(memory().purpose), before, 'the purpose was not changed');
    st._popupAnswer = POPUP_RESULT.AFFIRMATIVE;
});

test('World Info entries are captured for product generation', async () => {
    await st.eventSource.emit(EVENT_TYPES.WORLD_INFO_ACTIVATED, [
        { comment: 'The Cathedral of Ash', content: 'A burned cathedral in the old quarter.' },
        { content: 'Rain never stops here.' },
    ]);
    assert.ok(Array.isArray(S().lastWI));
    assert.ok(S().lastWI.includes('The Cathedral of Ash'));
    assert.equal(S().lastWI.length, 2, 'entries without a title fall back to their content');
});

test('Shop Memory can be reset without touching progression', async () => {
    const balanceBefore = progress().balance;
    const ownedBefore = Object.keys(progress().inventory).sort().join(',');
    const lifetimeBefore = progress().lifetime;
    const ledgerBefore = progress().ledger.length;
    assert.ok(memory().purpose.theme !== 'general' || memory().log.length > 0, 'memory has content to clear');

    await __test__.actions.resetMemory();
    await sleep(120);

    assert.equal(memory().purpose.theme, 'general', 'the purpose was reset');
    assert.equal(memory().wishlist.length, 0, 'the wishlist was cleared');
    assert.equal(progress().balance, balanceBefore, 'the balance is untouched');
    assert.equal(progress().lifetime, lifetimeBefore, 'lifetime is untouched');
    assert.equal(Object.keys(progress().inventory).sort().join(','), ownedBefore, 'the inventory is untouched');
    assert.ok(progress().ledger.length >= ledgerBefore, 'the ledger is untouched');
});

test('data survives a reload of the same chat (metadata is written and re-read)', async () => {
    const balance = progress().balance;
    const owned = Object.keys(progress().inventory).sort().join(',');
    const { persist } = await import('../src/core.js');
    await persist({ immediate: true });

    assert.ok(st._saves > 0, 'chat metadata was saved');
    assert.ok(st.chatMetadata.infinite_points, 'data lives in chatMetadata');
    const stored = st.chatMetadata.infinite_points;
    assert.ok(stored.progress, 'progress stored');
    assert.ok(stored.memory, 'memory stored');
    assert.ok(stored.shop, 'rotation stored');

    // reload: same chat id, same metadata object
    await st.eventSource.emit(EVENT_TYPES.CHAT_CHANGED);
    await sleep(150);
    assert.equal(progress().balance, balance, 'the balance was restored');
    assert.equal(Object.keys(progress().inventory).sort().join(','), owned, 'the inventory was restored');
});

test('export/import round-trips progression and Shop Memory', async () => {
    const { exportBundle, parseBundle } = await import('../src/backup.js');
    const bundle = exportBundle(S().settings, { progress: progress(), memory: memory(), shop: S().st.shop }, { includeSettings: true });
    const text = JSON.stringify(bundle);
    const parsed = parseBundle(text);
    assert.ok(parsed.progress, 'progress parsed');
    assert.ok(parsed.memory, 'memory parsed');
    assert.ok(parsed.settings, 'settings parsed');
    assert.equal(parsed.progress.balance, progress().balance);
    assert.deepEqual(parsed.memory.purpose, memory().purpose);

    assert.throws(() => parseBundle('{"format":"other"}'), /Infinite Points/);
    assert.throws(() => parseBundle('not json'), /valid JSON/);
});

test('every interface action runs without throwing and keeps the ledger consistent', async () => {
    const a = __test__.actions;
    const balance = progress().balance;
    const key = S().st.shop.current.items[0].key;

    // Shop Memory actions
    a.prefer('telepathy');
    a.ban('weapons and armour');
    a.unban('weapons');
    a.unban('armour');
    a.setPref('stealth', 5, false);
    a.setPref('stealth', 5, true);
    a.deletePref('stealth');
    a.toggleLock('magic');
    a.addSettingNote('A test setting note');
    const note = memory().setting.find(s => s.text === 'A test setting note');
    a.deleteSettingNote(note.id);
    a.forgetProduct(key);
    a.wish(key);
    a.unwish(key);
    a.endEffect('does-not-exist');
    await sleep(120);

    assert.equal(memory().restrictions.length, 0, 'both bans were lifted');
    assert.ok(!memory().prefs.stealth, 'the preference was deleted');
    assert.ok(memory().locked.includes('magic'), 'the category was locked');
    assert.ok(!memory().setting.some(s => s.text === 'A test setting note'), 'the note was deleted');
    assert.equal(memory().wishlist.length, 0, 'wish toggled on and off');

    // read-only actions
    assert.ok(a.economySnapshot().expectedDaily > 0);
    assert.ok(Array.isArray(a.recommendations()));
    a.exportEvents([]);
    a.exportCsv('a,b\r\n1,2');
    a.resetButtonPos();
    await sleep(40);

    // shop + history actions
    a.scanHistory();
    a.retryAi();
    await sleep(120);
    assert.equal(ledgerSum(), progress().balance, 'the ledger still sums to the balance');

    // progression-scope round trip
    await a.changeScope('scope', 'global');
    await sleep(200);
    assert.equal(S().settings.scope, 'global');
    assert.equal(progress().balance, 0, 'the global scope starts empty');
    await a.changeScope('scope', 'chat');
    await sleep(200);
    assert.equal(S().settings.scope, 'chat');
    assert.equal(progress().balance, balance, 'switching back restored the chat progression');
    assert.equal(ledgerSum(), progress().balance);
});

test('resetting progression and settings is safe', async () => {
    const owned = Object.keys(progress().inventory).length;
    assert.ok(owned >= 1);

    await __test__.actions.resetProgression();
    await sleep(200);
    assert.equal(progress().balance, 0, 'progression was cleared');
    assert.equal(Object.keys(progress().inventory).length, 0, 'the inventory was cleared');
    assert.equal(ledgerSum(), progress().balance, 'a fresh ledger was created');
    assert.ok(memory().purpose, 'Shop Memory survived a progression reset');
    assert.ok(Array.isArray(memory().log));

    __test__.actions.resetSettings();
    await sleep(200);
    assert.equal(S().settings.currencyName, 'Points', 'settings were reset to defaults');
    assert.ok(S().settings.categories.length >= 5, 'default categories are back');
    assert.ok(memory().purpose, 'Shop Memory still survived');
    assert.equal(progress().balance, 0);
});



