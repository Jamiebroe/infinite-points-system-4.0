// Every reward category must actually fire on realistic phrasing, or its XP can never be earned.
// Detection is keyword-based and deliberately permissive; these cases are the ones the defaults
// are written to catch. If you tighten a category's keywords, tighten this table with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectEvents, detectIntensity, compileKeywords } from '../src/detect.js';
import { DEFAULT_CATEGORIES, DEFAULT_INTENSITY, FETISH_IDS } from '../src/content.js';

const detect = (text, opts = {}) => detectEvents(text, DEFAULT_CATEGORIES, { intensity: DEFAULT_INTENSITY, maxEvents: 0, ...opts });
const catsIn = text => detect(text).map(e => e.catId);

/** One realistic line per category. Written the way a story would actually phrase the act. */
const CASES = [
    ['flirt', 'She flirted with him across the table.'],
    ['kiss', 'She kissed him deeply at the door.'],
    ['touch', 'She caressed his chest through the shirt.'],
    ['masturbation', 'He jerked off in the dark.'],
    ['massage', 'She massaged his shoulders until he relaxed.'],
    ['strip', 'She undressed slowly in front of him.'],
    ['scent', 'He buried his face in her panties.'],
    ['talk', 'She made him say it out loud.'],
    ['voyeur', 'He peeped at her through the crack in the door.'],
    ['fetish_feet', 'He kissed her feet one at a time.'],
    ['fetish_roleplay', 'She put on the maid outfit for him.'],
    ['dressup', 'He made her wear the red dress.'],
    ['oral_give', 'She gave him head in the car.'],
    ['oral_receive', 'She went down on you without being asked.'],
    ['theft', 'He stole her panties from the drawer.'],
    ['fetish_toys', 'He pressed the vibrator against her.'],
    ['edging', 'He kept her right at the edge for an hour.'],
    ['dom', 'She was completely at his mercy.'],
    ['impact', 'He spanked her hard, twice.'],
    ['fetish_bondage', 'He tied her up to the headboard.'],
    ['cumplay', 'He came on her stomach.'],
    ['public', 'They did it in public, where anyone could look.'],
    ['fetish_degradation', 'He called her a slut and meant it.'],
    ['overstim', 'He kept going after she came.'],
    ['climax_other', 'She came undone beneath him.'],
    ['hypno', 'She sank into a trance at his words.'],
    ['penetrate_give', 'He thrust into her slowly.'],
    ['penetrate_receive', 'He was inside her before she could answer.'],
    ['corrupt', 'He corrupted her over the following weeks.'],
    ['breath', 'He put a hand around her throat.'],
    ['watersports', 'He pissed on her in the shower.'],
    ['cuckold', 'He made her watch while another man took her.'],
    ['breeding', 'He told her he wanted to breed her.'],
    ['climax_self', 'You came hard against his hand.'],
    ['creampie', 'He came inside her without pulling out.'],
    ['double', 'They took her at both ends.'],
    ['group', 'They all took turns with her.'],
];

test('every default category fires on realistic phrasing', () => {
    for (const [want, text] of CASES) {
        const found = catsIn(text);
        assert.ok(found.includes(want), `"${text}" should trigger ${want}, got [${found.join(', ')}]`);
    }
});

test('the categories named in the test table cover every default category', () => {
    const covered = new Set(CASES.map(c => c[0]));
    for (const c of DEFAULT_CATEGORIES) {
        assert.ok(covered.has(c.id), `category "${c.id}" has no detection case — its XP could never be earned`);
    }
});

test('detection reports the category Points and its own tuned XP, not a derived value', () => {
    const [ev] = detect('They all took turns with her.');
    const cat = DEFAULT_CATEGORIES.find(c => c.id === 'group');
    assert.equal(ev.catId, 'group');
    assert.equal(ev.base, cat.points, 'base is the Points value');
    assert.equal(ev.xp, cat.xp, 'xp is the category\'s own tuned value');
    assert.ok(ev.xp > ev.base / 4, 'the tuned XP is deliberately steeper than a quarter of Points');

    const [peek] = detect('He peeped at her through the crack in the door.');
    assert.ok(ev.xp >= peek.xp * 5, 'an orgy must be worth far more XP than peeping');
});

test('intensity tiers multiply the event, and negation suppresses a match', () => {
    const [plain] = detect('She kissed him.');
    assert.equal(plain.mult, 1, 'no intensity word means no multiplier');

    const [heated] = detect('She kissed him eagerly.');
    assert.equal(heated.mult, 1.5, 'a heated word multiplies the reward');

    const [epic] = detect('She kissed him with overwhelming need.');
    assert.equal(epic.mult, 2);

    assert.equal(detectIntensity('She kissed him softly.', DEFAULT_INTENSITY).mult, 0.75);
    assert.ok(compileKeywords('defeat*').length === 1, 'the prefix wildcard compiles');

    assert.deepEqual(catsIn('He did not kiss her at all.'), [], 'a negated act must not count');
});

test('unrelated prose triggers nothing', () => {
    for (const text of [
        'The kettle boiled and she poured the tea.',
        'He reviewed the quarterly accounts before the meeting.',
        'It was raining again, so they stayed indoors and read.',
    ]) {
        assert.deepEqual(catsIn(text), [], `"${text}" should trigger nothing`);
    }
});

test('the marking category is gone, and its replacement categories are wired up', () => {
    const ids = DEFAULT_CATEGORIES.map(c => c.id);
    assert.ok(!ids.includes('marking'), 'the marking category was removed');
    for (const id of ['impact', 'talk', 'massage', 'breath', 'cuckold', 'dressup']) {
        assert.ok(ids.includes(id), `new category "${id}" is missing`);
    }
    for (const id of ['impact', 'breath', 'cuckold', 'dressup']) {
        assert.ok(FETISH_IDS.includes(id), `"${id}" should count toward the fetish tally`);
    }
});
