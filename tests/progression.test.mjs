// Sexual record, rank gates and act-specific achievements.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newProgress, manualAdjust, awardEvent, revokeEvent, metric, checkProgress, eventXp } from '../src/model.js';
import { sexStats, sexTotals } from '../src/stats.js';
import { levelFor, levelAllows, LEVELS, SEX_STATS, DEFAULT_CATEGORIES, FETISH_IDS, ACHIEVEMENTS, categoryXp } from '../src/content.js';
import { generateRotation } from '../src/shop.js';
import { newMemory } from '../src/memory.js';
import { defaultSettings } from '../src/defaults.js';

const settings = defaultSettings();
settings.milestones = [];        // keep lifetime totals easy to reason about
settings.achievementBonus = 0;
const env = (extra = {}) => ({ now: Date.now(), day: '2026-10-14', settings, achievements: ACHIEVEMENTS, cats: {}, ...extra });

const CAT = Object.fromEntries(DEFAULT_CATEGORIES.map(c => [c.id, c]));

let n = 0;
/** Award `times` events in one reward category, using that category's real Points and XP. */
function seed(p, catId, times, { chars = [] } = {}) {
    const cat = CAT[catId] || { points: 10, xp: 3, name: catId, icon: '•' };
    for (let i = 0; i < times; i++) {
        n++;
        awardEvent(p, {
            key: `k${n}`, fp: `f${n}`, chat: 'c', slot: `s${n}`, idx: n,
            catId, catName: cat.name, icon: cat.icon,
            base: Number(cat.points) || 0, xp: categoryXp(cat), mult: 1, snippet: 'test', chars,
        }, env());
    }
    return p;
}

// ---------------------------------------------------------------- sexual record

test('the sexual record sums act categories and is worded for the configured gender', () => {
    const p = newProgress();
    seed(p, 'oral_receive', 3);
    seed(p, 'climax_self', 5);
    seed(p, 'group', 1);

    const male = sexStats(p, 'male');
    const female = sexStats(p, 'female');

    const recvM = male.find(r => r.id === 'oral_received');
    const recvF = female.find(r => r.id === 'oral_received');
    assert.equal(recvM.count, 3);
    assert.equal(recvF.count, 3, 'the same tally, only the wording differs');
    assert.equal(recvM.label, 'Blowjobs received');
    assert.equal(recvF.label, 'Times eaten out');

    assert.equal(male.find(r => r.id === 'orgasms').count, 5);
    assert.equal(male.find(r => r.id === 'orgies').count, 1);
    assert.equal(male.find(r => r.id === 'creampies').count, 0, 'untracked acts read zero, not missing');
    assert.ok(male[0].count >= male[male.length - 1].count, 'sorted by count descending');

    const t = sexTotals(p);
    assert.equal(t.acts, 9);
    assert.equal(t.tracked, 3);
});

test('an unknown or unset gender falls back to neutral wording', () => {
    const p = newProgress();
    seed(p, 'oral_receive', 1);
    for (const g of ['unspecified', 'nonsense', undefined, null]) {
        const row = sexStats(p, g).find(r => r.id === 'oral_received');
        assert.equal(row.label, 'Oral received', `gender ${String(g)}`);
        assert.equal(row.count, 1);
    }
});

test('every tracked stat points at categories that exist, with a label for each gender', () => {
    const ids = new Set(DEFAULT_CATEGORIES.map(c => c.id));
    for (const s of SEX_STATS) {
        assert.ok(s.from.length, `${s.id} has no source category`);
        for (const id of s.from) assert.ok(ids.has(id), `${s.id} references missing category "${id}"`);
        for (const g of ['male', 'female', 'other', 'unspecified']) {
            assert.ok(s.label[g], `${s.id} has no "${g}" label`);
        }
    }
});

// ---------------------------------------------------------------- rank gates

test('levels unlock rarities as XP accumulates, and never take them away', () => {
    assert.equal(levelFor(0).name, 'Virgin');
    assert.equal(levelAllows(0, 'rare'), true, 'rare stock is available from the start');
    assert.equal(levelAllows(0, 'premium'), false, 'a new player cannot see premium stock');

    assert.equal(levelFor(400).name, 'Tease');
    assert.equal(levelAllows(400, 'premium'), true, 'premium unlocks at level 4');
    assert.equal(levelFor(1e9).name, 'Unbound');

    for (let i = 1; i < LEVELS.length; i++) {
        for (const r of LEVELS[i - 1].rarities) {
            assert.ok(LEVELS[i].rarities.includes(r), `${LEVELS[i].name} lost ${r}`);
        }
        assert.ok(LEVELS[i].rareBoost >= LEVELS[i - 1].rareBoost, `${LEVELS[i].name} rare boost went backwards`);
        assert.ok(LEVELS[i].min > LEVELS[i - 1].min, `${LEVELS[i].name} threshold did not increase`);
    }
});

