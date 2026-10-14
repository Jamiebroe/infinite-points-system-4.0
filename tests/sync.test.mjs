import test from 'node:test';
import assert from 'node:assert/strict';
import { newProgress, manualAdjust, adjustEvent } from '../src/model.js';
import { describeChat, reconcile, slotIds, clearBaseline } from '../src/sync.js';
import { detectEvents } from '../src/detect.js';
import { DEFAULT_CATEGORIES, DEFAULT_INTENSITY, ACHIEVEMENTS } from '../src/content.js';
import { defaultSettings } from '../src/defaults.js';

const settings = defaultSettings();
settings.milestones = []; // keep balances easy to reason about
settings.achievementBonus = 0;
const cats = Object.fromEntries(DEFAULT_CATEGORIES.map(c => [c.id, { ...c, cooldown: 0 }]));
const env = () => ({ now: Date.now(), day: '2026-10-14', settings, achievements: ACHIEVEMENTS, cats });
const detect = m => detectEvents(m.text, Object.values(cats), { intensity: DEFAULT_INTENSITY, isUser: m.isUser });

let t0 = Date.parse('2026-10-14T10:00:00Z');
function msg(text, isUser = false) {
    const send_date = new Date(t0 += 60000).toISOString();
    return { name: isUser ? 'User' : 'Char', is_user: isUser, mes: text, send_date, swipes: [text], swipe_id: 0, swipe_info: [{ send_date, extra: {} }] };
}
const run = (p, chat, opts = {}) => reconcile(p, 'chatA', describeChat(chat), detect, env(), opts);

test('awards once; re-running (reload) never awards again', () => {
    const p = newProgress();
    const chat = [msg('Hello there', true), msg('She kissed him deeply.')];
    const r1 = run(p, chat);
    assert.equal(r1.awarded.length, 1);
    const bal = p.balance;
    assert.ok(bal > 0);
    for (let i = 0; i < 5; i++) assert.equal(run(p, chat).awarded.length, 0);
    assert.equal(p.balance, bal);
});

test('swipe/regenerate: new swipe revokes old event, swiping back restores (never double)', () => {
    const p = newProgress();
    const m = msg('She kissed him deeply.');
    const chat = [msg('go', true), m];
    run(p, chat);
    const afterFirst = p.balance;
    // regenerate → new swipe without the event
    m.swipes.push('They talked quietly by the fire.');
    m.swipe_info.push({ send_date: new Date(t0 += 1000).toISOString(), extra: {} });
    m.swipe_id = 1; m.mes = m.swipes[1]; m.send_date = m.swipe_info[1].send_date;
    run(p, chat);
    assert.equal(p.balance, 0);
    // swipe back
    m.swipe_id = 0; m.mes = m.swipes[0]; m.send_date = m.swipe_info[0].send_date;
    const r = run(p, chat);
    assert.equal(r.restored.length, 1);
    assert.equal(p.balance, afterFirst);
    // regenerate a swipe with the SAME event category → still one award for this message
    m.swipes.push('He kissed her again, deeply.');
    m.swipe_info.push({ send_date: new Date(t0 += 1000).toISOString(), extra: {} });
    m.swipe_id = 2; m.mes = m.swipes[2]; m.send_date = m.swipe_info[2].send_date;
    run(p, chat);
    assert.equal(p.balance, afterFirst);
    assert.equal(p.ledger.filter(e => e.kind === 'event').length, 1);
});

test('slot ids are stable across deletion of earlier messages', () => {
    const chat = [msg('a', true), msg('b'), msg('c', true)];
    const before = slotIds(chat);
    const after = slotIds(chat.slice(1));
    assert.deepEqual(after, before.slice(1));
});

test('edit removing the event revokes; editing it back restores', () => {
    const p = newProgress();
    const m = msg('He pulled her close and kissed her.');
    const chat = [m];
    run(p, chat);
    const b = p.balance;
    m.mes = 'We looked at the bookshelf.'; m.swipes[0] = m.mes;
    run(p, chat);
    assert.equal(p.balance, 0);
    m.mes = 'He pulled her close and kissed her.'; m.swipes[0] = m.mes;
    run(p, chat);
    assert.equal(p.balance, b);
});

test('deleting a message revokes its event (configurable)', () => {
    const p = newProgress();
    const chat = [msg('hi', true), msg('She undressed slowly in front of him.')];
    run(p, chat);
    assert.ok(p.balance > 0);
    run(p, chat.slice(0, 1));
    assert.equal(p.balance, 0);
    const p2 = newProgress();
    run(p2, chat);
    const b2 = p2.balance;
    run(p2, chat.slice(0, 1), { revokeOnDelete: false });
    assert.equal(p2.balance, b2);
});

test('identical content in another message is not rewarded twice (fingerprint)', () => {
    const p = newProgress();
    const chat = [msg('She kissed him deeply.'), msg('ok', true), msg('She kissed him deeply.')];
    const r = run(p, chat);
    assert.equal(r.awarded.length, 1);
    assert.equal(r.duplicates, 1);
});

test('baseline: existing history is not awarded when a chat is first opened; scan history opt-in', () => {
    const p = newProgress();
    const chat = [msg('She kissed him deeply.'), msg('ok', true)];
    const r = run(p, chat, { baseline: true });
    assert.equal(r.baselined, 2);
    assert.equal(p.balance, 0);
    chat.push(msg('Then she kissed him again.'));
    assert.equal(run(p, chat).awarded.length, 1);
    clearBaseline(p, 'chatA');
    assert.equal(run(p, chat).awarded.length, 1); // the old kiss
});

test('negated phrases are ignored', () => {
    const p = newProgress();
    run(p, [msg('He almost kissed her but stopped himself.'), msg('She never kissed him.')]);
    assert.equal(p.balance, 0);
});

test('manual corrections are ledgered and cannot go negative', () => {
    const p = newProgress();
    run(p, [msg('She kissed him deeply.')]);
    const key = Object.keys(p.awarded)[0];
    const r = adjustEvent(p, key, 100, env());
    assert.ok(r.ok);
    assert.equal(p.balance, 100);
    assert.equal(manualAdjust(p, -500, 'oops', env()).ok, false);
    assert.ok(manualAdjust(p, -40, 'fix', env()).ok);
    assert.equal(p.balance, 60);
    const sum = p.ledger.reduce((s, e) => s + e.amount, 0);
    assert.equal(sum, p.balance, 'ledger sums to balance');
});
