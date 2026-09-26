import {
  Mesh,
  MeshLambertMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { buildArena } from './arena.js';
import { Sfx } from './audio.js';
import { BALL_RADIUS, GAME, PHYSICS, RIM, SHOT } from './config.js';
import { AimDots, Particles } from './fx.js';
import { buildHoop } from './hoop.js';
import { Hud } from './hud.js';
import { Ball, createHoopState, stepBall } from './physics.js';
import { PixelRenderer } from './pixel.js';
import {
  aimedVelocity,
  hoopMotion,
  isThreePointer,
  pickSpot,
  previewPath,
  rimTarget,
  swipeToShot,
} from './shot.js';
import { ballTexture } from './textures.js';

const UP = new Vector3(0, 1, 0);
const CONFETTI = ['#ffc23d', '#ff4d2e', '#f4ecd6', '#1f6670', '#3fb6c4'];
const SPARKS = ['#ffc23d', '#ff8a1a', '#ff4d2e'];
const MAKE_WORDS = ['Bucket!', 'Nice!', 'Money!', 'Count it!'];
const RIM_WORDS = ['Rimmed out', 'So close', 'Brick'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`pixel-hoops:${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`pixel-hoops:${key}`, JSON.stringify(value));
    } catch {
      // Storage can be unavailable (private mode, sandboxed frames); the game
      // just forgets the best score.
    }
  },
};

// ---------------------------------------------------------------- setup

const canvas = document.getElementById('game');
const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;
const pixel = new PixelRenderer(renderer);

const scene = new Scene();
const camera = new PerspectiveCamera(58, 1, 0.1, 60);
const { scoreboard, crowd } = buildArena(scene);
const { group: hoopGroup, net } = buildHoop();
scene.add(hoopGroup);
const particles = new Particles(scene);
const aim = new AimDots(scene);
const sfx = new Sfx();
const hud = new Hud();
const hoop = createHoopState();
const target = rimTarget();

sfx.setMuted(store.get('muted', false));

const ballGeometry = new SphereGeometry(BALL_RADIUS, 16, 12);
const ballMap = ballTexture();
const balls = []; // everything in the air or rolling around
let held = null; // the ball waiting in the shooter's hands

const game = {
  mode: 'title', // title | countdown | play | over
  phase: 'idle', // moving | ready | aiming | flying | settling
  phaseTimer: 0,
  score: 0,
  makes: 0,
  attempts: 0,
  streak: 0,
  bestStreak: 0,
  time: GAME.duration,
  buzzer: false,
  countdown: 0,
  lastTick: null,
  best: store.get('best', 0),
  spot: new Vector3(0, 0, 5),
  three: false,
  shot: null,
  clock: 0,
  demoTimer: 1,
  demoSpot: null,
  hoopAmp: 0,
  hoopPhase: 0,
};

// Camera: tweened between shooting spots, eased toward an orbit otherwise.
const rig = {
  pos: new Vector3(0, 3.4, 8.5),
  look: new Vector3(0, 2.5, 0),
  fromPos: new Vector3(),
  fromLook: new Vector3(),
  toPos: new Vector3(),
  toLook: new Vector3(),
  t: 1,
  duration: 1,
  follow: new Vector3(),
  shake: 0,
};

// ---------------------------------------------------------------- balls

function createBall() {
  const mesh = new Mesh(ballGeometry, new MeshLambertMaterial({ map: ballMap }));
  mesh.castShadow = true;
  scene.add(mesh);
  const b = { body: new Ball(), mesh, spin: new Vector3(), shot: false, resolved: false, three: false, fire: false, life: 0, grow: 0 };
  b.body.owner = b;
  return b;
}

function removeBall(b) {
  scene.remove(b.mesh);
  b.mesh.material.dispose();
}

function setFire(b, on) {
  b.fire = on;
  b.mesh.material.emissive.set(on ? '#ff5a1a' : '#000000');
  b.mesh.material.emissiveIntensity = on ? 0.6 : 0;
}

const spinQuat = new Quaternion();
const spinAxis = new Vector3();
function spinMesh(b, dt) {
  const rate = b.spin.length();
  if (rate < 1e-4) return;
  spinAxis.copy(b.spin).divideScalar(rate);
  spinQuat.setFromAxisAngle(spinAxis, rate * dt);
  b.mesh.quaternion.premultiply(spinQuat);
}

// ---------------------------------------------------------------- camera

const tmpPos = new Vector3();
const tmpLook = new Vector3();

const awayFromHoop = new Vector3();
function poseFor(spot, pos, look) {
  awayFromHoop.set(spot.x, 0, spot.z).normalize();
  pos.copy(spot).addScaledVector(awayFromHoop, 1.55);
  pos.y += 0.28;
  look.set(0, RIM.y - 0.55, 0);
}

function tweenCamera(pos, look, duration) {
  rig.fromPos.copy(rig.pos);
  rig.fromLook.copy(rig.look);
  rig.toPos.copy(pos);
  rig.toLook.copy(look);
  rig.t = 0;
  rig.duration = duration;
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function updateCamera(dt) {
  if (game.mode === 'title' || game.mode === 'over') {
    const a = Math.sin(game.clock * 0.12) * 0.85;
    tmpPos.set(Math.sin(a) * 8.5, 3.4, Math.cos(a) * 8.5 + 0.5);
    const k = 1 - Math.exp(-dt * 1.2);
    rig.pos.lerp(tmpPos, k);
    rig.look.lerp(tmpLook.set(0, 2.6, 0), k);
  } else if (rig.t < 1) {
    rig.t = Math.min(1, rig.t + dt / rig.duration);
    const e = ease(rig.t);
    rig.pos.lerpVectors(rig.fromPos, rig.toPos, e);
    rig.look.lerpVectors(rig.fromLook, rig.toLook, e);
  }

  // Drift the view a little toward the ball in flight.
  const followTarget = tmpPos.set(0, 0, 0);
  if (game.shot && game.mode === 'play') {
    followTarget.copy(game.shot.body.pos).sub(rig.look).multiplyScalar(0.12);
  }
  rig.follow.lerp(followTarget, 1 - Math.exp(-dt * 3));

  camera.position.copy(rig.pos);
  camera.position.y += Math.sin(game.clock * 1.3) * 0.008;
  if (rig.shake > 0.0005) {
    camera.position.x += (Math.random() - 0.5) * rig.shake;
    camera.position.y += (Math.random() - 0.5) * rig.shake;
  }
  rig.shake *= Math.exp(-dt * 12);
  camera.lookAt(tmpLook.copy(rig.look).add(rig.follow));
}

// ---------------------------------------------------------------- input

const pointer = { id: null, x0: 0, y0: 0, x: 0, y: 0 };

function currentSwipe() {
  const h = window.innerHeight;
  return swipeToShot((pointer.x - pointer.x0) / h, (pointer.y0 - pointer.y) / h);
}

canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if (game.mode !== 'play' || game.phase !== 'ready' || pointer.id !== null) return;
  pointer.id = e.pointerId;
  pointer.x0 = pointer.x = e.clientX;
  pointer.y0 = pointer.y = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('aiming');
  game.phase = 'aiming';
});

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== pointer.id) return;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
});

function endDrag(fire) {
  const shot = fire ? currentSwipe() : null;
  pointer.id = null;
  canvas.classList.remove('aiming');
  aim.hide();
  if (game.phase !== 'aiming') return;
  if (shot) throwBall(shot);
  else game.phase = 'ready';
}

canvas.addEventListener('pointerup', (e) => e.pointerId === pointer.id && endDrag(true));
canvas.addEventListener('pointercancel', (e) => e.pointerId === pointer.id && endDrag(false));

const previewVel = new Vector3();
function updateAim() {
  const shot = game.phase === 'aiming' ? currentSwipe() : null;
  if (!shot) {
    aim.hide();
    return;
  }
  aimedVelocity(game.spot, target, shot.power, shot.yaw, previewVel);
  aim.show(previewPath(game.spot, previewVel, hoop.x));
}

// ---------------------------------------------------------------- shots

function onFire() {
  return game.streak >= GAME.fireStreak;
}

function nextSpot(first = false) {
  game.spot.copy(pickSpot(game.makes, first ? null : game.spot));
  game.three = isThreePointer(game.spot.x, game.spot.z);
  poseFor(game.spot, tmpPos, tmpLook);
  tweenCamera(tmpPos, tmpLook, first ? 1.2 : 0.6);
  hud.setShot(game.three, Math.round(Math.hypot(game.spot.x, game.spot.z) / 0.3048));
  game.phase = 'moving';
}

function spawnHeld() {
  held = createBall();
  held.mesh.position.copy(game.spot);
  held.mesh.scale.setScalar(0.01);
  setFire(held, onFire());
  game.phase = 'ready';
}

function throwBall(shot) {
  const b = held;
  held = null;
  const vel = aimedVelocity(game.spot, target, shot.power, shot.yaw);
  b.body.launch(game.spot, vel);
  b.mesh.scale.setScalar(1);
  b.shot = true;
  b.three = game.three;
  b.life = 0;
  // Backspin: the top of the ball rolls back toward the shooter.
  b.spin.crossVectors(tmpPos.set(vel.x, 0, vel.z).normalize(), UP).multiplyScalar(16);
  balls.push(b);
  game.shot = b;
  game.attempts++;
  game.phase = 'flying';
  hud.hint(false);
  sfx.whoosh();
}

const screenPos = new Vector3();
function rimOnScreen(lift = 0.55) {
  screenPos.set(hoop.x, RIM.y + lift, 0).project(camera);
  return [(screenPos.x * 0.5 + 0.5) * window.innerWidth, (-screenPos.y * 0.5 + 0.5) * window.innerHeight];
}

function banner(word, delay = 0) {
  setTimeout(() => {
    if (game.mode !== 'play') return;
    hud.popup(window.innerWidth / 2, window.innerHeight * 0.24, { word, kind: 'banner' });
  }, delay);
}

function onMake(b, swish) {
  b.resolved = true;
  const multiplier = onFire() ? 2 : 1;
  const bank = b.body.touchedBoard && !b.body.touchedRim;
  const points = ((b.three ? 3 : 2) + (swish ? 1 : 0)) * multiplier;
  game.score += points;
  game.makes++;
  game.streak++;
  game.bestStreak = Math.max(game.bestStreak, game.streak);

  let word = pick(MAKE_WORDS);
  if (game.buzzer) word = 'Buzzer beater!';
  else if (swish) word = 'Swish!';
  else if (bank) word = 'Bank!';
  else if (b.three) word = 'From downtown!';
  const [x, y] = rimOnScreen();
  hud.popup(x, y, { points, word });

  if (game.streak === GAME.fireStreak) {
    banner("You're on fire!", 450);
    sfx.fire();
  }
  if (game.makes === GAME.movingHoopAt) banner('Hoop on the move!', 900);
  if (game.makes === GAME.fastHoopAt) banner('Faster!', 900);

  crowd.cheer(swish || multiplier > 1 ? 1.3 : 0.9);
  particles.confetti(screenPos.set(hoop.x, RIM.y - 0.2, 0.1), CONFETTI, swish ? 80 : 50);
  sfx.swish();
  sfx.score(points, multiplier > 1);
  settle(0.6);
}

function onMiss(b) {
  b.resolved = true;
  const wasOnFire = onFire();
  game.streak = 0;
  const { touchedRim, touchedBoard } = b.body;
  const word = !touchedRim && !touchedBoard ? 'Airball' : touchedRim ? pick(RIM_WORDS) : 'Off the glass';
  const [x, y] = rimOnScreen();
  hud.popup(x, y, { word: wasOnFire ? 'Fire out' : word, kind: 'miss' });
  sfx.miss();
  settle(0.4);
}

function settle(delay) {
  game.shot = null;
  game.phase = 'settling';
  game.phaseTimer = delay;
}

function checkShot() {
  const b = game.shot;
  if (!b || b.resolved || b.body.scored) return;
  const { pos, vel, inNet, age, floorHits } = b.body;
  const fellAway = vel.y < 0 && pos.y < RIM.y - 0.45 && !inNet;
  if (fellAway || floorHits > 0 || age > 4) onMiss(b);
}

// ---------------------------------------------------------------- flow

function startGame() {
  sfx.unlock();
  if (held) removeBall(held);
  held = null;
  // Clear the demo balls off the court.
  balls.splice(0).forEach(removeBall);
  Object.assign(game, {
    mode: 'countdown',
    score: 0,
    makes: 0,
    attempts: 0,
    streak: 0,
    bestStreak: 0,
    time: GAME.duration,
    buzzer: false,
    countdown: 3,
    lastTick: 4,
    shot: null,
  });
  hud.showPlay();
  hud.hint(true);
  sfx.tick();
  nextSpot(true);
}

function endGame() {
  game.mode = 'over';
  game.phase = 'idle';
  if (held) removeBall(held);
  held = null;
  aim.hide();
  const newBest = game.score > game.best;
  if (newBest) {
    game.best = game.score;
    store.set('best', game.best);
  }
  hud.showOver({
    score: game.score,
    made: game.makes,
    attempts: game.attempts,
    bestStreak: game.bestStreak,
    best: game.best,
    newBest,
  });
  crowd.cheer(newBest ? 1.5 : 0.6);
}

function updateClock(dt) {
  if (game.mode === 'countdown') {
    const before = Math.ceil(game.countdown);
    game.countdown -= dt;
    const now = Math.ceil(game.countdown);
    if (now !== before) sfx.tick(now <= 0);
    hud.countdown(now > 0 ? String(now) : 'GO!');
    if (game.countdown <= 0) game.mode = 'play';
    return;
  }
  if (game.mode !== 'play') return;
  if (game.countdown > -0.7) {
    game.countdown -= dt;
    if (game.countdown <= -0.7) hud.countdown(null);
  }
  if (game.buzzer) return;

  game.time -= dt;
  const secs = Math.ceil(game.time);
  if (secs <= 5 && secs > 0 && secs !== game.lastTick) {
    game.lastTick = secs;
    sfx.tick();
  }
  if (game.time > 0) return;

  // Buzzer. A shot already in the air still counts.
  game.time = 0;
  game.buzzer = true;
  sfx.buzzer();
  if (game.phase !== 'flying') {
    pointer.id = null;
    canvas.classList.remove('aiming');
    aim.hide();
    settle(0.8);
  }
}

function updatePhase(dt) {
  if (game.mode !== 'play' && game.mode !== 'countdown') return;
  if (game.phase === 'moving' && rig.t >= 1) spawnHeld();
  if (game.phase === 'settling') {
    game.phaseTimer -= dt;
    if (game.phaseTimer <= 0) {
      if (game.buzzer) endGame();
      else nextSpot();
    }
  }
  checkShot();
}

// Keep the court lively behind the title and results screens.
function updateDemo(dt) {
  if (game.mode !== 'title' && game.mode !== 'over') return;
  game.demoTimer -= dt;
  if (game.demoTimer > 0) return;
  game.demoTimer = 1.4 + Math.random() * 0.6;
  game.demoSpot = pickSpot(4 + Math.floor(Math.random() * 8), game.demoSpot);
  const b = createBall();
  const vel = aimedVelocity(game.demoSpot, target, 1 + (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05);
  b.body.launch(game.demoSpot, vel);
  b.spin.crossVectors(tmpPos.set(vel.x, 0, vel.z).normalize(), UP).multiplyScalar(16);
  balls.push(b);
}

// ---------------------------------------------------------------- world

const events = [];
const rollSpin = new Vector3();

function handleEvent(e) {
  const b = e.ball.owner;
  const loud = game.mode === 'play' || game.mode === 'countdown';
  switch (e.type) {
    case 'floor':
      if (loud) sfx.floor(e.speed);
      rollSpin.crossVectors(UP, b.body.vel).divideScalar(BALL_RADIUS);
      b.spin.lerp(rollSpin, 0.6);
      break;
    case 'rim':
      if (loud) sfx.rim(e.speed);
      if (b.shot && e.speed > 2.5) rig.shake = Math.max(rig.shake, 0.03);
      b.spin.multiplyScalar(0.7);
      break;
    case 'board':
      if (loud) sfx.board(e.speed);
      break;
    case 'score':
      if (b.shot && !b.resolved && game.mode === 'play') onMake(b, e.swish);
      else if (!b.shot) {
        crowd.cheer(0.5);
        particles.confetti(tmpPos.set(hoop.x, RIM.y - 0.2, 0.1), CONFETTI, 24);
      }
      break;
  }
}

function updateHoop(dt) {
  const playing = game.mode === 'play' || game.mode === 'countdown';
  const [amp, speed] = playing ? hoopMotion(game.makes) : [0, 0];
  game.hoopAmp += (amp - game.hoopAmp) * Math.min(1, dt * 1.2);
  game.hoopPhase += speed * dt;
  const x = game.hoopAmp * Math.sin(game.hoopPhase);
  hoop.vx = dt > 0 ? (x - hoop.x) / dt : 0;
  hoop.x = x;
  hoopGroup.position.x = x;
}

function updateBalls(dt) {
  const steps = Math.max(1, Math.ceil(dt / PHYSICS.substep));
  const h = dt / steps;
  events.length = 0;
  for (let s = 0; s < steps; s++) {
    for (const b of balls) stepBall(b.body, hoop, h, events);
  }
  events.forEach(handleEvent);

  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    b.life += dt;
    b.mesh.position.copy(b.body.pos);
    spinMesh(b, dt);
    if (b.fire && b.life < 2.5) {
      for (let k = 0; k < 2; k++) {
        particles.spawn(b.body.pos, tmpPos.set((Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6), {
          size: 0.05 + Math.random() * 0.04,
          life: 0.35 + Math.random() * 0.25,
          colour: pick(SPARKS),
          gravity: -2,
          drag: 3,
        });
      }
    }
    const dead = b.life > 5 && (!b.shot || b.resolved);
    if (dead) b.mesh.scale.setScalar(Math.max(0, 1 - (b.life - 5) * 3));
    if ((dead && b.life > 5.33) || (balls.length > 7 && i === 0 && b !== game.shot)) {
      removeBall(b);
      balls.splice(i, 1);
    }
  }
  net.update(dt, balls.map((b) => b.body), hoop.x);
}

function updateHeld(dt) {
  if (!held) return;
  held.grow = Math.min(1, held.grow + dt * 5);
  const g = held.grow;
  // Ease-out-back so the ball pops into the hands.
  const s = 1 + 2.2 * (g - 1) ** 3 + 1.2 * (g - 1) ** 2;
  held.mesh.scale.setScalar(Math.max(0.01, s));
  held.mesh.position.copy(game.spot);
  // Bob while waiting; hold still while aiming so the preview starts on it.
  if (game.phase !== 'aiming') held.mesh.position.y += Math.sin(game.clock * 3) * 0.015;
  held.mesh.rotation.y += dt * 0.8;
  const fire = onFire();
  if (held.fire !== fire) setFire(held, fire);
  if (fire) held.mesh.material.emissiveIntensity = 0.45 + Math.sin(game.clock * 14) * 0.2;
}

// The gauge follows the live swipe, holds the released value while the ball
// flies, then drains. Full is twice the swipe length of a perfect throw.
const power = { level: 0, hold: 0 };
function updatePower(dt) {
  if (game.phase === 'aiming') {
    const h = window.innerHeight;
    const dx = (pointer.x - pointer.x0) / h;
    const dy = (pointer.y0 - pointer.y) / h;
    power.level = dy > 0 ? Math.hypot(dx, dy) / SHOT.idealSwipe : 0;
    power.hold = 0.9;
  } else if (power.hold > 0) {
    power.hold -= dt;
  } else {
    power.level = Math.max(0, power.level - dt * 3);
  }
  hud.setPower(power.level / 2, game.phase !== 'aiming' && power.hold > 0 && power.level > 0);
}

function updateHud() {
  scoreboard.update(game.mode === 'title' ? 0 : game.score, game.mode === 'title' ? GAME.duration : game.time, game.best);
  if (game.mode !== 'play' && game.mode !== 'countdown') return;
  hud.setScore(game.score);
  hud.setTime(game.time);
  hud.setStreak(game.streak, GAME.fireStreak);
}

// ---------------------------------------------------------------- loop

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const size = pixel.setSize(window.innerWidth, window.innerHeight, ratio);
  camera.aspect = size.x / size.y;
  camera.fov = camera.aspect < 0.8 ? 66 : 58;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.clock += dt;

  updateClock(dt);
  updateHoop(dt);
  updateDemo(dt);
  updateBalls(dt);
  updatePhase(dt);
  updateCamera(dt);
  updateHeld(dt);
  updateAim();
  updatePower(dt);
  particles.update(dt);
  crowd.update(dt, game.clock);
  updateHud();

  pixel.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- ui

hud.showTitle(game.best);
document.getElementById('play').addEventListener('click', startGame);
document.getElementById('again').addEventListener('click', startGame);

const muteButton = document.getElementById('mute');
function syncMute() {
  muteButton.setAttribute('aria-pressed', String(sfx.muted));
  muteButton.setAttribute('aria-label', sfx.muted ? 'Unmute sound' : 'Mute sound');
}
function toggleMute() {
  sfx.unlock();
  sfx.setMuted(!sfx.muted);
  store.set('muted', sfx.muted);
  syncMute();
}
muteButton.addEventListener('click', toggleMute);
syncMute();

window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') toggleMute();
});

requestAnimationFrame(frame);
