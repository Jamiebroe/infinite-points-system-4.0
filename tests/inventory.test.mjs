import test from 'node:test';
import assert from 'node:assert/strict';
import { newProgress, manualAdjust } from '../src/model.js';
import { newMemory, setPurpose, toggleWish, clearPurchaseLearning, recordPurchase, resetMemory } from '../src/memory.js';
import { generateRotation, registerRotation } from '../src/shop.js';
import { purchase, useItem, finalPriceOf, activeEffects, expireEffects } from '../src/inventory.js';
import { defaultSettings } from '../src/defaults.js';
import { ACHIEVEMENTS } from '../src/content.js';

const settings = defaultSettings();
const env = (extra = {}) => ({ now: Date.now(), day: '2026-10-14', settings, achievements: ACHIEVEMENTS, ...extra });
const rich = () => { const p = newProgress(); manualAdjust(p, 1_000_000, 'test', env()); return p; };
const days = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`);
function findItem(m, p, prefix, pred) {
    for (const day of days(prefix, 28)) {
        const rot = generateRotation({ m, p, settings, day });
        const item = rot.items.find(pred);
        if (item) return { rot, item };
    }
    return {};
}

test('purchase deducts exact price once; fails safely without funds; idempotent op ids', () => {
    const m = newMemory(), poor = newProgress();
    const rot = generateRotation({ m, p: poor, settings, day: '2026-10-14' });
    const item = rot.items[0];
    const fail = purchase(poor, rot, item.key, env({ opId: 'op1' }));
    assert.equal(fail.code, 'funds');
    assert.equal(poor.balance, 0);
    assert.equal(poor.ledger.length, 0);
    assert.equal(item.sold, 0);

    const p = rich();
    const before = p.balance;
    const res = purchase(p, rot, item.key, env({ opId: 'op2' }));
    assert.ok(res.ok);
    // achievements unlocked by the purchase (e.g. "First Purchase") add their bonus via the ledger
    const bonus = res.bonuses.reduce((s, b) => s + b.bonus, 0);
    assert.equal(p.balance, before - finalPriceOf(item) + bonus);
    assert.equal(p.inventory[item.key].qty, 1);
    assert.equal(purchase(p, rot, item.key, env({ opId: 'op2' })).code, 'duplicate');
    assert.equal(p.balance, before - finalPriceOf(item) + bonus);
    assert.equal(p.spent, finalPriceOf(item));
    assert.equal(p.ledger.reduce((s, e) => s + e.amount, 0), p.balance, 'ledger sums to balance');
});

test('permanent items cannot be bought twice and lower/equal tiers vanish from future rotations', () => {
    const m = newMemory(), p = rich();
    setPurpose(m, { theme: 'body', label: 'Body & Performance' });
    const { rot, item } = findItem(m, p, '2026-10', i => i.type === 'permanent');
    assert.ok(item);
    assert.ok(purchase(p, rot, item.key, env({ opId: 'a' })).ok);
    assert.equal(purchase(p, rot, item.key, env({ opId: 'b' })).code, 'owned');
    for (const day of days('2026-11', 28)) {
        const r = generateRotation({ m, p, settings, day });
        assert.ok(!r.items.some(i => i.key === item.key));
        assert.ok(!r.items.some(i => i.type === 'permanent' && i.family === item.family && (i.tier || 1) <= (item.tier || 1)));
    }
});

test('limited stock sells out', () => {
    const m = newMemory(), p = rich();
    let found = {};
    for (const month of ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']) {
        found = findItem(m, p, month, i => i.stock === 1);
        if (found.item) break;
    }
    const { rot, item } = found;
    assert.ok(item, 'a single-unit product appears somewhere in the window');
    assert.ok(purchase(p, rot, item.key, env({ opId: 'x1' })).ok);
    assert.equal(purchase(p, rot, item.key, env({ opId: 'x2' })).code, 'soldout');
});

test('consumables stack, uses decrement, timed effects start and expire', () => {
    const m = newMemory(), p = rich();
    const { rot, item } = findItem(m, p, '2027-01', i => i.type === 'consumable' && i.duration === 'scene' && i.stock === null);
    assert.ok(item);
    purchase(p, rot, item.key, env({ opId: 'c1' }));
    purchase(p, rot, item.key, env({ opId: 'c2' }));
    assert.equal(p.inventory[item.key].qty, 2);
    const u = useItem(p, item.key, env({ msgCount: 10, chatId: 'c' }));
    assert.ok(u.ok && u.effect);
    assert.equal(p.inventory[item.key].qty, Math.ceil(p.inventory[item.key].charges / (item.uses || 1)));
    assert.equal(activeEffects(p, 'c', 12).length, 1);
    const n = settings.effects.sceneMessages;
    assert.equal(expireEffects(p, 'c', 10 + n, Date.now()).length, 1);
    assert.equal(activeEffects(p, 'c', 10 + n).length, 0);
});

test('memory: clearing learning or resetting memory never touches progression', () => {
    const m = newMemory(), p = rich();
    const rot = generateRotation({ m, p, settings, day: '2026-10-14' });
    registerRotation(rot, m);
    purchase(p, rot, rot.items[0].key, env({ opId: 'm1' }));
    recordPurchase(m, rot.items[0]);
    toggleWish(m, rot.items[1]);
    const snapshot = JSON.stringify(p);
    clearPurchaseLearning(m);
    assert.equal(m.wishlist.length, 1);
    resetMemory(m);
    assert.equal(m.wishlist.length, 0);
    assert.equal(JSON.stringify(p), snapshot);
});