test('the Shop never stocks a rarity the current level has not unlocked', () => {
    const poor = newProgress();                                  // 0 XP -> Virgin
    const rich = newProgress();
    rich.xp = 3000;                                              // -> Deviant, premium unlocked

    for (let d = 1; d <= 20; d++) {
        const day = `2026-11-${String(d).padStart(2, '0')}`;
        const r = generateRotation({ m: newMemory(), p: poor, settings, day });
        assert.ok(r.items.every(i => levelAllows(poor.xp, i.rarity)), `day ${d} leaked a locked rarity`);
        assert.ok(!r.items.some(i => i.rarity === 'premium'), `day ${d} showed premium to a new player`);
    }

    let seen = false;
    for (let d = 1; d <= 28 && !seen; d++) {
        const day = `2026-11-${String(d).padStart(2, '0')}`;
        const r = generateRotation({ m: newMemory(), p: rich, settings, day });
        if (r.items.some(i => i.rarity === 'premium')) seen = true;
    }
    assert.ok(seen, 'a high-level player should see premium stock within a month');
});

// ---------------------------------------------------------------- conditions

test('act-specific conditions and the fetish tally', () => {
    const p = newProgress();
    assert.equal(metric(p, 'level'), 1, 'level 1 before any XP is earned');
    assert.equal(metric(p, 'xp'), 0);

    seed(p, 'group', 2);
    seed(p, 'creampie', 1);
    seed(p, 'fetish_bondage', 1);
    seed(p, 'fetish_feet', 1);
    seed(p, 'watersports', 1);

    assert.equal(metric(p, 'cat:group'), 2);
    assert.equal(metric(p, 'cat:creampie'), 1);
    assert.equal(metric(p, 'cat:does_not_exist'), 0, 'unknown categories count zero');
    assert.equal(metric(p, 'fetishes'), 3);
    assert.ok(metric(p, 'xp') > 0, 'those acts earned XP');

    p.xp = 3000;
    assert.equal(metric(p, 'level'), 10, 'Deviant');
    assert.equal(metric(p, 'xp'), 3000);
});

test('specific-act achievements unlock from the matching category', () => {
    const p = newProgress();
    seed(p, 'group', 1);
    assert.ok(p.achievements['a_orgy_1'], 'First Orgy unlocked after one group scene');
    assert.ok(!p.achievements['a_orgy_10'], 'but not the 10-scene one');

    seed(p, 'group', 9);
    assert.ok(p.achievements['a_orgy_10'], 'Centre of Attention unlocked at 10');

    const p2 = newProgress();
    seed(p2, 'fetish_bondage', 1);
    assert.ok(p2.achievements['a_bondage_1'], 'Bound unlocked');
    assert.ok(!p2.achievements['a_fetish_5'], 'one fetish is not five');
});

test('level achievements unlock as XP accumulates', () => {
    const p = newProgress();
    assert.ok(!p.achievements['a_level_5'], 'nothing at level 1');
    p.xp = 620;
    checkProgress(p, env());
    assert.ok(p.achievements['a_level_5'], 'Minx at level 5');
    assert.ok(!p.achievements['a_level_10'], 'Deviant needs far more');
});

// ---------------------------------------------------------------- XP

const xpOf = id => categoryXp(CAT[id]);

test('every category declares its own XP, on a scale far steeper than Points', () => {
    for (const c of DEFAULT_CATEGORIES) {
        assert.ok(Number.isFinite(c.xp), `${c.id} has no tuned xp`);
        assert.ok(c.xp >= 1, `${c.id} grants less than 1 XP`);
        assert.ok(c.xp <= 60, `${c.id} grants an implausible ${c.xp} XP`);
    }
    // ambient acts are barely worth anything
    assert.equal(xpOf('flirt'), 1);
    assert.equal(xpOf('kiss'), 2);
    assert.equal(xpOf('voyeur'), 5);
    // a full scene is worth several times a glance
    assert.ok(xpOf('penetrate_give') >= xpOf('voyeur') * 3, 'penetration must dwarf peeping');
    // rare, elaborate acts dominate the scale
    assert.ok(xpOf('group') >= xpOf('voyeur') * 5, 'an orgy must dwarf peeping');
    assert.ok(xpOf('group') > xpOf('creampie'), 'an orgy beats a single creampie');
    assert.ok(xpOf('double') > xpOf('penetrate_give'), 'double penetration beats plain penetration');
    assert.ok(xpOf('cuckold') > xpOf('voyeur'), 'watching your partner taken beats peeping');
    // something you can do any time is worth least of all
    assert.ok(xpOf('masturbation') <= xpOf('oral_give'), 'solo play is the cheapest act there is');
});

test('the XP curve is steeper than the Points curve, not a copy of it', () => {
    const ratio = id => xpOf(id) / Number(CAT[id].points);
    assert.ok(ratio('group') > ratio('flirt'), 'the top of the scale pays better per Point than the bottom');
    assert.ok(ratio('group') > ratio('kiss'));
    // a custom category that never set an xp still falls back to a fraction of its Points
    assert.equal(categoryXp({ points: 40 }), 10);
    assert.equal(categoryXp({ points: 40, xp: 12 }), 12, 'an explicit value always wins');
    assert.equal(categoryXp({ points: 40, xp: 0 }), 0, 'an explicit zero is respected');
});

