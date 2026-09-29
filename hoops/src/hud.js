// Thin wrapper over the DOM overlay: the 3D scene never touches the page.
const $ = (id) => document.getElementById(id);

// Gauge segments shade from cream at the bottom through amber to rim red.
const GAUGE_STOPS = [
  [244, 236, 214],
  [255, 194, 61],
  [255, 77, 46],
];

function buildGauge(bar, count) {
  return Array.from({ length: count }, (_, i) => {
    const t = (i / (count - 1)) * (GAUGE_STOPS.length - 1);
    const k = Math.min(Math.floor(t), GAUGE_STOPS.length - 2);
    const f = t - k;
    const rgb = GAUGE_STOPS[k].map((c, j) => Math.round(c + (GAUGE_STOPS[k + 1][j] - c) * f));
    const seg = document.createElement('i');
    seg.style.setProperty('--seg', `rgb(${rgb.join(' ')})`);
    bar.append(seg);
    return seg;
  });
}

export class Hud {
  constructor() {
    this.root = $('hud');
    this.score = $('score');
    this.time = $('time');
    this.timeBox = this.time.parentElement;
    this.streak = $('streak');
    this.pips = [...this.streak.querySelectorAll('.pip')];
    this.shotTag = $('shot-tag');
    this.twistTag = $('twist-tag');
    this.hintEl = $('hint');
    this.popups = $('popups');
    this.countdownEl = $('countdown');
    this.title = $('title');
    this.over = $('over');
    this.power = $('power');
    this.segments = buildGauge($('power-bar'), 16);
    this.last = {};
  }

  set(key, value, apply) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    apply(value);
  }

  showPlay() {
    this.title.hidden = true;
    this.over.hidden = true;
    this.root.hidden = false;
    this.last = {};
  }

  setScore(score) {
    this.set('score', score, (v) => (this.score.textContent = v));
  }

  setTime(seconds) {
    const shown = Math.max(0, Math.ceil(seconds));
    this.set('time', shown, (v) => {
      this.time.textContent = v;
      this.timeBox.classList.toggle('low', v <= 10);
    });
  }

  setStreak(streak, needed) {
    this.set('streak', streak, (v) => {
      this.pips.forEach((pip, i) => pip.classList.toggle('on', i < v));
      this.streak.classList.toggle('fire', v >= needed);
    });
  }

  // level 0..1 fills the gauge from the bottom; fired marks a released shot.
  setPower(level, fired) {
    const lit = Math.round(Math.min(Math.max(level, 0), 1) * this.segments.length);
    this.set('power', lit, (v) => this.segments.forEach((seg, i) => seg.classList.toggle('on', i < v)));
    this.set('fired', fired, (v) => this.power.classList.toggle('fired', v));
  }

  setShot(three, feet) {
    this.shotTag.textContent = `${three ? '3PT' : '2PT'} · ${feet} FT`;
    this.shotTag.classList.toggle('three', three);
  }

  hint(show) {
    this.hintEl.hidden = !show;
  }

  // The daily twist's name under the shot tag; null hides it.
  setTwist(text) {
    this.twistTag.hidden = !text;
    this.twistTag.textContent = text ?? '';
  }

  popup(x, y, { points = null, word = '', detail = '', kind = '' } = {}) {
    const el = document.createElement('div');
    el.className = `popup ${kind}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    if (points !== null) {
      const p = document.createElement('span');
      p.className = 'popup-points';
      p.textContent = `+${points}`;
      el.append(p);
    }
    if (word) {
      const w = document.createElement('span');
      w.className = 'popup-word';
      w.textContent = word;
      el.append(w);
    }
    if (detail) {
      const d = document.createElement('span');
      d.className = 'popup-detail';
      d.textContent = detail;
      el.append(d);
    }
    this.popups.append(el);
    el.addEventListener('animationend', () => el.remove());
    // Safety net in case animations are disabled.
    setTimeout(() => el.remove(), 2500);
  }

  countdown(text) {
    this.countdownEl.hidden = text === null;
    if (text !== null) this.countdownEl.textContent = text;
  }

  showTitle(best) {
    $('best-title').textContent = best;
  }

  // The daily card on the title screen: today's twist, and your official
  // result once you've played it.
  showDaily({ number, key, twist }, record) {
    const date = new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    $('daily-eyebrow').textContent = `Daily #${number} · ${date}`;
    $('daily-name').textContent = twist.name;
    $('daily-rule').textContent = twist.rule;
    const done = $('daily-done');
    done.hidden = !record;
    if (record) {
      const rank = record.rank ? `, ${record.rank}` : '';
      done.textContent = `Today: ${record.score} pts, ${record.made}/${record.attempts} made${rank}`;
    }
    $('daily-play').textContent = record ? 'Practice' : 'Play daily';
    $('daily-share').hidden = !record;
  }

  showOver({ score, made, attempts, bestStreak, best, newBest, title = 'Time!', mode = '', practice = '' }) {
    this.root.hidden = true;
    this.countdown(null);
    $('over-title').textContent = title;
    $('result-mode').textContent = mode;
    const note = $('practice-note');
    note.hidden = !practice;
    note.textContent = practice;
    $('final-score').textContent = score;
    $('stat-made').textContent = `${made}/${attempts}`;
    $('stat-pct').textContent = `${attempts ? Math.round((made / attempts) * 100) : 0}%`;
    $('stat-streak').textContent = bestStreak;
    $('stat-best').textContent = best;
    // The best score is a classic-round record; daily rounds don't touch it.
    $('stat-best').parentElement.hidden = Boolean(mode) && !mode.startsWith('Classic');
    $('new-best').hidden = !newBest;
    this.over.hidden = false;
    $('again').focus({ preventScroll: true });
  }
}
