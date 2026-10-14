import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers/st-dom.mjs';

installDom();

const { mountShell, TABS } = await import('../src/ui/shell.js');
const { notify, notifications, clearNotifications, renderNotifications, unreadCount, markAllRead } = await import('../src/ui/notify.js');
const { newProgress, manualAdjust, awardEvent } = await import('../src/model.js');
const { newMemory, setPurpose, toggleWish, addRestriction, bumpPref, addSettingNote, recordRotation, recordPurchase } = await import('../src/memory.js');
const { generateRotation } = await import('../src/shop.js');
const { purchase, useItem } = await import('../src/inventory.js');
const { defaultSettings } = await import('../src/defaults.js');
const { ACHIEVEMENTS } = await import('../src/content.js');
const tabs = {
    overview: await import('../src/ui/tabs/overview.js'),
    shop: await import('../src/ui/tabs/shop.js'),
    inventory: await import('../src/ui/tabs/inventory.js'),
    stats: await import('../src/ui/tabs/stats.js'),
    achievements: await import('../src/ui/tabs/achievements.js'),
    history: await import('../src/ui/tabs/history.js'),
    memory: await import('../src/ui/tabs/memory.js'),
    settings: await import('../src/ui/tabs/settings.js'),
};

const settings = defaultSettings();
const env = (extra = {}) => ({ now: Date.now(), day: '2026-10-14', settings, achievements: ACHIEVEMENTS, cats: {}, ...extra });

/** A fully-populated engine state so every tab has something to render. */
function richState() {
    const p = newProgress();
    manualAdjust(p, 50_000, 'test', env());
    const m = newMemory();
    setPurpose(m, { theme: 'supernatural', label: 'Supernatural Abilities' });
    addRestriction(m, 'combat');
    bumpPref(m, 'telepathy', 7, 'user');
    addSettingNote(m, 'Modern Tokyo at night', 'auto');
    recordRotation(m, '2026-10-13', ['supernatural:telepathy'], 'seed');
    const cats = { combat: { id: 'combat', name: 'Combat', icon: '⚔️', enabled: true, points: 30 } };
    awardEvent(p, { key: 'k1', fp: 'f1', chat: 'c', slot: 's1', idx: 1, catId: 'combat', catName: 'Combat', icon: '⚔️', base: 30, mult: 1, snippet: 'She defeated the revenant.', chars: ['Alice'] }, { ...env(), cats });
    const rot = generateRotation({ m, p, settings, day: '2026-10-14' });
    toggleWish(m, rot.items[0]);

    // Buy a stackable timed consumable (search several rotations so the test is not date-dependent)
    // plus one permanent ability, so the Inventory tab always has content.
    let consumable = null, consumableRot = rot, permanent = null, permanentRot = rot;
    for (let d = 1; d <= 28; d++) {
        const r = d === 14 ? rot : generateRotation({ m, p, settings, day: `2026-10-${String(d).padStart(2, '0')}` });
        if (!consumable) {
            const c = r.items.find(i => i.type === 'consumable' && i.duration !== 'instant' && i.stock === null);
            if (c) { consumable = c; consumableRot = r; }
        }
        if (!permanent) {
            const perm = r.items.find(i => i.type === 'permanent');
            if (perm) { permanent = perm; permanentRot = r; }
        }
        if (consumable && permanent) break;
    }
    if (consumable) {
        purchase(p, consumableRot, consumable.key, env({ opId: 'ui1' }));
        purchase(p, consumableRot, consumable.key, env({ opId: 'ui2' }));
        useItem(p, consumable.key, env({ msgCount: 5, chatId: 'chatA' }));
        recordPurchase(m, consumable);
    }
    if (permanent) {
        purchase(p, permanentRot, permanent.key, env({ opId: 'ui3' }));
        recordPurchase(m, permanent);
    }
    return { progress: p, memory: m, rotation: rot, consumable, permanent };
}

function fakeShell() {
    return { open() {}, close() {}, refresh() {}, setTab() {}, isOpen: () => true };
}

