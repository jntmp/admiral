import { Vector3 } from 'three';
import { BALL_RADIUS, BOARD, GRAVITY, NET, PHYSICS, POLE, RIM } from './config.js';

// Walls of the playable box: the front row of the bleachers on three sides and
// an invisible fence at half court.
const BOUNDS = { minX: -9.4, maxX: 9.4, minZ: -3.1, maxZ: 13 };

// Contacts slower than this don't produce sound events.
const QUIET = 0.35;

export class Ball {
  constructor() {
    this.pos = new Vector3();
    this.vel = new Vector3();
    this.radius = BALL_RADIUS;
    this.reset();
  }

  reset() {
    this.touchedRim = false;
    this.touchedBoard = false;
    this.scored = false;
    this.inNet = false;
    this.floorHits = 0;
    this.age = 0;
  }

  launch(pos, vel) {
    this.pos.copy(pos);
    this.vel.copy(vel);
    this.reset();
  }
}

// The hoop assembly can slide sideways; x is its offset and vx its velocity.
export function createHoopState() {
  return { x: 0, vx: 0 };
}

// Reflect the ball's velocity about the contact normal (relative to a surface
// moving at hvx along x). Returns the closing speed, or 0 if already separating.
function bounce(ball, nx, ny, nz, restitution, friction, hvx) {
  const v = ball.vel;
  const rx = v.x - hvx;
  const vn = rx * nx + v.y * ny + v.z * nz;
  if (vn >= 0) return 0;
  const tx = rx - vn * nx;
  const ty = v.y - vn * ny;
  const tz = v.z - vn * nz;
  const out = -vn * restitution;
  v.x = tx * friction + out * nx + hvx;
  v.y = ty * friction + out * ny;
  v.z = tz * friction + out * nz;
  return -vn;
}

function collideFloor(ball, dt, events) {
  const { pos, vel, radius } = ball;
  if (pos.y >= radius) return;
  pos.y = radius;
  if (vel.y >= 0) return;
  const impact = -vel.y;
  if (impact > 0.5) {
    vel.y = impact * PHYSICS.floorRestitution;
    vel.x *= PHYSICS.floorFriction;
    vel.z *= PHYSICS.floorFriction;
    ball.floorHits++;
    events.push({ type: 'floor', ball, speed: impact });
  } else {
    // Resting on the floor: roll to a stop.
    vel.y = 0;
    const roll = Math.max(0, 1 - 1.2 * dt);
    vel.x *= roll;
    vel.z *= roll;
  }
}

function collideBounds(ball) {
  const { pos, vel, radius } = ball;
  if (pos.x < BOUNDS.minX + radius) { pos.x = BOUNDS.minX + radius; vel.x = Math.abs(vel.x) * 0.5; }
  if (pos.x > BOUNDS.maxX - radius) { pos.x = BOUNDS.maxX - radius; vel.x = -Math.abs(vel.x) * 0.5; }
  if (pos.z < BOUNDS.minZ + radius) { pos.z = BOUNDS.minZ + radius; vel.z = Math.abs(vel.z) * 0.5; }
  if (pos.z > BOUNDS.maxZ - radius) { pos.z = BOUNDS.maxZ - radius; vel.z = -Math.abs(vel.z) * 0.5; }
}

function collideBoard(ball, hoop, events) {
  const { pos, radius } = ball;
  const minX = hoop.x - BOARD.width / 2;
  const maxX = hoop.x + BOARD.width / 2;
  const minY = BOARD.bottom;
  const maxY = BOARD.bottom + BOARD.height;
  const minZ = BOARD.front - BOARD.thickness;
  const maxZ = BOARD.front;

  const cx = Math.min(Math.max(pos.x, minX), maxX);
  const cy = Math.min(Math.max(pos.y, minY), maxY);
  const cz = Math.min(Math.max(pos.z, minZ), maxZ);
  let nx = pos.x - cx;
  let ny = pos.y - cy;
  let nz = pos.z - cz;
  const d2 = nx * nx + ny * ny + nz * nz;
  if (d2 >= radius * radius) return;

  let d = Math.sqrt(d2);
  if (d < 1e-6) {
    // Centre inside the board: shove it out the front.
    nx = 0; ny = 0; nz = 1; d = 0;
    pos.z = maxZ;
  } else {
    nx /= d; ny /= d; nz /= d;
  }
  pos.set(cx + nx * radius, cy + ny * radius, cz + nz * radius);
  const speed = bounce(ball, nx, ny, nz, PHYSICS.boardRestitution, PHYSICS.boardFriction, hoop.vx);
  if (speed > 0) {
    ball.touchedBoard = true;
    if (speed > QUIET) events.push({ type: 'board', ball, speed });
  }
}

