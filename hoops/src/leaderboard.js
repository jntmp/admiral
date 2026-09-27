// Online leaderboard on Supabase, spoken to over its REST API with plain
// fetch so the game doesn't carry an SDK. Reads come straight from the
// public `scores` table; writes go through the `submit_score` function,
// which validates and throttles them (see supabase/migrations).

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

export function cleanInitials(text) {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
}

export class Leaderboard {
  constructor({ url, key } = {}, fetchImpl = globalThis.fetch?.bind(globalThis)) {
    this.url = url;
    this.key = key;
    this.fetch = fetchImpl;
  }

  get enabled() {
    return Boolean(this.url && this.key && this.fetch);
  }

  async request(path, init = {}) {
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
  async submit({ initials, score, made, attempts, bestStreak }) {
    const rows = await this.request('rpc/submit_score', {
      method: 'POST',
      body: JSON.stringify({
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
