import test from 'node:test';
import assert from 'node:assert/strict';
import { computePrice, rarityForPower, nicePrice, priceBand, discounted, explainPrice } from '../src/pricing.js';
import { validateProduct, validateProducts, extractJson } from '../src/validate.js';

const P = (power, type, duration, extra = {}) => ({ power, utility: 6, type, duration, rarity: rarityForPower(power), ...extra });

test('prices are deterministic', () => {
    const a = computePrice(P(5, 'permanent'));
    const b = computePrice(P(5, 'permanent'));
    assert.equal(a, b);
});

test('stronger versions cost more (monotonic in power)', () => {
    for (const [type, dur] of [['consumable', 'scene'], ['permanent'], ['equipment'], ['service', 'day']]) {
        let prev = 0;
        for (let pw = 1; pw <= 10; pw++) {
            const price = computePrice(P(pw, type, dur));
            assert.ok(price > prev, `${type} power ${pw}: ${price} should exceed ${prev}`);
            prev = price;
        }
    }
});

test('temporary effects cost less than permanent ones of equal power', () => {
    for (let pw = 1; pw <= 10; pw++) {
        const perm = computePrice(P(pw, 'permanent'));
        for (const d of ['instant', 'scene', 'day', 'week']) {
            assert.ok(computePrice(P(pw, 'consumable', d)) < perm, `power ${pw} ${d}`);
        }
    }
});

test('longer durations cost more', () => {
    const order = ['instant', 'scene', 'day', 'week'].map(d => computePrice(P(4, 'consumable', d)));
    for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1]);
});

test('reality-altering products require substantial investment', () => {
    const normal = computePrice(P(10, 'permanent'));
    const reality = computePrice(P(10, 'permanent', undefined, { realityAltering: true }));
    assert.ok(reality > normal * 2);
    assert.ok(reality > 250 * 100, `reality-altering ${reality} should be > 100 days of baseline earnings`);
});

test('ordinary purchases are achievable within a day of baseline play (250/day)', () => {
    assert.ok(computePrice(P(1, 'consumable', 'instant')) <= 50);
    assert.ok(computePrice(P(3, 'consumable', 'scene')) <= 250);
    assert.ok(computePrice(P(3, 'permanent')) <= 5 * 250);
});

test('economy settings scale prices predictably, balance never does', () => {
    const base = computePrice(P(5, 'permanent'));
    const hard = computePrice(P(5, 'permanent'), { difficulty: 'hard' });
    const doubled = computePrice(P(5, 'permanent'), { priceMultiplier: 2 });
    assert.ok(hard > base);
    assert.ok(Math.abs(doubled / base - 2) < 0.1);
});

test('nicePrice / discounted / priceBand', () => {
    assert.equal(nicePrice(0), 5);
    assert.equal(nicePrice(123), 120);
    assert.ok(discounted(1000, 25) === 750);
    assert.equal(priceBand(100, 250), 'affordable');
    assert.equal(priceBand(1000, 250), 'moderate');
    assert.equal(priceBand(5000, 250), 'aspirational');
    assert.match(explainPrice(P(5, 'permanent')), /power 5\/10/);
});

test('validateProduct recomputes price and fixes rarity', () => {
    const r = validateProduct({ name: 'Test Orb', description: 'A shiny orb of power.', effect: 'Glows brightly.', type: 'item', power: 9, rarity: 'common', price: 5 });
    assert.ok(r.ok);
    assert.equal(r.product.type, 'equipment');
    assert.equal(r.product.rarity, 'premium');
    assert.equal(r.product.price, computePrice(r.product));
    assert.ok(r.warnings.some(w => /suggested price/.test(w)));
});

test('validateProduct rejects malformed products', () => {
    assert.equal(validateProduct(null).ok, false);
    assert.equal(validateProduct({ name: 'X', description: 'short', effect: '', type: 'nope', power: 99 }).ok, false);
    assert.equal(validateProduct({ name: 'Potion', description: 'A long enough description', effect: 'Heals', type: 'consumable', duration: 'permanent', power: 2 }).ok, false);
});

test('validateProduct strips reality-altering from weak items', () => {
    const r = validateProduct({ name: 'Minor Wish', description: 'A tiny wish that does little.', effect: 'Small luck', type: 'consumable', duration: 'instant', power: 3, realityAltering: true });
    assert.ok(r.ok);
    assert.equal(r.product.realityAltering, false);
});

test('validateProducts deduplicates', () => {
    const item = { name: 'Lucky Coin', description: 'A coin that brings fortune.', effect: '+luck for a scene', type: 'consumable', duration: 'scene', power: 2 };
    const { accepted, rejected } = validateProducts([item, { ...item }, { bad: true }]);
    assert.equal(accepted.length, 1);
    assert.equal(rejected.length, 2);
});

test('extractJson handles fences and prose', () => {
    assert.deepEqual(extractJson('Here:\n```json\n[{"a":1}]\n```\nthanks'), [{ a: 1 }]);
    assert.deepEqual(extractJson('sure! {"theme":"tech"} ok'), { theme: 'tech' });
    assert.equal(extractJson('no json here'), null);
});
