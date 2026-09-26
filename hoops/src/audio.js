// Every sound is synthesised on the fly: no audio files to load.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.noise = null;
  }

  // Browsers only allow audio after a user gesture, so call this from one.
  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  get ready() {
    return this.ctx && this.ctx.state === 'running' && !this.muted;
  }

  tone({ type = 'square', freq = 440, to = null, start = 0, dur = 0.15, gain = 0.2, attack = 0.005 }) {
    const t = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(gain, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  hiss({ start = 0, dur = 0.3, gain = 0.2, filter = 'bandpass', freq = 2000, to = null, q = 1 }) {
    const t = this.ctx.currentTime + start;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(amp).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  floor(speed) {
    if (!this.ready) return;
    const g = Math.min(0.5, speed * 0.07);
    this.tone({ type: 'sine', freq: 150, to: 55, dur: 0.14, gain: g });
    this.hiss({ dur: 0.05, gain: g * 0.4, filter: 'lowpass', freq: 900 });
  }

  rim(speed) {
    if (!this.ready) return;
    const g = Math.min(0.22, speed * 0.05);
    this.tone({ type: 'square', freq: 740, dur: 0.16, gain: g * 0.5 });
    this.tone({ type: 'triangle', freq: 1480, dur: 0.22, gain: g });
    this.tone({ type: 'triangle', freq: 2220, dur: 0.1, gain: g * 0.6 });
  }

  board(speed) {
    if (!this.ready) return;
    const g = Math.min(0.4, speed * 0.06);
    this.tone({ type: 'triangle', freq: 220, to: 120, dur: 0.12, gain: g });
    this.hiss({ dur: 0.08, gain: g * 0.5, filter: 'lowpass', freq: 1400 });
  }

  swish() {
    if (!this.ready) return;
    this.hiss({ dur: 0.35, gain: 0.35, freq: 4200, to: 1200, q: 0.8 });
  }

  score(points, onFire) {
    if (!this.ready) return;
    const base = onFire ? 659.25 : 523.25;
    const steps = points >= 3 ? [0, 4, 7, 12] : [0, 4, 7];
    steps.forEach((semi, i) => {
      this.tone({ freq: base * 2 ** (semi / 12), start: 0.1 + i * 0.07, dur: 0.12, gain: 0.08 });
    });
    this.hiss({ start: 0.05, dur: 1.2, gain: 0.12, freq: 1100, q: 0.4 }); // crowd
  }

  fire() {
    if (!this.ready) return;
    [0, 3, 7, 10, 12, 15].forEach((semi, i) => {
      this.tone({ type: 'sawtooth', freq: 392 * 2 ** (semi / 12), start: i * 0.05, dur: 0.1, gain: 0.05 });
    });
  }

  miss() {
    if (!this.ready) return;
    this.tone({ type: 'square', freq: 196, to: 147, start: 0.02, dur: 0.25, gain: 0.05 });
  }

  whoosh() {
    if (!this.ready) return;
    this.hiss({ dur: 0.2, gain: 0.08, freq: 700, to: 2400, q: 1.2 });
  }

  tick(high = false) {
    if (!this.ready) return;
    this.tone({ freq: high ? 1318.5 : 880, dur: 0.08, gain: 0.07 });
  }

  buzzer() {
    if (!this.ready) return;
    this.tone({ type: 'sawtooth', freq: 180, dur: 0.9, gain: 0.18, attack: 0.02 });
    this.tone({ type: 'square', freq: 182, dur: 0.9, gain: 0.08, attack: 0.02 });
  }
}