function buildCtx(overrides = {}) {
    const { progress, memory, rotation } = richState();
    return {
        settings, progress, memory, rotation,
        ready: true, chatId: 'chatA', msgCount: 10, resetMs: 3_600_000, aiStatus: '', chatLabel: 'Alice',
        achievements: ACHIEVEMENTS, aiAvailable: false, shell: fakeShell(),
        notify: () => {}, save: () => {}, rerender: () => {}, assistantLog: () => [{ ts: Date.now(), text: 'Something stirs.', kind: 'rare' }],
        injectionPreview: () => '[The System] Balance: 50,000',
        openEditor: () => {}, closeEditor: () => {},
        actions: new Proxy({}, { get: () => () => {} }),
        ...overrides,
    };
}

// ---------------------------------------------------------------- shell
test('shell mounts a floating button, a hidden panel and all eight tabs', () => {
    document.body.innerHTML = '';
    const shell = mountShell({ render: () => {} });
    assert.ok(document.querySelector('#ipi-root'), 'root created');
    assert.ok(document.querySelector('.ipi-fab'), 'floating button created');
    const panel = document.querySelector('.ipi-panel');
    assert.ok(panel, 'panel created');
    assert.ok(panel.classList.contains('ipi-hidden'), 'panel starts hidden');
    assert.equal(document.querySelectorAll('.ipi-tab').length, TABS.length);
    assert.equal(TABS.length, 8);
    assert.equal(document.querySelectorAll('.ipi-toasts').length, 1);
    shell.destroy();
    assert.equal(document.querySelector('#ipi-root'), null);
});

test('shell opens, switches tabs, collapses, applies themes and shows the balance', () => {
    document.body.innerHTML = '';
    const rendered = [];
    const shell = mountShell({ render: (body, tab) => { rendered.push(tab); body.append(document.createElement('p')); } });

    shell.open();
    assert.equal(shell.isOpen(), true);
    assert.equal(document.querySelector('.ipi-panel').classList.contains('ipi-hidden'), false);
    assert.equal(shell.activeTab(), 'overview');

    shell.setTab('shop');
    assert.equal(shell.activeTab(), 'shop');
    assert.equal(document.querySelector('.ipi-tab[data-tab="shop"]').classList.contains('ipi-tab--active'), true);
    assert.ok(rendered.includes('shop'));

    shell.setBalance('1,234', 'Credits');
    assert.equal(document.querySelector('.ipi-balance__value').textContent, '1,234');
    assert.equal(document.querySelector('.ipi-fab__badge').textContent, '1,234');

    shell.setTitle('The System', 'Alice');
    assert.equal(document.querySelector('.ipi-head__title').textContent, 'The System');
    assert.equal(document.querySelector('.ipi-head__sub').textContent, 'Alice');

    shell.setCompact(true);
    assert.equal(document.querySelector('#ipi-root').classList.contains('ipi-compact'), true);

    shell.setTheme({ theme: 'crimson', accent: '#00ff00', buttonSize: 72 });
    const root = document.querySelector('#ipi-root');
    assert.equal(root.style.getPropertyValue('--ipi-accent'), '#00ff00');
    assert.equal(root.style.getPropertyValue('--ipi-fab-size'), '72px');

    shell.setTheme({ theme: 'light', animations: false });
    assert.equal(root.classList.contains('ipi-light'), true);
    assert.equal(root.classList.contains('ipi-no-anim'), true);

    shell.setUnread(3);
    assert.equal(document.querySelector('.ipi-bell__count').textContent, '3');

    shell.close();
    assert.equal(shell.isOpen(), false);
    assert.equal(document.querySelector('.ipi-panel').classList.contains('ipi-hidden'), true);
    shell.destroy();
});

test('shell survives a renderer that throws', () => {
    document.body.innerHTML = '';
    const shell = mountShell({ render: () => { throw new Error('boom'); } });
    shell.open();
    assert.match(document.querySelector('.ipi-body').textContent, /failed to render/);
    shell.destroy();
});

// ---------------------------------------------------------------- notifications
test('notifications are recorded, rendered and cleared', () => {
    document.body.innerHTML = '';
    clearNotifications();
    const shell = mountShell({ render: () => {} });

    notify({ kind: 'award', title: '+30 Points', text: 'Combat', icon: '⚔️' });
    notify({ kind: 'purchase', title: 'Bought a tonic' });

    assert.equal(notifications().length, 2);
    assert.equal(unreadCount(), 2);
    assert.ok(document.querySelectorAll('.ipi-toast').length >= 1, 'toast rendered');
    assert.match(document.querySelector('.ipi-toast').textContent, /\+30 Points/);

    const list = document.createElement('div');
    renderNotifications(list);
    assert.match(list.textContent, /Bought a tonic/);

    markAllRead();
    assert.equal(unreadCount(), 0);
    clearNotifications();
    assert.equal(notifications().length, 0);
    renderNotifications(list);
    assert.match(list.textContent, /No notifications yet/);
    shell.destroy();
});

