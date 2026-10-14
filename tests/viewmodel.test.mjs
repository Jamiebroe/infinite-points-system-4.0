import test from 'node:test';
import assert from 'node:assert/strict';
import {
    levelModel, series, pct, signed, economyModel, overviewModel, shopItemModel, shopModel,
    inventoryModel, statsModel, achievementModel, eventRows, ledgerRows, ledgerKinds, ledgerCsv,
    memoryModel, categoryDraft, milestoneDraft, intensityDraft, economyDraft, shopDraft,
    economyHint, resetLine, pricePreview, reasonLabel, kindLabel,
} from '../src/ui/viewmodel.js';
import { newProgress, manualAdjust, awardEvent } from '../src/model.js';
import { newMemory, setPurpose, toggleWish, addRestriction, bumpPref, addSettingNote, addInterest, memLog, recordRotation } from '../src/memory.js';
import { generateRotation } from '../src/shop.js';
import { purchase, useItem } from '../src/inventory.js';
import { defaultSettings } from '../src/defaults.js';
import { ACHIEVEMENTS } from '../src/content.js';

const settings = defaultSettings();
const env = (extra = {}) => ({ now: Date.now(), day: '2026-10-14', settings, achievements: ACHIEVEMENTS, cats: {}, ...extra });
const rich = () => { const p = newProgress(); manualAdjust(p, 1_000_000, 'test', env()); p.xp = 500_000; return p; };

test('levelModel advances with XP and never exceeds 100%', () => {
    assert.equal(levelModel(0).name, 'Virgin');
    assert.equal(levelModel(0).level, 1);
    assert.equal(levelModel(100).name, 'Curious');
    assert.equal(levelModel(400).name, 'Tease');
    assert.equal(levelModel(500_000).name, 'Unbound');
    assert.equal(levelModel(500_000).progress, 100);
    assert.equal(levelModel(500_000).maxed, true);
    const r = levelModel(120);
    assert.equal(r.level, 2);
    assert.equal(r.next, 'Flirt');
    assert.equal(r.toNext, 80);
    assert.ok(r.progress > 0 && r.progress < 100);
});

test('series + formatting helpers', () => {
    const s = series([0, 50, 100], 14);
    assert.equal(s.length, 3);
    assert.equal(s[2].height, 100);
    assert.equal(s[0].height, 0);
    assert.equal(series([], 5).length, 0);
    assert.equal(pct(1, 0), 0);
    assert.equal(pct(3, 4), 75);
    assert.equal(signed(12), '+12');
    assert.equal(signed(-12), '−12');
    assert.equal(signed(0), '0');
});

test('economyModel uses measured earnings when available, baseline otherwise', () => {
    const p = newProgress();
    const base = economyModel({ settings, progress: p });
    assert.equal(base.measured, false);
    assert.equal(base.expectedDaily, 250);
    assert.equal(base.difficulty, 'Normal');
    p.daily['2026-10-12'] = 400;
    p.daily['2026-10-13'] = 600;
    const measured = economyModel({ settings, progress: p });
    assert.equal(measured.measured, true);
    assert.equal(measured.expectedDaily, 500);
    const hard = economyModel({ settings: { ...settings, economy: { ...settings.economy, difficulty: 'hard' } }, progress: newProgress() });
    assert.ok(hard.expectedDaily < base.expectedDaily);
});

test('pricePreview recomputes from the formula, never from the balance', () => {
    const sample = { power: 4, utility: 6, type: 'permanent', duration: 'permanent', rarity: 'uncommon' };
    const a = pricePreview(sample, settings.economy);
    const b = pricePreview(sample, { ...settings.economy, priceMultiplier: 2 });
    assert.ok(a.price > 0);
    assert.ok(b.price > a.price);
    assert.match(a.why, /power 4\/10/);
    assert.equal(pricePreview(null, settings.economy), null);
});

test('overviewModel summarises progression and shop readiness', () => {
    const p = rich();
    const m = newMemory();
    const rot = generateRotation({ m, p, settings, day: '2026-10-14' });
    const o = overviewModel({ settings, progress: p, memory: m, rotation: rot, resetMs: 3600_000, achievementsTotal: ACHIEVEMENTS.length });
    assert.equal(o.balance, p.balance);
    assert.equal(o.shop.size, rot.items.length);
    assert.equal(o.shop.purpose, 'General Depravity');
    assert.equal(o.achievements.total, ACHIEVEMENTS.length);
    assert.equal(o.owned.total, 0);
    assert.equal(o.level.name, 'Unbound');
    assert.ok(o.shop.affordable > 0);
});

