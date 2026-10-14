import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShopCommands, interestHints } from '../src/commands.js';
import { matchTheme } from '../src/catalog/index.js';

test('explicit bracketed / OOC / addressed commands are recognised', () => {
    const cases = [
        ['[System: change the shop to supernatural abilities]', 'theme', 'supernatural abilities'],
        ['((OOC: switch the shop to blackmail material please))', 'theme', 'blackmail material'],
        ['System, set the shop theme to surveillance gear.', 'theme', 'surveillance gear'],
        ['*walks in* [Shop: I want the shop to sell degradation]', 'theme', 'degradation'],
        ['[System: don\'t sell romance anymore]', 'restrict', 'romance anymore'],
        ['[System: refresh the shop]', 'refresh', ''],
    ];
    for (const [text, kind, value] of cases) {
        const r = parseShopCommands(text);
        assert.equal(r.length, 1, text);
        assert.equal(r[0].kind, kind, text);
        if (value) assert.equal(r[0].value.toLowerCase(), value, text);
    }
});

test('ordinary roleplay, quoted dialogue and character suggestions are NOT commands', () => {
    const negatives = [
        'I walk into the shop and look around.',
        '"System, change the shop to blackmail material," the merchant joked.',
        'She said "[System: change the shop to magic]" and laughed.',
        'Maybe the shop should sell magic items, I think to myself.',
        'The system of government changed overnight.',
        '“Shop: switch to weapons,” he whispered.',
        'I want a magic sword.',
    ];
    for (const t of negatives) assert.deepEqual(parseShopCommands(t), [], t);
});

test('theme matching', () => {
    assert.equal(matchTheme('supernatural abilities'), 'supernatural');
    assert.equal(matchTheme('blackmail material'), 'leverage');
    assert.equal(matchTheme('surveillance gear'), 'surveillance');
    assert.equal(matchTheme('degradation'), 'degradation');
    assert.equal(matchTheme('personal enhancements'), 'body');
    assert.equal(matchTheme('underwater basket weaving'), null);
});

test('interest hints are soft signals only', () => {
    assert.deepEqual(interestHints('I wish I could fly away from here.'), ['fly away from here']);
    assert.deepEqual(interestHints('Nothing special.'), []);
});