function collidePole(ball, hoop, events) {
  const { pos, radius } = ball;
  if (pos.y > POLE.height + radius) return;
  const dx = pos.x - hoop.x;
  const dz = pos.z - POLE.z;
  const min = radius + POLE.radius;
  const d2 = dx * dx + dz * dz;
  if (d2 >= min * min || d2 < 1e-12) return;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const nz = dz / d;
  pos.x = hoop.x + nx * min;
  pos.z = POLE.z + nz * min;
  const speed = bounce(ball, nx, 0, nz, 0.5, 0.9, hoop.vx);
  if (speed > QUIET) events.push({ type: 'board', ball, speed });
}

// The rim is a torus: find the closest point on its centre circle, then treat
// it as a sphere-vs-sphere contact against the tube.
function collideRim(ball, hoop, events) {
  const { pos, radius } = ball;
  const dx = pos.x - hoop.x;
  const dz = pos.z;
  const hd = Math.hypot(dx, dz);
  const qx = hd > 1e-6 ? hoop.x + (dx / hd) * RIM.radius : hoop.x + RIM.radius;
  const qz = hd > 1e-6 ? (dz / hd) * RIM.radius : 0;
  let nx = pos.x - qx;
  let ny = pos.y - RIM.y;
  let nz = pos.z - qz;
  const min = radius + RIM.tube;
  const d2 = nx * nx + ny * ny + nz * nz;
  if (d2 >= min * min || d2 < 1e-12) return;
  const d = Math.sqrt(d2);
  nx /= d; ny /= d; nz /= d;
  pos.set(qx + nx * min, RIM.y + ny * min, qz + nz * min);
  const speed = bounce(ball, nx, ny, nz, PHYSICS.rimRestitution, PHYSICS.rimFriction, hoop.vx);
  if (speed > 0) {
    ball.touchedRim = true;
    if (speed > QUIET) events.push({ type: 'rim', ball, speed });
  }
}

// Scoring, then the net: once a ball has dropped through the rim the net
// funnels it toward the middle and soaks up some of its speed.
function checkNet(ball, hoop, prevY, dt, events) {
  const { pos, vel } = ball;
  const dx = pos.x - hoop.x;
  const dz = pos.z;
  const hd = Math.hypot(dx, dz);

  if (!ball.scored && prevY >= RIM.y && pos.y < RIM.y && vel.y < 0 && hd < RIM.radius) {
    ball.scored = true;
    ball.inNet = true;
    events.push({ type: 'score', ball, swish: !ball.touchedRim && !ball.touchedBoard });
  }

  if (!ball.inNet) return;
  const depth = RIM.y - pos.y;
  if (depth > NET.depth + ball.radius) {
    ball.inNet = false;
    return;
  }
  const t = Math.min(Math.max(depth / NET.depth, 0), 1);
  const netR = RIM.radius + (NET.bottomRadius - RIM.radius) * t;
  const allowed = Math.max(0, netR - ball.radius * 0.7);
  if (hd > allowed && hd > 1e-6) {
    const push = PHYSICS.netSpring * (hd - allowed) * dt;
    vel.x -= (dx / hd) * push;
    vel.z -= (dz / hd) * push;
  }
  const drag = Math.max(0, 1 - PHYSICS.netDrag * dt);
  vel.x = (vel.x - hoop.vx) * drag + hoop.vx;
  vel.y *= drag;
  vel.z *= drag;
}

// Advance one ball by one fixed substep, appending contact events.
export function stepBall(ball, hoop, dt, events) {
  const { pos, vel } = ball;
  const prevY = pos.y;
  ball.age += dt;
  // Exact for constant gravity, so free flight lands precisely on the
  // parabola the aim preview draws.
  pos.x += vel.x * dt;
  pos.y += vel.y * dt - 0.5 * GRAVITY * dt * dt;
  pos.z += vel.z * dt;
  vel.y -= GRAVITY * dt;

  collideFloor(ball, dt, events);
  collideBounds(ball);
  collideBoard(ball, hoop, events);
  collidePole(ball, hoop, events);
  collideRim(ball, hoop, events);
  checkNet(ball, hoop, prevY, dt, events);
}

export function isOnFloor(ball) {
  return ball.pos.y <= ball.radius + 1e-4 && Math.abs(ball.vel.y) < 1e-3;
}
