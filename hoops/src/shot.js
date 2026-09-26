import { Vector3 } from 'three';
import { BALL_RADIUS, BOARD, COURT, GAME, GRAVITY, RELEASE_HEIGHT, RIM, SHOT } from './config.js';

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// Launch elevation chosen so the ball drops into the rim at SHOT.entryAngle.
// On a parabola through (distance, rise) the slope on arrival is
// tan(launch) - 2 * rise / distance, which pins the launch angle down.
export function launchAngle(distance, rise) {
  return Math.atan(Math.tan(SHOT.entryAngle * DEG) + (2 * rise) / distance);
}

// Speed needed to pass through a point `distance` away horizontally and
// `rise` higher, at elevation `angle`. Null if the angle can't get there.
export function requiredSpeed(distance, rise, angle) {
  const c = Math.cos(angle);
  const denom = 2 * c * c * (distance * Math.tan(angle) - rise);
  if (denom <= 0) return null;
  return Math.sqrt((GRAVITY * distance * distance) / denom);
}

// Velocity for a throw from `from` toward `target`, with `power` scaling the
// perfect speed and `yaw` (radians, + is to the right) bending the direction.
export function aimedVelocity(from, target, power = 1, yaw = 0, out = new Vector3()) {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const distance = Math.hypot(dx, dz);
  const rise = target.y - from.y;
  const angle = launchAngle(distance, rise);
  const speed = requiredSpeed(distance, rise, angle) * power;
  const fx = dx / distance;
  const fz = dz / distance;
  // Screen-right for a camera looking along (fx, fz) is (-fz, fx).
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const hx = fx * c - fz * s;
  const hz = fz * c + fx * s;
  const horizontal = Math.cos(angle) * speed;
  return out.set(hx * horizontal, Math.sin(angle) * speed, hz * horizontal);
}

// Turn a swipe into a throw. dx/dy are measured in viewport heights with +dy
// pointing up the screen. Returns null for swipes that shouldn't shoot.
export function swipeToShot(dx, dy) {
  const length = Math.hypot(dx, dy);
  if (dy <= 0 || length < SHOT.minSwipe) return null;
  const power = clamp(1 + SHOT.powerSensitivity * (length / SHOT.idealSwipe - 1), 0.6, 1.4);
  const yaw = clamp(Math.atan2(dx, dy) * SHOT.aimSensitivity, -SHOT.maxYaw, SHOT.maxYaw);
  return { power, yaw, strength: clamp(length / SHOT.idealSwipe, 0, 2) };
}

// Ballistic position after `t` seconds, ignoring collisions.
export function ballisticPoint(from, vel, t, out = new Vector3()) {
  return out.set(
    from.x + vel.x * t,
    from.y + vel.y * t - 0.5 * GRAVITY * t * t,
    from.z + vel.z * t,
  );
}

// The whole flight of a throw until its first contact: dropping through the
// rim's plane from above, meeting the backboard, or reaching the floor.
// Returns dots spaced `spacing` metres apart along the path (skipping the
// first `skip` metres so they don't sit on the ball) and where it ends.
export function previewPath(from, vel, hoopX = 0, { spacing = 0.24, skip = 0.5, step = 1 / 240 } = {}) {
  const points = [];
  const prev = from.clone();
  const p = new Vector3();
  const boardFace = BOARD.front + BALL_RADIUS;
  const boardTop = BOARD.bottom + BOARD.height;
  let travelled = 0;
  let nextDot = skip;
  for (let t = step; t < 4; t += step) {
    ballisticPoint(from, vel, t, p);
    travelled += p.distanceTo(prev);
    let end = null;
    if (prev.y > RIM.y && p.y <= RIM.y) {
      // Interpolate to the exact crossing.
      const f = (prev.y - RIM.y) / (prev.y - p.y);
      end = { at: prev.clone().lerp(p, f), surface: 'rim' };
    } else if (
      prev.z > boardFace &&
      p.z <= boardFace &&
      p.y > BOARD.bottom - BALL_RADIUS &&
      p.y < boardTop + BALL_RADIUS &&
      Math.abs(p.x - hoopX) < BOARD.width / 2 + BALL_RADIUS
    ) {
      end = { at: p.clone().setZ(boardFace), surface: 'board' };
    } else if (p.y <= BALL_RADIUS) {
      end = { at: p.clone().setY(BALL_RADIUS), surface: 'floor' };
    }
    if (end) return { points, end };
    while (travelled >= nextDot) {
      points.push(p.clone());
      nextDot += spacing;
    }
    prev.copy(p);
  }
  return { points, end: { at: prev.clone(), surface: 'floor' } };
}

export function isThreePointer(x, z) {
  if (z < COURT.baseline + 3) return Math.abs(x) >= COURT.threeCornerX;
  return Math.hypot(x, z) >= COURT.threeRadius;
}

// Distance and angle ranges widen as the player racks up makes.
export function spotRange(makes) {
  if (makes < 3) return { min: 2.4, max: 4.2, spread: 40 };
  if (makes < 7) return { min: 3.4, max: 5.8, spread: 60 };
  return { min: 4.4, max: 7.6, spread: 70 };
}

// Pick the next place to shoot from. Keeps clear of the last spot so the
// camera always has somewhere to go.
export function pickSpot(makes, previous, random = Math.random) {
  const { min, max, spread } = spotRange(makes);
  let best = null;
  for (let i = 0; i < 12; i++) {
    const distance = min + (max - min) * random();
    const angle = (random() * 2 - 1) * spread * DEG;
    const x = Math.sin(angle) * distance;
    const z = Math.cos(angle) * distance;
    if (Math.abs(x) > COURT.halfWidth - 0.6) continue;
    const candidate = new Vector3(x, RELEASE_HEIGHT, z);
    best = candidate;
    if (!previous || Math.hypot(x - previous.x, z - previous.z) > 1.4) break;
  }
  return best ?? new Vector3(0, RELEASE_HEIGHT, min);
}

export function rimTarget(out = new Vector3()) {
  return out.set(0, RIM.y, 0);
}

// How far the hoop slides at a given number of makes: [amplitude, speed].
export function hoopMotion(makes) {
  if (makes >= GAME.fastHoopAt) return [1.1, 1.6];
  if (makes >= GAME.movingHoopAt) return [0.8, 1.0];
  return [0, 0];
}
