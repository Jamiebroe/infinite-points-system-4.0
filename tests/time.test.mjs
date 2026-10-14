import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKeyFor, nextResetMs, resolveTimeZone, isValidTimeZone, daysBetween, fmtDuration, parseResetTime } from '../src/time.js';

test('dayKey respects reset time', () => {
    // 2026-10-14 03:00 UTC = 2026-10-13 23:00 in New York (EDT, UTC-4)
    const t = Date.UTC(2026, 9, 14, 3, 0);
    assert.equal(dayKeyFor(t, 'America/New_York', '00:00'), '2026-10-13');
    assert.equal(dayKeyFor(t, 'UTC', '00:00'), '2026-10-14');
    assert.equal(dayKeyFor(t, 'UTC', '04:00'), '2026-10-13'); // before 04:00 reset → still previous day
});

test('nextReset is in the future and at the configured wall-clock time', () => {
    const t = Date.UTC(2026, 9, 14, 3, 0);
    const n = nextResetMs(t, 'America/New_York', '04:00');
    assert.ok(n > t);
    assert.equal(new Date(n).toISOString(), '2026-10-14T08:00:00.000Z'); // 04:00 EDT
    const u = nextResetMs(t, 'UTC', '00:00');
    assert.equal(new Date(u).toISOString(), '2026-10-15T00:00:00.000Z');
});

test('DST transitions keep the reset at local wall-clock time', () => {
    // US DST ends 2026-11-01. Day before → 04:00 EDT (08:00Z); after → 04:00 EST (09:00Z)
    const before = nextResetMs(Date.UTC(2026, 9, 31, 12), 'America/New_York', '04:00');
    assert.equal(new Date(before).toISOString(), '2026-11-01T09:00:00.000Z');
    const after = nextResetMs(Date.UTC(2026, 10, 2, 12), 'America/New_York', '04:00');
    assert.equal(new Date(after).toISOString(), '2026-11-03T09:00:00.000Z');
});

test('day key changes exactly at the reset instant', () => {
    const n = nextResetMs(Date.UTC(2026, 9, 14, 12), 'Europe/Berlin', '06:30');
    assert.notEqual(dayKeyFor(n - 1000, 'Europe/Berlin', '06:30'), dayKeyFor(n, 'Europe/Berlin', '06:30'));
});

test('helpers', () => {
    assert.equal(isValidTimeZone('Not/AZone'), false);
    assert.equal(resolveTimeZone('Not/AZone'), 'UTC');
    assert.ok(resolveTimeZone('local'));
    assert.equal(daysBetween('2026-10-01', '2026-10-14'), 13);
    assert.equal(fmtDuration(3723000), '1h 02m');
    assert.deepEqual(parseResetTime('bad'), { h: 0, mi: 0 });
    assert.deepEqual(parseResetTime('7:05'), { h: 7, mi: 5 });
});
