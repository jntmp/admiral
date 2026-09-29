// Online leaderboard on Supabase, spoken to over its REST API with plain
// fetch so the game doesn't carry an SDK. Boards are read through the
// `top_scores` function, which lists each player once at their best; writes
// go through `submit_score` and `submit_daily`, which validate and throttle
// them and only take a player's new best (see supabase/migrations).

const TIMEOUT_MS = 8000;
// Waits before each retry of a request that never got an answer.
const RETRY_DELAYS_MS = [700, 2000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// fetch rejects (rather than returning an error status) when the request
// never got a response: offline, dropped connection, blocked, or timed out.
function isNetworkFailure(err) {
  return err?.name === 'TypeError' || err?.name === 'TimeoutError' || err?.name === 'AbortError';
}

// The server turned a round down because that player (their initials)
// already has this score or better on the board; the message says so.
export function isNotNewBest(err) {
  return err?.code === 'PT409';
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
      let body = {};
      try {
        body = await res.json();
      } catch {
        // Not JSON; keep the status line.
      }
      const err = new Error(body.message || `HTTP ${res.status}`);
      err.code = body.code;
      throw err;
    }
    return res.json();
  }

  // Top scores, best first, one row per player; ties go to whoever set the
  // score first. 'daily' is today's challenge (UTC); 'week' (the last 7 days)
  // and 'all' are classic rounds only.
  top(range = 'all', limit = 10, now = Date.now()) {
    const params = new URLSearchParams({ p_board: range, p_limit: String(limit) });
    if (range === 'daily') params.set('p_day', new Date(now).toISOString().slice(0, 10));
    return this.request(`rpc/top_scores?${params}`);
  }

  // Saves a finished round and returns where it placed: this week, and all
  // time for the player's best (bestAll), which may be an older round.
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
    return { rankAll: Number(row.rank_all), rankWeek: Number(row.rank_week), bestAll: Number(row.best_all) };
  }

  // Saves a daily-challenge round; `day` is the challenge's UTC date.
  async submitDaily({ round, day, initials, score, made, attempts, bestStreak }) {
    const rows = await this.request('rpc/submit_daily', {
      method: 'POST',
      body: JSON.stringify({
        p_round: round,
        p_day: day,
        p_initials: initials,
        p_score: score,
        p_made: made,
        p_attempts: attempts,
        p_best_streak: bestStreak,
      }),
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { rankDay: Number(row.rank_day), players: Number(row.players) };
  }
}
