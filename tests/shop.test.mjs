import test from 'node:test';
import assert from 'node:assert/strict';
import { newProgress, manualAdjust } from '../src/model.js';
import { newMemory, setPurpose, addRestriction } from '../src/memory.js';
import { generateRotation, repriceRotation, recommend, addMilestoneOffer } from '../src/shop.js';
import { computePrice } from '../src/pricing.js';
import { defaultSettings } from '../src/defaults.js';
import { ACHIEVEMENTS } from '../src/content.js';

const settings = defaultSettings();
const env = (extra = {}) => ({ now: Date.now(), day: '2026-10-14', settings, achievements: ACHIEVEMENTS, ...extra });
export const rich = () => { const p = newProgress(); manualAdjust(p, 1_000_000, 'test', env()); return p; };

test('rotation is deterministic for the same day and differs across days', () => {
    const m = newMemory(), p = newProgress();
    const a = generateRotation({ m, p, settings, day: '2026-10-14' });
    const b = generateRotation({ m, p, settings, day: '2026-10-14' });
    assert.deepEqual(a.items.map(i => i.key), b.items.map(i => i.key));
    const c = generateRotation({ m, p, settings, day: '2026-10-15' });
    assert.notDeepEqual(a.items.map(i => i.key), c.items.map(i => i.key));
    assert.equal(a.items.length, settings.shop.size);
});

test('rotation mixes price bands and contains one daily offer; formula prices only', () => {
    const m = newMemory(), p = newProgress();
    const r = generateRotation({ m, p, settings, day: '2026-10-20' });
    const bands = new Set(r.items.map(i => i.band));
    assert.ok(bands.has('affordable'));
    assert.ok(bands.has('moderate') || bands.has('aspirational'));
    assert.equal(r.items.filter(i => i.offer).length, 1);
    for (const i of r.items) assert.equal(i.price, computePrice(i, settings.economy), `${i.name}`);
});

test('purpose change makes themed products dominate', () => {
    const m = newMemory(), p = newProgress();
    setPurpose(m, { theme: 'leverage', label: 'Blackmail & Leverage' });
    const r = generateRotation({ m, p, settings, day: '2026-10-14' });
    const themed = r.items.filter(i => i.theme === 'leverage').length;
    assert.ok(themed >= Math.ceil(r.items.length * 0.6), `themed ${themed}/${r.items.length}`);
});

test('custom purpose (free text) maps to related products', () => {
    const m = newMemory(), p = newProgress();
    setPurpose(m, { theme: 'custom', label: 'Stealth & spy gear', custom: 'stealth spy gadgets for infiltration' });
    const r = generateRotation({ m, p, settings, day: '2026-10-14' });
    assert.ok(r.items.filter(i => i.primary).length >= 4);
});

test('restrictions are respected', () => {
    const m = newMemory(), p = newProgress();
    setPurpose(m, { theme: 'degradation', label: 'Degradation & Display' });
    addRestriction(m, 'exposure');
    for (let d = 10; d < 25; d++) {
        const r = generateRotation({ m, p, settings, day: `2026-10-${d}` });
        assert.ok(!r.items.some(i => i.tags.includes('exposure')), `day ${d}`);
    }
    // control: without the restriction, exposure products do appear in the same window
    const m2 = newMemory();
    setPurpose(m2, { theme: 'degradation', label: 'Degradation & Display' });
    let seen = false;
    for (let d = 10; d < 25; d++) {
        const r = generateRotation({ m: m2, p: newProgress(), settings, day: `2026-10-${d}` });
        if (r.items.some(i => i.tags.includes('exposure'))) { seen = true; break; }
    }
    assert.ok(seen, 'the restriction is meaningful: exposure products exist to be filtered');
});

test('consecutive days are never identical', () => {
    const m = newMemory(), p = newProgress();
    let prev = null;
    for (let d = 1; d <= 28; d++) {
        const r = generateRotation({ m, p, settings, day: `2026-02-${String(d).padStart(2, '0')}` });
        const keys = r.items.map(i => i.key).sort().join();
        assert.notEqual(keys, prev);
        prev = keys;
    }
});

test('prices fixed within a rotation; balance never affects them; reprice only on explicit economy change', () => {
    const m = newMemory(), p = rich();
    const rot = generateRotation({ m, p, settings, day: '2026-10-14' });
    const prices = rot.items.map(i => i.price);
    manualAdjust(p, 5_000_000, 'more money', env());
    const again = generateRotation({ m, p, settings, day: '2026-10-14' });
    assert.deepEqual(again.items.map(i => i.price), prices);
    repriceRotation(rot, { ...settings, economy: { ...settings.economy, difficulty: 'hard' } });
    assert.ok(rot.items.every((i, k) => i.price >= prices[k]));
});

test('recommendations explain themselves; milestone offers are idempotent', () => {
    const m = newMemory(), p = rich();
    setPurpose(m, { theme: 'supernatural', label: 'Supernatural' });
    const rot = generateRotation({ m, p, settings, day: '2026-10-14' });
    for (const r of recommend(m, p, settings, rot)) assert.ok(r.why.length > 0);
    const o1 = addMilestoneOffer(rot, m, p, settings, 'm_test');
    const o2 = addMilestoneOffer(rot, m, p, settings, 'm_test');
    assert.ok(o1);
    assert.equal(o2, null);
    assert.ok(o1.offer.price < o1.price);
});