test('shopItemModel flags affordability, ownership, stock and offers', () => {
    const m = newMemory();
    const poor = newProgress();
    const rot = generateRotation({ m, p: poor, settings, day: '2026-10-14' });
    const item = rot.items[0];
    const model = shopItemModel(item, { settings, progress: poor, memory: m, daily: 250 });
    assert.equal(model.canBuy, false);
    assert.equal(model.affordable, false);
    assert.ok(model.stockLabel.length > 0);
    assert.ok(model.priceWhy.length > 0);

    const p = rich();
    const buyable = shopItemModel(item, { settings, progress: p, memory: m, daily: 250 });
    assert.equal(buyable.canBuy, true);

    toggleWish(m, item);
    assert.equal(shopItemModel(item, { settings, progress: p, memory: m, daily: 250 }).wished, true);

    // a sold-out limited item cannot be bought
    const limited = { ...item, stock: 1, sold: 1 };
    const sold = shopItemModel(limited, { settings, progress: p, memory: m, daily: 250 });
    assert.equal(sold.soldOut, true);
    assert.equal(sold.canBuy, false);

    // a permanent item already owned is not buyable again
    const perm = { ...item, type: 'permanent', duration: 'permanent', stock: null, sold: 0, offer: null };
    p.inventory[perm.key] = { key: perm.key, qty: 1, type: 'permanent' };
    const owned = shopItemModel(perm, { settings, progress: p, memory: m, daily: 250 });
    assert.equal(owned.alreadyOwned, true);
    assert.equal(owned.canBuy, false);
});

test('shopModel reports purpose, wishlist matches and economy', () => {
    const m = newMemory();
    const p = rich();
    setPurpose(m, { theme: 'leverage', label: 'Blackmail & Leverage' });
    const rot = generateRotation({ m, p, settings, day: '2026-10-14' });
    toggleWish(m, rot.items[0]);
    const model = shopModel({ settings, progress: p, memory: m, rotation: rot, resetMs: 1000 });
    assert.equal(model.purpose.label, 'Blackmail & Leverage');
    assert.deepEqual(model.wishlist, [rot.items[0].key]);
    assert.equal(model.items.length, rot.items.length);
    assert.equal(model.empty, false);
    assert.equal(model.currency, 'Points');
    assert.ok(model.economy.expectedDaily > 0);
});

test('inventoryModel groups items and tracks active effects', () => {
    const m = newMemory();
    const p = rich();
    // find a stackable, non-instant consumable so it survives being used once
    let rot = null, item = null;
    for (let d = 1; d <= 28 && !item; d++) {
        const r = generateRotation({ m, p, settings, day: `2026-10-${String(d).padStart(2, '0')}` });
        const found = r.items.find(i => i.type === 'consumable' && i.duration !== 'instant' && i.stock === null);
        if (found) { rot = r; item = found; }
    }
    assert.ok(item, 'expected a stackable timed consumable in the catalog');
    assert.ok(purchase(p, rot, item.key, env({ opId: 'v1' })).ok);
    assert.ok(purchase(p, rot, item.key, env({ opId: 'v2' })).ok);

    const before = inventoryModel({ settings, progress: p, chatId: 'chatA', msgCount: 5 });
    assert.ok(before.total >= 1);
    assert.equal(before.empty, false);
    assert.ok(before.groups.some(g => g.id === 'consumable' && g.items.some(i => i.key === item.key)));
    assert.equal(before.effects.length, 0);

    const used = useItem(p, item.key, env({ msgCount: 5, chatId: 'chatA' }));
    assert.ok(used.ok && used.effect);

    const after = inventoryModel({ settings, progress: p, chatId: 'chatA', msgCount: 6 });
    assert.equal(after.effects.length, 1);
    assert.equal(after.effects[0].key, item.key);
    assert.ok(after.effects[0].remaining > 0);
    assert.ok(after.effects[0].total > after.effects[0].remaining);
    assert.ok(after.total >= 1, 'one charge should remain in the stack');
    const row = after.groups.flatMap(g => g.items).find(i => i.key === item.key);
    assert.equal(row.active, true);
    assert.ok(row.usable);
});