test('intensity multiplies XP, and no economy setting can move the level track', () => {
    assert.equal(eventXp(xpOf('group'), 1, settings), 35);   // orgy, normal intensity
    assert.equal(eventXp(xpOf('group'), 2, settings), 70);   // orgy, overwhelming
    assert.equal(eventXp(xpOf('kiss'), 1, settings), 2);

    // XP is not the paid currency, so a generous earn rate must not inflate it
    const generous = { ...settings, economy: { ...settings.economy, earnRate: 5, difficulty: 'relaxed' } };
    assert.equal(eventXp(xpOf('group'), 1, generous), 35);

    // the global multiplier is the one knob that scales the whole track
    assert.equal(eventXp(xpOf('group'), 1, { ...settings, levels: { xpMult: 0.5 } }), 18);
    assert.equal(eventXp(xpOf('group'), 1, { ...settings, levels: { xpMult: 2 } }), 70);
    assert.equal(eventXp(xpOf('group'), 1, { ...settings, levels: {} }), 35, 'a missing setting means no scaling');

    // a real act always grants at least 1 XP
    assert.ok(eventXp(1, 0.1, settings) >= 1);
});

test('performing an act grants XP, and revoking it takes the XP back', () => {
    const p = newProgress();
    const noAch = { ...env(), achievements: [] };
    const cat = CAT.group;
    awardEvent(p, {
        key: 'x1', fp: 'fx1', chat: 'c', slot: 'sx1', idx: 1,
        catId: 'group', catName: cat.name, icon: cat.icon,
        base: cat.points, xp: categoryXp(cat), mult: 1, snippet: 'orgy', chars: [],
    }, noAch);
    assert.equal(p.xp, 35, 'the orgy granted its tuned XP');
    revokeEvent(p, 'x1', noAch);
    assert.equal(p.xp, 0, 'revoking the act took the XP back');
});

test('unlocking an achievement grants XP scaled to how hard it was', () => {
    const p = newProgress();
    seed(p, 'group', 1);
    assert.ok(p.achievements['a_first_event'], 'an achievement unlocked');
    assert.equal(p.achievements['a_first_event'].xp, 10, 'and recorded its own XP');
    assert.ok(p.achievements['a_orgy_1'], 'the orgy achievement unlocked too');
    assert.equal(p.achievements['a_orgy_1'].xp, 60, 'a rare act pays far more than a first event');

    // every built-in achievement declares its own XP, and difficulty orders the scale
    for (const a of ACHIEVEMENTS) {
        assert.ok(Number.isFinite(a.xp), `${a.id} has no xp`);
        assert.ok(a.xp >= 1, `${a.id} grants no XP`);
    }
    const axp = id => ACHIEVEMENTS.find(a => a.id === id).xp;
    assert.ok(axp('a_orgy_50') > axp('a_orgy_1'), 'a 50-orgy grind beats a first orgy');
    assert.ok(axp('a_orgy_1') > axp('a_first_event'), 'a first orgy beats a first event');
    assert.ok(axp('a_level_20') > axp('a_level_15') && axp('a_level_15') > axp('a_level_10') && axp('a_level_10') > axp('a_level_5'), 'later levels pay more');
    assert.ok(axp('a_fetish_all') >= 400, 'the hardest achievement is worth the most');
    assert.ok(new Set(ACHIEVEMENTS.map(a => a.xp)).size >= 12, 'the XP values should be spread, not flat');
});

test('every achievement condition points at something real', () => {
    const ids = new Set(DEFAULT_CATEGORIES.map(c => c.id));
    for (const a of ACHIEVEMENTS) {
        assert.ok(a.n > 0, `${a.id} has a target of ${a.n}`);
        if (a.cond.startsWith('cat:')) {
            assert.ok(ids.has(a.cond.slice(4)), `${a.id} references missing category "${a.cond.slice(4)}"`);
        }
    }
    // every fetish id must be a real category, and the all-fetishes target must follow the list
    for (const id of FETISH_IDS) assert.ok(ids.has(id), `FETISH_IDS references missing category "${id}"`);
    assert.equal(new Set(FETISH_IDS).size, FETISH_IDS.length, 'FETISH_IDS has duplicates');
    assert.equal(ACHIEVEMENTS.find(a => a.id === 'a_fetish_all').n, FETISH_IDS.length, 'the all-fetishes target drifted from FETISH_IDS');
});

test('XP drives the level, not lifetime Points', () => {
    const p = newProgress();
    // no achievements, so nothing but the Points themselves can move the level
    manualAdjust(p, 100_000, 'lots of points', { ...env(), achievements: [] });
    assert.equal(p.lifetime, 100_000);
    assert.equal(p.xp, 0, 'a Points adjustment grants no XP');
    assert.equal(metric(p, 'level'), 1, 'points alone do not level you up');

    p.xp = 7100;
    assert.equal(metric(p, 'level'), 14, 'Degenerate');
});
