import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COURT, RELEASE_HEIGHT } from '../src/config.js';
import {
  dailyNumber,
  dailySpots,
  dayKey,
  makeCounts,
  shareText,
  twistFor,
  TWISTS,
} from '../src/daily.js';
import { isThreePointer } from '../src/shot.js';

test('the day is taken in UTC and numbered from the first daily', () => {
  assert.equal(dayKey(new Date('2026-09-29T23:59:59Z')), '2026-09-29');
  assert.equal(dayKey(new Date('2026-09-30T00:00:00Z')), '2026-09-30');
  assert.equal(dailyNumber('2026-09-29'), 1);
  assert.equal(dailyNumber('2026-10-06'), 8);
});

test('each weekday has its own twist', () => {
  assert.equal(twistFor('2026-09-27').id, 'sudden'); // Sunday
  assert.equal(twistFor('2026-09-28').id, 'swish');
  assert.equal(twistFor('2026-09-29').id, 'glass');
  assert.equal(twistFor('2026-09-30').id, 'downtown');
  assert.equal(twistFor('2026-10-01').id, 'blind');
  assert.equal(twistFor('2026-10-02').id, 'freethrow');
  assert.equal(twistFor('2026-10-03').id, 'moving');
  assert.equal(new Set(TWISTS.map((t) => t.id)).size, 7);
});

test('everyone gets the same spots on the same day, and different ones the next', () => {
  const a = dailySpots('2026-09-29');
  const b = dailySpots('2026-09-29');
  const c = dailySpots('2026-09-30', TWISTS[1]);
  assert.equal(a.length, 60);
  assert.deepEqual(a.map((v) => v.toArray()), b.map((v) => v.toArray()));
  assert.notDeepEqual(a.slice(0, 5).map((v) => v.toArray()), c.slice(0, 5).map((v) => v.toArray()));
  for (const spot of a) {
    assert.ok(Math.abs(spot.x) < COURT.halfWidth && spot.z > 0);
    assert.equal(spot.y, RELEASE_HEIGHT);
  }
  // The first shots are close; distance opens up as the round goes on.
  assert.ok(a.slice(0, 3).every((s) => Math.hypot(s.x, s.z) <= 4.2));
});

test('downtown days are all threes; free-throw days are all from the line', () => {
  const deep = dailySpots('2026-09-30', twistFor('2026-09-30'));
  assert.ok(deep.every((s) => isThreePointer(s.x, s.z)));
  const line = dailySpots('2026-10-02', twistFor('2026-10-02'));
  assert.ok(line.every((s) => s.x === 0 && s.z === COURT.freeThrow));
});

test('swish and glass days only count their own kind of make', () => {
  const swish = TWISTS.find((t) => t.id === 'swish');
  const glass = TWISTS.find((t) => t.id === 'glass');
  const blind = TWISTS.find((t) => t.id === 'blind');
  assert.equal(makeCounts(swish, { swish: true, bank: false }), true);
  assert.equal(makeCounts(swish, { swish: false, bank: false }), false);
  assert.equal(makeCounts(glass, { swish: false, bank: true }), true);
  assert.equal(makeCounts(glass, { swish: false, bank: false }), false);
  assert.equal(makeCounts(blind, { swish: false, bank: false }), true);
  assert.equal(makeCounts(null, { swish: false, bank: false }), true);
});

test('the share text lays out one square per shot, ten to a row', () => {
  const shots = ['swish', 'make', 'miss', 'void', 'swish', 'swish', 'miss', 'make', 'swish', 'swish', 'make', 'miss'];
  const text = shareText({
    title: 'Pixel Hoops Daily #1 · Glass Tuesday',
    score: 24,
    made: 8,
    attempts: 12,
    rank: '#3 of 17',
    shots,
    url: 'https://jntmp.github.io/admiral/',
  });
  assert.equal(
    text,
    [
      'Pixel Hoops Daily #1 · Glass Tuesday',
      '24 pts · 8/12 made · #3 of 17',
      '🟨🟧⬛⬜🟨🟨⬛🟧🟨🟨',
      '🟧⬛',
      'https://jntmp.github.io/admiral/',
    ].join('\n'),
  );
});
