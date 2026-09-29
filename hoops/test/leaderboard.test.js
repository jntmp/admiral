import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanInitials, Leaderboard, newRoundId } from '../src/leaderboard.js';

const config = { url: 'https://example.supabase.co', key: 'sb_publishable_test' };

// A stand-in for fetch that records requests and replays canned responses.
// A response of { fail: 'message' } rejects the way a dropped connection does.
function fakeFetch(...responses) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const { status = 200, body = [], fail } = responses.shift() ?? {};
    if (fail) throw new TypeError(fail);
    return { ok: status < 400, status, json: async () => body };
  };
  return { fetch, calls };
}

const entry = { round: 'b7d3c1e2-8f4a-4c1b-9d2e-6a5f4b3c2d1e', initials: 'ABC', score: 42, made: 9, attempts: 14, bestStreak: 5 };

test('initials are three capital letters: lower case is raised, anything else dropped', () => {
  assert.equal(cleanInitials('ab'), 'AB');
  assert.equal(cleanInitials('j.t-9x'), 'JTX');
  assert.equal(cleanInitials('a1b2c3d'), 'ABC');
  assert.equal(cleanInitials('  zé!'), 'Z');
  assert.equal(cleanInitials('123'), '');
});

test('the leaderboard is off without a url, key or fetch', () => {
  assert.equal(new Leaderboard({}, async () => {}).enabled, false);
  assert.equal(new Leaderboard(config, null).enabled, false);
  assert.equal(new Leaderboard(config, async () => {}).enabled, true);
});

test('top scores: best first, ties to the earliest, week limited to 7 days', async () => {
  const { fetch, calls } = fakeFetch({ body: [{ initials: 'ABC', score: 40 }] }, { body: [] });
  const board = new Leaderboard(config, fetch);
  const rows = await board.top('all');
  assert.deepEqual(rows, [{ initials: 'ABC', score: 40 }]);

  const all = new URL(calls[0].url);
  assert.equal(all.origin + all.pathname, 'https://example.supabase.co/rest/v1/scores');
  assert.equal(all.searchParams.get('order'), 'score.desc,created_at.asc');
  assert.equal(all.searchParams.get('limit'), '10');
  assert.equal(all.searchParams.get('created_at'), null);
  assert.equal(all.searchParams.get('challenge'), 'is.null', 'classic boards leave out daily rounds');
  assert.equal(calls[0].init.headers.apikey, 'sb_publishable_test');

  const now = Date.parse('2026-09-27T12:00:00Z');
  await board.top('week', 10, now);
  assert.equal(new URL(calls[1].url).searchParams.get('created_at'), 'gte.2026-09-20T12:00:00.000Z');
});

test("the daily board is today's challenge only", async () => {
  const { fetch, calls } = fakeFetch({ body: [] });
  const board = new Leaderboard(config, fetch);
  await board.top('daily', 10, Date.parse('2026-09-29T23:30:00Z'));
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get('challenge'), 'eq.2026-09-29');
  assert.equal(url.searchParams.get('created_at'), null);
});

test('daily rounds post to submit_daily with their day and get a rank among that day', async () => {
  const { fetch, calls } = fakeFetch({ body: [{ rank_day: 3, players: 17 }] });
  const board = new Leaderboard(config, fetch);
  const result = await board.submitDaily({ ...entry, day: '2026-09-29' });
  assert.deepEqual(result, { rankDay: 3, players: 17 });
  assert.equal(calls[0].url, 'https://example.supabase.co/rest/v1/rpc/submit_daily');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    p_round: entry.round,
    p_day: '2026-09-29',
    p_initials: 'ABC',
    p_score: 42,
    p_made: 9,
    p_attempts: 14,
    p_best_streak: 5,
  });
});

test('submitting posts to submit_score and returns both ranks', async () => {
  const { fetch, calls } = fakeFetch({ body: [{ rank_all: 12, rank_week: 3 }] });
  const board = new Leaderboard(config, fetch);
  const ranks = await board.submit(entry);
  assert.deepEqual(ranks, { rankAll: 12, rankWeek: 3 });
  assert.equal(calls[0].url, 'https://example.supabase.co/rest/v1/rpc/submit_score');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    p_round: entry.round,
    p_initials: 'ABC',
    p_score: 42,
    p_made: 9,
    p_attempts: 14,
    p_best_streak: 5,
  });
});

test('server errors surface their message', async () => {
  const { fetch, calls } = fakeFetch({ status: 400, body: { message: 'Too many scores from you in the last minute.' } });
  const board = new Leaderboard(config, fetch, async () => {});
  await assert.rejects(board.submit(entry), { message: 'Too many scores from you in the last minute.' });
  assert.equal(calls.length, 1, 'an answer from the server is final, not retried');
});

test('a save that never reaches the server is retried with the same round', async () => {
  const { fetch, calls } = fakeFetch({ fail: 'Load failed' }, { fail: 'Load failed' }, { body: [{ rank_all: 2, rank_week: 1 }] });
  const waits = [];
  const board = new Leaderboard(config, fetch, async (ms) => waits.push(ms));
  assert.deepEqual(await board.submit(entry), { rankAll: 2, rankWeek: 1 });
  assert.equal(calls.length, 3);
  assert.deepEqual(waits, [700, 2000]);
  assert.ok(calls.every((c) => c.init.body === calls[0].init.body), 'every attempt sends the same round');
});

test('after three failed attempts the browser reason comes through', async () => {
  const { fetch, calls } = fakeFetch({ fail: 'Load failed' }, { fail: 'Load failed' }, { fail: 'Load failed' });
  const board = new Leaderboard(config, fetch, async () => {});
  await assert.rejects(board.submit(entry), { name: 'TypeError', message: 'Load failed' });
  assert.equal(calls.length, 3);
});

test('round ids are random version-4 UUIDs', () => {
  const a = newRoundId();
  const b = newRoundId();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, b);
});
