// Thin wrapper over the DOM overlay: the 3D scene never touches the page.
const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.score = $('score');
    this.time = $('time');
    this.timeBox = this.time.parentElement;
    this.streak = $('streak');
    this.pips = [...this.streak.querySelectorAll('.pip')];
    this.shotTag = $('shot-tag');
    this.hintEl = $('hint');
    this.popups = $('popups');
    this.countdownEl = $('countdown');
    this.title = $('title');
    this.over = $('over');
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

  setShot(three, feet) {
    this.shotTag.textContent = `${three ? '3PT' : '2PT'} · ${feet} FT`;
    this.shotTag.classList.toggle('three', three);
  }

  hint(show) {
    this.hintEl.hidden = !show;
  }

  popup(x, y, { points = null, word = '', kind = '' } = {}) {
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

  showOver({ score, made, attempts, bestStreak, best, newBest }) {
    this.root.hidden = true;
    this.countdown(null);
    $('final-score').textContent = score;
    $('stat-made').textContent = `${made}/${attempts}`;
    $('stat-pct').textContent = `${attempts ? Math.round((made / attempts) * 100) : 0}%`;
    $('stat-streak').textContent = bestStreak;
    $('stat-best').textContent = best;
    $('new-best').hidden = !newBest;
    this.over.hidden = false;
    $('again').focus({ preventScroll: true });
  }
}
