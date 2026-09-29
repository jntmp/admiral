// Every sound is synthesised on the fly: no audio files to load.
//
// Voices run through one shared chain: a low-pass that takes the fizz off
// the top, a short gym-sized reverb so hits ring out instead of stopping
// dead, and a gentle compressor so stacked sounds never spike.
const VOLUME = 0.7;

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
      const ctx = (this.ctx = new AudioCtx());

      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : VOLUME;
      this.master.connect(ctx.destination);

      const glue = ctx.createDynamicsCompressor();
      glue.threshold.value = -20;
      glue.knee.value = 18;
      glue.ratio.value = 3;
      glue.attack.value = 0.004;
      glue.release.value = 0.25;
      glue.connect(this.master);

      const warmth = ctx.createBiquadFilter();
      warmth.type = 'lowpass';
      warmth.frequency.value = 3800;
      warmth.Q.value = 0.5;
      warmth.connect(glue);

      const room = ctx.createConvolver();
      room.buffer = this.roomImpulse(1.2);
      const wet = ctx.createGain();
      wet.gain.value = 0.25;
      room.connect(wet).connect(warmth);

      this.bus = ctx.createGain();
      this.bus.connect(warmth);
      this.bus.connect(room);

      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // Decaying stereo noise: a cheap stand-in for a gym's echo.
  roomImpulse(seconds) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const impulse = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    return impulse;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : VOLUME;
  }

  get ready() {
    return this.ctx && this.ctx.state === 'running' && !this.muted;
  }

  tone({ type = 'triangle', freq = 440, to = null, start = 0, dur = 0.15, gain = 0.2, attack = 0.012, lowpass = null }) {
    const t = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(gain, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = osc;
    if (lowpass) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      out = osc.connect(f);
    }
    out.connect(amp).connect(this.bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  hiss({ start = 0, dur = 0.3, gain = 0.2, attack = 0.01, filter = 'bandpass', freq = 2000, to = null, q = 1 }) {
    const t = this.ctx.currentTime + start;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(gain, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(amp).connect(this.bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // A rubbery thump, like a real dribble.
  floor(speed) {
    if (!this.ready) return;
    const g = Math.min(0.45, speed * 0.07);
    this.tone({ type: 'sine', freq: 120, to: 50, dur: 0.2, gain: g, attack: 0.004 });
    this.hiss({ dur: 0.06, gain: g * 0.2, filter: 'lowpass', freq: 500, attack: 0.003 });
  }

  // A rounded "tonk" with a little ring, instead of a bare metallic clank.
  rim(speed) {
    if (!this.ready) return;
    const g = Math.min(0.2, speed * 0.045);
    this.tone({ type: 'sine', freq: 523.25, dur: 0.4, gain: g, attack: 0.004 });
    this.tone({ type: 'triangle', freq: 1046.5, dur: 0.22, gain: g * 0.3, attack: 0.004 });
    this.tone({ type: 'sine', freq: 180, to: 120, dur: 0.08, gain: g * 0.8, attack: 0.003 });
  }

  board(speed) {
    if (!this.ready) return;
    const g = Math.min(0.4, speed * 0.06);
    this.tone({ type: 'triangle', freq: 170, to: 105, dur: 0.16, gain: g, attack: 0.005, lowpass: 900 });
    this.hiss({ dur: 0.08, gain: g * 0.3, filter: 'lowpass', freq: 800, attack: 0.004 });
  }

  // A soft whoosh through the net.
  swish() {
    if (!this.ready) return;
    this.hiss({ dur: 0.42, gain: 0.2, attack: 0.04, freq: 1800, to: 700, q: 0.7 });
  }

  score(points, onFire) {
    if (!this.ready) return;
    const base = onFire ? 659.25 : 523.25;
    const steps = points >= 3 ? [0, 4, 7, 12] : [0, 4, 7];
    steps.forEach((semi, i) => {
      this.tone({ freq: base * 2 ** (semi / 12), start: 0.1 + i * 0.08, dur: 0.22, gain: 0.07 });
    });
    this.hiss({ start: 0.05, dur: 1.4, gain: 0.09, attack: 0.18, freq: 900, q: 0.5 }); // crowd
  }

  fire() {
    if (!this.ready) return;
    [0, 3, 7, 10, 12, 15].forEach((semi, i) => {
      this.tone({ freq: 392 * 2 ** (semi / 12), start: i * 0.06, dur: 0.16, gain: 0.035 });
    });
  }

  miss() {
    if (!this.ready) return;
    this.tone({ type: 'sine', freq: 220, to: 165, start: 0.02, dur: 0.35, gain: 0.06, attack: 0.02 });
  }

  whoosh() {
    if (!this.ready) return;
    this.hiss({ dur: 0.22, gain: 0.06, attack: 0.05, freq: 500, to: 1500, q: 1 });
  }

  // A cartoon bonk: a hollow knock and a falling boing.
  bonk() {
    if (!this.ready) return;
    this.tone({ type: 'square', freq: 220, to: 110, dur: 0.1, gain: 0.1, attack: 0.002, lowpass: 900 });
    this.tone({ type: 'sine', freq: 740, to: 185, dur: 0.38, gain: 0.14, attack: 0.004 });
    this.hiss({ dur: 0.05, gain: 0.1, filter: 'lowpass', freq: 1200, attack: 0.002 });
  }

  // Popcorn going everywhere: a scatter of tiny ticks.
  popcorn() {
    if (!this.ready) return;
    for (let i = 0; i < 14; i++) {
      this.hiss({ start: 0.02 + Math.random() * 0.7, dur: 0.02, gain: 0.05, filter: 'highpass', freq: 2600, attack: 0.002 });
    }
  }

  // The crowd's sympathetic "ooooh": noise through a vowel-ish band that
  // slides down.
  ooh() {
    if (!this.ready) return;
    this.hiss({ start: 0.08, dur: 1.4, gain: 0.13, attack: 0.18, freq: 800, to: 420, q: 2.5 });
    this.hiss({ start: 0.08, dur: 1.4, gain: 0.07, attack: 0.18, freq: 380, to: 260, q: 3 });
  }

  tick(high = false) {
    if (!this.ready) return;
    this.tone({ type: 'sine', freq: high ? 990 : 660, dur: 0.14, gain: 0.09, attack: 0.005 });
  }

  buzzer() {
    if (!this.ready) return;
    this.tone({ type: 'sawtooth', freq: 180, dur: 0.9, gain: 0.12, attack: 0.03, lowpass: 700 });
    this.tone({ type: 'triangle', freq: 90, dur: 0.9, gain: 0.1, attack: 0.03 });
  }
}