// ---------------------------------------------------------------- tabs
test('every tab renders real content with a populated state', () => {
    document.body.innerHTML = '';
    const ctx = buildCtx();
    for (const [id, tab] of Object.entries(tabs)) {
        const body = document.createElement('div');
        tab.render(body, ctx);
        assert.ok(body.children.length > 0, `${id}: rendered something`);
        const text = body.textContent;
        assert.ok(text.length > 40, `${id}: has meaningful text (${text.length} chars)`);
        assert.ok(!/undefined|\[object Object\]|NaN/.test(text), `${id}: no placeholder leakage → ${text.slice(0, 160)}`);
    }
});

test('tabs render a helpful empty state when no chat is open', () => {
    document.body.innerHTML = '';
    const ctx = buildCtx({ ready: false, progress: null, memory: null, rotation: null });
    for (const [id, tab] of Object.entries(tabs)) {
        const body = document.createElement('div');
        tab.render(body, ctx);
        assert.ok(body.children.length > 0, `${id}: rendered an empty state`);
        assert.ok(/chat/i.test(body.textContent), `${id}: mentions opening a chat`);
    }
});

test('the Shop tab shows purpose, prices, stock and the buy state', () => {
    document.body.innerHTML = '';
    const body = document.createElement('div');
    tabs.shop.render(body, buildCtx());
    const text = body.textContent;
    assert.match(text, /Supernatural Abilities/);
    assert.ok(body.querySelectorAll('.ipi-product').length >= 4, 'product cards rendered');
    assert.ok(body.querySelectorAll('.ipi-product .ipi-price__now').length >= 4, 'prices rendered');
    assert.match(text, /How prices work/);
    assert.ok(body.querySelectorAll('.ipi-filters .ipi-chip').length >= 4, 'filters rendered');
});

test('the Inventory tab groups owned items and shows live effects', () => {
    document.body.innerHTML = '';
    const body = document.createElement('div');
    tabs.inventory.render(body, buildCtx());
    assert.ok(body.querySelectorAll('.ipi-item').length >= 1, 'owned items rendered');
    assert.match(body.textContent, /Active effects/);
});

test('the History tab shows events and the transaction ledger', () => {
    document.body.innerHTML = '';
    const body = document.createElement('div');
    tabs.history.render(body, buildCtx());
    assert.ok(body.querySelectorAll('.ipi-event').length >= 1, 'event rows rendered');
    assert.ok(body.querySelectorAll('.ipi-ledger__row').length >= 1, 'ledger rows rendered');
    assert.match(body.textContent, /Transaction ledger/);
    assert.match(body.textContent, /Add an event manually/);
});

test('the Settings tab exposes every configurable rule', () => {
    document.body.innerHTML = '';
    const body = document.createElement('div');
    tabs.settings.render(body, buildCtx());
    const text = body.textContent;
    for (const needle of [
        'General', 'Event detection', 'Reward categories', 'Intensity multipliers', 'Milestones',
        'Fair and balanced pricing', 'Daily shop rotation', 'What the AI knows', 'AI source',
        'Private shop assistant', 'Interface', 'Backups, import & export', 'Danger zone',
    ]) assert.ok(text.includes(needle), `settings section present: ${needle}`);
    assert.ok(body.querySelectorAll('.ipi-catrow').length >= 5, 'category rows rendered');
});

test('the Shop Memory tab exposes memory management', () => {
    document.body.innerHTML = '';
    const body = document.createElement('div');
    tabs.memory.render(body, buildCtx());
    const text = body.textContent;
    assert.match(text, /Shop purpose/);
    assert.match(text, /Never sell these/);
    assert.match(text, /Wishlist/);
    assert.match(text, /Change log/);
    assert.match(text, /Memory management/);
});

test('the assistant card is rendered on the Points tab', () => {
    document.body.innerHTML = '';
    const body = document.createElement('div');
    tabs.overview.render(body, buildCtx());
    assert.ok(body.querySelector('.ipi-card--assistant'), 'assistant card present');
    assert.match(body.textContent, /Echo/);
});
