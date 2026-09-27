// Online leaderboard on Supabase, spoken to over its REST API with plain
// fetch so the game doesn't carry an SDK. Reads come straight from the
// public `scores` table; writes go through the `submit_score` function,
// which validates and throttles them (see supabase/migrations).

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;
// Waits before each retry of a request that never got an answer.
const RETRY_DELAYS_MS = [700, 2000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// fetch rejects (rather than returning an error status) when the request
// never got a response: offline, dropped connection, blocked, or timed out.
function isNetworkFailure(err) {
  return err?.name === 'TypeError' || err?.name === 'TimeoutError' || err?.name === 'AbortError';
}

// A random id per round, so the server can recognise a retried save.
export function newRoundId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Arcade-style initials: three capital letters, nothing else.
export function cleanInitials(text) {
  return text.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}

export class Leaderboard {
  constructor({ url, key } = {}, fetchImpl = globalThis.fetch?.bind(globalThis), wait = sleep) {
    this.url = url;
    this.key = key;
    this.fetch = fetchImpl;
    this.wait = wait;
  }

  get enabled() {
    return Boolean(this.url && this.key && this.fetch);
  }

  // Retries requests that never reached the server. That is safe for saves
  // too: submit_score ignores a round it has already stored.
  async request(path, init = {}) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.send(path, init);
      } catch (err) {
        if (!isNetworkFailure(err) || attempt >= RETRY_DELAYS_MS.length) throw err;
        await this.wait(RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  async send(path, init) {
    const res = await this.fetch(`${this.url}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: this.key, 'Content-Type': 'application/json', ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        message = (await res.json()).message || message;
      } catch {
        // Not JSON; keep the status line.
      }
      throw new Error(message);
    }
    return res.json();
  }

  // Top scores, best first; ties go to whoever set them first.
  top(range = 'all', limit = 10, now = Date.now()) {
    let query = `scores?select=initials,score,made,attempts,created_at&order=score.desc,created_at.asc&limit=${limit}`;
    if (range === 'week') query += `&created_at=gte.${encodeURIComponent(new Date(now - WEEK_MS).toISOString())}`;
    return this.request(query);
  }

  // Saves a finished round and returns where it placed.
  async submit({ round, initials, score, made, attempts, bestStreak }) {
    const rows = await this.request('rpc/submit_score', {
      method: 'POST',
      body: JSON.stringify({
        p_round: round,
        p_initials: initials,
        p_score: score,
        p_made: made,
        p_attempts: attempts,
        p_best_streak: bestStreak,
      }),
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { rankAll: Number(row.rank_all), rankWeek: Number(row.rank_week) };
  }
}
