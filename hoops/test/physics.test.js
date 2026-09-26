import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { GRAVITY, PHYSICS, RELEASE_HEIGHT, RIM, SHOT } from '../src/config.js';
import { Ball, createHoopState, stepBall } from '../src/physics.js';
import {
  aimedVelocity,
  ballisticPoint,
  isThreePointer,
  launchAngle,
  pickSpot,
  rimTarget,
  swipeToShot,
} from '../src/shot.js';

function simulate(from, vel, { seconds = 4, hoop = createHoopState() } = {}) {
  const ball = new Ball();
  ball.launch(from, vel);
  const events = [];
  for (let t = 0; t < seconds; t += PHYSICS.substep) stepBall(ball, hoop, PHYSICS.substep, events);
  return { ball, events };
}

const spotAt = (distance, degrees) => {
  const a = (degrees * Math.PI) / 180;
  return new Vector3(Math.sin(a) * distance, RELEASE_HEIGHT, Math.cos(a) * distance);
};

test('a perfect throw from anywhere on the floor is a swish', () => {
  for (const distance of [2.4, 4, 5.5, 7, 7.6]) {
    for (const degrees of [-70, -30, 0, 45, 70]) {
      const from = spotAt(distance, degrees);
      const { ball, events } = simulate(from, aimedVelocity(from, rimTarget(), 1, 0));
      const scores = events.filter((e) => e.type === 'score');
      assert.equal(scores.length, 1, `one score from ${distance}m at ${degrees}°`);
      assert.equal(scores[0].swish, true, `swish from ${distance}m at ${degrees}°`);
      assert.equal(ball.touchedRim, false);
    }
  }
});

test('a ball dropped onto the rim bounces off it', () => {
  const { ball, events } = simulate(new Vector3(RIM.radius, RIM.y + 1, 0), new Vector3(0, 0, 0));
  assert.ok(events.some((e) => e.type === 'rim'));
  assert.equal(ball.scored, false);
});

test('a ball dropped through the middle scores exactly once and the net slows it', () => {
  const drop = 1;
  const { ball, events } = simulate(new Vector3(0, RIM.y + drop, 0), new Vector3(0, 0, 0), { seconds: 0.7 });
  assert.equal(events.filter((e) => e.type === 'score').length, 1);
  assert.equal(ball.touchedRim, false);
  // Free fall from this height would be faster than what comes out the bottom.
  const freeFall = Math.sqrt(2 * GRAVITY * (drop + RIM.y - ball.pos.y));
  assert.ok(Math.abs(ball.vel.y) < freeFall, 'net drag reduces speed');
});

test('a ball thrown well short never scores and lands on the floor', () => {
  const from = spotAt(6, 0);
  const { ball, events } = simulate(from, aimedVelocity(from, rimTarget(), 0.7, 0));
  assert.equal(ball.scored, false);
  assert.ok(events.some((e) => e.type === 'floor'));
});

test('the backboard sends the ball back toward the shooter', () => {
  const ball = new Ball();
  ball.launch(new Vector3(0.6, 3.5, 0.5), new Vector3(0, 0, -6));
  const events = [];
  const hoop = createHoopState();
  for (let t = 0; t < 0.4; t += PHYSICS.substep) stepBall(ball, hoop, PHYSICS.substep, events);
  assert.ok(ball.touchedBoard);
  assert.ok(ball.vel.z > 0);
});

test('a ball comes to rest on the floor', () => {
  const { ball } = simulate(new Vector3(0, 2, 5), new Vector3(1, 0, 0), { seconds: 12 });
  assert.ok(Math.abs(ball.pos.y - ball.radius) < 1e-6);
  assert.ok(ball.vel.length() < 0.05);
});

test('swipes: down or tiny swipes do nothing; the ideal swipe is a perfect throw', () => {
  assert.equal(swipeToShot(0, -0.3), null);
  assert.equal(swipeToShot(0, SHOT.minSwipe / 2), null);
  const ideal = swipeToShot(0, SHOT.idealSwipe);
  assert.equal(ideal.power, 1);
  assert.equal(ideal.yaw, 0);
  assert.ok(swipeToShot(0, SHOT.idealSwipe * 1.5).power > 1);
  assert.ok(swipeToShot(0, SHOT.idealSwipe * 0.6).power < 1);
});

test('swiping right throws right of the hoop', () => {
  const from = spotAt(5, 0); // looking down -z, so screen-right is +x
  const shot = swipeToShot(0.1, SHOT.idealSwipe);
  assert.ok(shot.yaw > 0);
  const vel = aimedVelocity(from, rimTarget(), shot.power, shot.yaw);
  assert.ok(vel.x > 0);
});

test('launch angle drops the ball in at the configured entry angle', () => {
  const from = spotAt(5, 0);
  const target = rimTarget();
  const vel = aimedVelocity(from, target, 1, 0);
  // Time to reach the rim horizontally, then the slope of the path there.
  const t = 5 / Math.hypot(vel.x, vel.z);
  const at = ballisticPoint(from, vel, t);
  assert.ok(at.distanceTo(target) < 1e-6);
  const vy = vel.y - GRAVITY * t;
  const entry = (Math.atan2(-vy, Math.hypot(vel.x, vel.z)) * 180) / Math.PI;
  assert.ok(Math.abs(entry - SHOT.entryAngle) < 1e-6);
  assert.ok(launchAngle(2.5, 1.3) > launchAngle(7, 1.3), 'closer shots are loftier');
});

test('three-point line: corners and the arc', () => {
  assert.equal(isThreePointer(0, 6), false);
  assert.equal(isThreePointer(0, 7), true);
  assert.equal(isThreePointer(6.7, 0), true);
  assert.equal(isThreePointer(6.4, 0), false);
});

test('spots stay on the court and move between shots', () => {
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let prev = null;
  for (let makes = 0; makes < 30; makes++) {
    const spot = pickSpot(makes, prev, random);
    assert.ok(Math.abs(spot.x) < 7.5 && spot.z > 0);
    assert.equal(spot.y, RELEASE_HEIGHT);
    prev = spot;
  }
});