test('statsModel aggregates categories, characters and daily series', () => {
    const p = newProgress();
    const cats = { combat: { id: 'combat', name: 'Combat', icon: '⚔️', enabled: true, points: 30 } };
    awardEvent(p, { key: 'k1', fp: 'f1', chat: 'c', slot: 's1', idx: 1, catId: 'combat', catName: 'Combat', icon: '⚔️', base: 30, mult: 1, snippet: 'won', chars: ['Hero'] }, { ...env(), cats });
    const m = newMemory();
    const s = statsModel({ settings, progress: p, memory: m, achievements: ACHIEVEMENTS });
    assert.equal(s.cards.length, 8);
    assert.equal(s.totalEvents, 1);
    assert.equal(s.categories[0].name, 'Combat');
    assert.equal(s.characters[0].name, 'Hero');
    assert.equal(s.categories[0].share, 100);
    assert.ok(s.memory.purpose.length > 0);
    assert.equal(s.dailySeries.length, 1);
});

test('achievementModel splits unlocked/locked and reports milestone progress', () => {
    const p = rich();
    p.achievements['a_first_event'] = { ts: Date.now() };
    const a = achievementModel({ settings, progress: p, achievements: ACHIEVEMENTS });
    assert.equal(a.total, ACHIEVEMENTS.length);
    assert.ok(a.count >= 1);
    assert.ok(a.unlocked.some(x => x.id === 'a_first_event'));
    assert.ok(a.locked.length > 0);
    assert.equal(a.unlocked.length + a.locked.length, a.total);
    const ms = a.milestones.find(m => m.id === 'm_life_500');
    assert.equal(ms.reached, true);
    assert.equal(ms.progress, 100);
});

test('eventRows and ledgerRows filter, and ledgerCsv exports valid CSV', () => {
    const p = newProgress();
    const cats = { combat: { id: 'combat', name: 'Combat', icon: '⚔️', enabled: true, points: 30 } };
    const e = { ...env(), cats };
    awardEvent(p, { key: 'k1', fp: 'f1', chat: 'c', slot: 's1', idx: 1, catId: 'combat', catName: 'Combat', icon: '⚔️', base: 30, mult: 1, snippet: 'won', chars: [] }, e);
    awardEvent(p, { key: 'k2', fp: 'f2', chat: 'c', slot: 's2', idx: 2, catId: 'quest', catName: 'Quest', icon: '🏆', base: 50, mult: 1, snippet: 'done', chars: [] }, e);
    assert.equal(eventRows(p).length, 2);
    assert.equal(eventRows(p, { catId: 'combat' }).length, 1);
    assert.equal(eventRows(p)[0].pointsText.startsWith('+'), true);
    // awarding an event can also unlock achievements, so filter to event entries
    const eventLedger = ledgerRows(p, { kinds: ['event'] });
    assert.equal(eventLedger.length, 2);
    assert.equal(ledgerRows(p, { query: 'Quest' }).length, 1);
    assert.ok(ledgerRows(p).length >= 2);
    const kinds = ledgerKinds(p);
    assert.equal(kinds[0].kind, 'event');
    assert.equal(kinds[0].label, 'Event reward');
    const csv = ledgerCsv(eventLedger);
    assert.match(csv.split('\r\n')[0], /^"timestamp","iso","kind","amount","balance","note"$/);
    assert.equal(csv.split('\r\n').length, 3);
});

test('memoryModel exposes purpose, wishlist, restrictions and logs without touching progression', () => {
    const m = newMemory();
    setPurpose(m, { theme: 'custom', label: 'Spy gear', custom: 'stealth gadgets' });
    addRestriction(m, 'combat');
    bumpPref(m, 'stealth', 4);
    addSettingNote(m, 'Modern Tokyo setting', 'auto');
    addInterest(m, 'grappling hook');
    memLog(m, 'something happened');
    recordRotation(m, '2026-10-14', ['a', 'b'], 'seed');
    const model = memoryModel({ memory: m, settings, rotation: null });
    assert.equal(model.purpose.label, 'Spy gear');
    assert.equal(model.purpose.custom, 'stealth gadgets');
    assert.deepEqual(model.restrictions, ['combat']);
    assert.ok(model.allPrefs.some(x => x.tag === 'stealth'));
    assert.equal(model.settingNotes.length, 1);
    assert.equal(model.interests.length, 1);
    assert.ok(model.log.length >= 4);
    assert.equal(model.log[0].text, 'something happened');
    assert.equal(model.rotations.length, 1);
    assert.equal(model.stats.purpose, 'Spy gear');
});

