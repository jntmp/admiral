import { cleanInitials, isNotNewBest } from './leaderboard.js';

const $ = (id) => document.getElementById(id);

// Say what went wrong, including the browser's own reason when the request
// never got an answer, so a failure report is something we can act on.
function saveError(err) {
  if (isNotNewBest(err) || err.message.startsWith('Too many')) return err.message;
  const reason = err.message ? ` (${err.message})` : '';
  if (err.name === 'TypeError' || err.name === 'TimeoutError' || err.name === 'AbortError') {
    return `Couldn't reach the leaderboard${reason}. Tap Submit to try again.`;
  }
  return `The leaderboard didn't accept that score${reason}.`;
}

const EMPTY = {
  daily: "No one has played today's daily yet. Set the first score.",
  week: 'No scores this week yet. Set the first one.',
  all: 'No scores yet. Set the first one.',
};

// The leaderboard's two pieces of UI: the initials form on the results
// screen, and the board screen reachable from the title and results screens.
export class BoardUi {
  constructor(leaderboard, store) {
    this.leaderboard = leaderboard;
    this.store = store;
    this.screen = $('board');
    this.list = $('board-list');
    this.status = $('board-status');
    this.tabs = [...this.screen.querySelectorAll('[data-range]')];
    this.form = $('submit-form');
    this.input = $('initials');
    this.submitButton = this.form.querySelector('button');
    this.submitStatus = $('submit-status');
    this.caption = $('board-caption');
    this.range = 'week';
    this.today = null;
    this.onSaved = () => {};
    this.result = null;
    this.mine = null;
    this.request = 0;

    const openers = [...document.querySelectorAll('[data-board]')];
    if (!leaderboard.enabled) {
      openers.forEach((b) => (b.hidden = true));
      return;
    }
    openers.forEach((b) => b.addEventListener('click', () => this.open(b)));
    $('board-back').addEventListener('click', () => this.close());
    this.tabs.forEach((tab) => tab.addEventListener('click', () => this.show(tab.dataset.range)));
    this.input.addEventListener('input', () => {
      const clean = cleanInitials(this.input.value);
      if (clean !== this.input.value) this.input.value = clean;
    });
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
  }

  // A round just ended: offer to post it. Daily practice rounds can't be
  // posted; only the first daily round of the day is official.
  offer(result) {
    this.result = result;
    this.mine = null;
    this.range = result.daily ? 'daily' : 'week';
    this.form.hidden =
      !this.leaderboard.enabled || result.score <= 0 || (result.daily && !result.official);
    this.input.disabled = false;
    this.submitButton.disabled = false;
    this.input.value = cleanInitials(String(this.store.get('initials', '')));
    this.submitStatus.textContent = '';
  }

  async submit() {
    if (!this.result || this.busy) return;
    const initials = cleanInitials(this.input.value);
    if (initials.length !== 3) {
      this.submitStatus.textContent = 'Enter three letters.';
      this.input.focus();
      return;
    }
    const result = this.result;
    this.busy = true;
    this.submitButton.disabled = true;
    this.submitStatus.textContent = 'Saving…';
    try {
      let rank;
      let message;
      if (result.daily) {
        const { rankDay, players } = await this.leaderboard.submitDaily({ initials, day: result.daily.key, ...result });
        rank = `#${rankDay} of ${players}`;
        message = `Saved: ${rank} today.`;
      } else {
        const { rankWeek, rankAll, bestAll } = await this.leaderboard.submit({ initials, ...result });
        rank = `#${rankWeek} this week`;
        // A new best for the week that doesn't beat an older all-time best.
        message =
          bestAll > result.score
            ? `Saved: #${rankWeek} this week. Your best, ${bestAll}, is #${rankAll} all time.`
            : `Saved: #${rankWeek} this week, #${rankAll} all time.`;
      }
      this.store.set('initials', initials);
      // A newer round took over the form while this one was saving.
      if (this.result !== result) return;
      this.mine = { initials, score: result.score };
      this.result = null;
      this.input.disabled = true;
      this.submitStatus.textContent = message;
      this.onSaved(result, rank);
    } catch (err) {
      if (this.result !== result) return;
      this.submitButton.disabled = false;
      this.submitStatus.textContent = saveError(err);
    } finally {
      this.busy = false;
    }
  }

  open(opener) {
    this.opener = opener;
    this.returnTo = opener.closest('.screen');
    this.returnTo.hidden = true;
    this.screen.hidden = false;
    this.show(this.range);
    this.tabs.find((t) => t.dataset.range === this.range).focus({ preventScroll: true });
  }

  close() {
    this.screen.hidden = true;
    this.returnTo.hidden = false;
    this.opener.focus({ preventScroll: true });
  }

  async show(range) {
    this.range = range;
    this.tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.range === range)));
    this.caption.textContent =
      range === 'daily' && this.today
        ? `Daily #${this.today.number} · ${this.today.twist.name}`
        : 'Classic 60-second rounds';
    const request = ++this.request;
    this.list.replaceChildren();
    this.status.textContent = 'Loading…';
    try {
      const rows = await this.leaderboard.top(range);
      if (request !== this.request) return;
      this.render(rows);
      this.status.textContent = rows.length ? '' : EMPTY[range];
    } catch (err) {
      if (request !== this.request) return;
      const reason = err.message ? ` (${err.message})` : '';
      this.status.textContent = `Couldn't load the leaderboard${reason}. Check your connection and try again.`;
    }
  }

  render(rows) {
    let highlighted = false;
    this.list.replaceChildren(
      ...rows.map((row, i) => {
        // Tied scores share a rank.
        const rank = rows.findIndex((r) => r.score === row.score) + 1;
        const li = document.createElement('li');
        const cells = [
          ['rank', String(rank)],
          ['who', row.initials],
          ['pts', String(row.score)],
        ];
        for (const [cls, text] of cells) {
          const span = document.createElement('span');
          span.className = cls;
          span.textContent = text;
          li.append(span);
        }
        if (!highlighted && this.mine && row.initials === this.mine.initials && row.score === this.mine.score) {
          li.classList.add('me');
          highlighted = true;
        }
        return li;
      }),
    );
  }
}
