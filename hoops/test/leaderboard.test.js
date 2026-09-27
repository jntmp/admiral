import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanInitials, Leaderboard } from '../src/leaderboard.js';

const config = { url: 'https://example.supabase.co', key: 'sb_publishable_test' };

// A stand-in for fetch that records requests and replays canned responses.
function fakeFetch(...responses) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const { status = 200, body = [] } = responses.shift() ?? {};
    return { ok: status < 400, status, json: async () => body };
  };
  return { fetch, calls };
}

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
  assert.equal(calls[0].init.headers.apikey, 'sb_publishable_test');

  const now = Date.parse('2026-09-27T12:00:00Z');
  await board.top('week', 10, now);
  assert.equal(new URL(calls[1].url).searchParams.get('created_at'), 'gte.2026-09-20T12:00:00.000Z');
});

test('submitting posts to submit_score and returns both ranks', async () => {
  const { fetch, calls } = fakeFetch({ body: [{ rank_all: 12, rank_week: 3 }] });
  const board = new Leaderboard(config, fetch);
  const ranks = await board.submit({ initials: 'ABC', score: 42, made: 9, attempts: 14, bestStreak: 5 });
  assert.deepEqual(ranks, { rankAll: 12, rankWeek: 3 });
  assert.equal(calls[0].url, 'https://example.supabase.co/rest/v1/rpc/submit_score');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    p_initials: 'ABC',
    p_score: 42,
    p_made: 9,
    p_attempts: 14,
    p_best_streak: 5,
  });
});

test('server errors surface their message', async () => {
  const { fetch } = fakeFetch({ status: 400, body: { message: 'Too many scores from you in the last minute.' } });
  const board = new Leaderboard(config, fetch);
  await assert.rejects(board.submit({ initials: 'ABC', score: 1, made: 1, attempts: 1, bestStreak: 1 }), {
    message: 'Too many scores from you in the last minute.',
  });
});