test('categoryDraft validates input and generates unique ids', () => {
    assert.equal(categoryDraft({ name: 'X', keywords: 'a' }).ok, false);
    assert.equal(categoryDraft({ name: 'Duelling', keywords: '' }).ok, false);
    assert.equal(categoryDraft({ name: 'Duelling', keywords: 'duel, duelled', points: 0 }).ok, false);
    const good = categoryDraft({ name: 'Duelling', keywords: 'duel*, duelled', points: 25, cooldown: 2, icon: '🤺' });
    assert.ok(good.ok);
    assert.equal(good.category.id, 'duelling');
    assert.equal(good.category.points, 25);
    const clash = categoryDraft({ name: 'Duelling', keywords: 'duel', points: 25 }, ['duelling']);
    assert.equal(clash.category.id, 'duelling-2');
    assert.equal(categoryDraft({ name: 'Bad id', keywords: 'x', points: 5, id: 'has spaces' }).ok, false);
});

test('milestoneDraft and intensityDraft validate input', () => {
    assert.equal(milestoneDraft({ name: 'A', threshold: 10 }).ok, false);
    assert.equal(milestoneDraft({ name: 'Ten events', kind: 'events', threshold: 0 }).ok, false);
    const ms = milestoneDraft({ name: 'Ten events', kind: 'events', threshold: 10, bonus: 40 });
    assert.ok(ms.ok);
    assert.equal(ms.milestone.id, 'm_events_10');
    assert.equal(ms.milestone.kind, 'events');

    assert.equal(intensityDraft({ label: 'Epic', words: 'legendary', mult: 0 }).ok, false);
    assert.equal(intensityDraft({ label: 'Epic', words: '', mult: 2 }).ok, false);
    const tier = intensityDraft({ label: 'Epic', words: 'legendary, cataclysmic', mult: 2 });
    assert.ok(tier.ok);
    assert.equal(tier.tier.mult, 2);
});

test('economyDraft and shopDraft reject out-of-range values and keep valid ones', () => {
    assert.equal(economyDraft({ difficulty: 'normal', earnRate: 0, priceMultiplier: 1 }).ok, false);
    assert.equal(economyDraft({ difficulty: 'nope', earnRate: 1, priceMultiplier: 1 }).economy.difficulty, 'normal');
    assert.equal(economyDraft({ difficulty: 'hard', earnRate: 0.8, priceMultiplier: 1.5 }).economy.priceMultiplier, 1.5);

    assert.equal(shopDraft({ resetTime: 'noon', size: 8, dailyOfferDiscount: 25, manualRefreshesPerDay: 1, aiProducts: 6 }).ok, false);
    assert.equal(shopDraft({ resetTime: '00:00', size: 99, dailyOfferDiscount: 25, manualRefreshesPerDay: 1, aiProducts: 6 }).ok, false);
    const ok = shopDraft({ resetTime: '04:30', size: 10, dailyOfferDiscount: 30, manualRefreshesPerDay: 2, manualRefreshCost: 100, surpriseChance: 0.4, useAi: true, aiProducts: 8, timezone: 'America/New_York' });
    assert.ok(ok.ok);
    assert.equal(ok.shop.size, 10);
    assert.equal(ok.shop.useAi, true);
    assert.equal(ok.shop.timezone, 'America/New_York');
});

test('misc helpers', () => {
    assert.match(economyHint({ expectedDaily: 300 }, 'Credits'), /300 Credits/);
    assert.match(resetLine(3_600_000), /1h 00m/);
    assert.equal(resetLine(0), 'rotating…');
    assert.equal(reasonLabel('upgrade'), 'Upgrades something you own');
    assert.equal(kindLabel('purchase'), 'Purchase');
});
