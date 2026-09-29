import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NearestFilter,
  SpotLight,
  SRGBColorSpace,
  Vector3,
} from 'three';

// The airball cutscene. A fan in the front row behind the hoop eats popcorn
// all game. An airball cuts to a fan cam of them taking the ball in the
// face, then cuts back to the court. The game clock stands still meanwhile.

const TINT = new Color('#a4a8c4'); // the crowd's cool tint, so the fan sits in with the stands
const KERNELS = ['#fff8e1', '#f4ecd6', '#ffe08a', '#ffd166'];

// Seconds into the cutscene.
const BALL_IN = 0.55; // the ball flies into the shot
const HIT = 1.0; // and finds the fan
const END = 3.1; // cut back to the game
const SKIPPABLE = 0.25; // a tap before this is the tail of the throw, not a skip

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, t) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const mix = (a, b, t) => a + (b - a) * t;

function stripesTexture() {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 8;
  const g = c.getContext('2d');
  for (let x = 0; x < 8; x++) {
    g.fillStyle = x % 4 < 2 ? '#e8322a' : '#f4ecd6';
    g.fillRect(x, 0, 1, 8);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  return t;
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

// Boxes like the rest of the crowd, plus arms, a face and a striped bucket.
// Local space: the origin is on the seat and the fan faces +z, the court.
class PopcornFan {
  constructor(scene, seat) {
    const lambert = (hex) => new MeshLambertMaterial({ color: new Color(hex).multiply(TINT) });
    const shirt = lambert('#e8742a');
    const skin = lambert('#d9a47a');
    const dark = new MeshBasicMaterial({ color: '#1a1020' });

    this.seat = seat;
    this.root = new Group();
    this.root.position.set(seat.x, seat.y, seat.z);

    // The torso pivots on the seat so the whole fan can rock back.
    this.torso = new Group();
    this.torso.add(box(0.4, 0.56, 0.3, shirt, 0, 0.28, 0));
    this.root.add(this.torso);

    this.head = new Group();
    this.head.position.set(0, 0.56, 0); // the neck
    this.head.add(box(0.24, 0.26, 0.24, skin, 0, 0.13, 0));
    this.head.add(box(0.26, 0.08, 0.26, lambert('#2b1a10'), 0, 0.29, 0));
    this.eyes = [-0.055, 0.055].map((x) => box(0.04, 0.045, 0.02, dark, x, 0.15, 0.121));
    this.mouth = box(0.08, 0.025, 0.02, dark, 0, 0.07, 0.121);
    this.head.add(...this.eyes, this.mouth);
    this.torso.add(this.head);

    this.arms = [-1, 1].map((side) => {
      const arm = new Group();
      arm.position.set(side * 0.25, 0.5, 0); // the shoulder
      arm.add(box(0.1, 0.34, 0.1, shirt, 0, -0.15, 0));
      arm.add(box(0.1, 0.08, 0.1, skin, 0, -0.34, 0));
      this.torso.add(arm);
      return arm;
    });

    this.bucket = new Group();
    this.bucket.add(box(0.18, 0.22, 0.16, new MeshLambertMaterial({ map: stripesTexture(), color: TINT })));
    this.heap = new Group();
    for (let i = 0; i < 10; i++) {
      const kernel = box(
        0.05,
        0.05,
        0.05,
        lambert(KERNELS[i % KERNELS.length]),
        (Math.random() - 0.5) * 0.13,
        0.12 + Math.random() * 0.05,
        (Math.random() - 0.5) * 0.1,
      );
      kernel.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      this.heap.add(kernel);
    }
    this.bucket.add(this.heap);
    this.bucketHome = new Vector3(-0.1, 0.34, 0.27);

    const amber = new MeshBasicMaterial({ color: '#ffc23d' });
    this.stars = new Group();
    this.stars.position.set(0, 0.38, 0);
    for (let i = 0; i < 3; i++) this.stars.add(box(0.05, 0.05, 0.05, amber));
    this.head.add(this.stars);

    scene.add(this.root);
    this.reset();
  }

  // Back in their seat with a full bucket, as if nothing happened.
  reset() {
    this.hitAt = null;
    this.torso.add(this.bucket);
    this.bucket.position.copy(this.bucketHome);
    this.bucket.rotation.set(0, 0, 0);
    this.bucketVel = null;
    this.heap.visible = true;
    this.stars.visible = false;
    this.eyes.forEach((eye) => eye.scale.set(1, 1, 1));
    this.mouth.scale.set(1, 1, 1);
    this.head.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
  }

  hit() {
    this.hitAt = 0;
    // Let go of the bucket, keeping it where it is in the world.
    this.root.updateMatrixWorld(true);
    this.root.attach(this.bucket);
    this.bucketVel = new Vector3(0.3, 2.2, 0.25);
    this.heap.visible = false;
  }

  update(dt, time, lift) {
    this.root.position.y = this.seat.y + lift;
    const [left, right] = this.arms;
    if (this.hitAt === null) {
      // Munching: the right hand goes bucket, mouth, bucket every 2.4 s.
      const c = time % 2.4;
      const up = smooth(0.5, 0.9, c) - smooth(1.6, 2, c);
      right.rotation.set(mix(-0.95, -2.35, up), 0, mix(-0.62, -0.25, up));
      left.rotation.set(-1.05, 0, 0.3);
      const chewing = c > 0.9 && c < 1.9;
      this.mouth.scale.set(1, chewing ? 1 + 1.4 * Math.abs(Math.sin(time * 14)) : 1, 1);
      return;
    }

    const s = (this.hitAt += dt);
    // Knocked back, then a dazed wobble.
    this.head.rotation.x = -0.65 * Math.exp(-3 * s) * Math.cos(9 * s) - 0.1 * smooth(0, 0.3, s);
    this.head.rotation.z = 0.14 * Math.sin(s * 5) * smooth(0.3, 0.8, s);
    this.torso.rotation.x = -0.25 * Math.exp(-4 * s) * Math.cos(7 * s);
    // Arms fly up, then flop.
    const flail = smooth(0, 0.12, s) - smooth(0.45, 1.1, s);
    left.rotation.set(mix(-0.2, -2.9, flail), 0, mix(0.15, -0.35, flail));
    right.rotation.set(mix(-0.2, -2.9, flail), 0, mix(-0.15, 0.35, flail));
    this.eyes.forEach((eye) => eye.scale.set(1.3, 0.25, 1));
    this.mouth.scale.set(1.2, 2.6, 1);

    this.stars.visible = s > 0.3;
    this.stars.children.forEach((star, i) => {
      const a = s * 5 + (i * Math.PI * 2) / 3;
      star.position.set(Math.cos(a) * 0.2, 0.02 * Math.sin(a * 2), Math.sin(a) * 0.2);
      star.rotation.set(a, a, 0);
    });

    // The bucket flips out of their hands and lands on its side.
    if (this.bucketVel) {
      this.bucketVel.y -= 9.8 * dt;
      this.bucket.position.addScaledVector(this.bucketVel, dt);
      this.bucket.rotation.x += 7 * dt;
      this.bucket.rotation.z += 4 * dt;
      if (this.bucket.position.y < 0.09 && this.bucketVel.y < 0) {
        this.bucket.position.y = 0.09;
        this.bucket.rotation.set(0, 0.4, Math.PI / 2);
        this.bucketVel = null;
      }
    }
  }
}

export class Cutscene {
  // ball is a mesh to stage the airball with.
  constructor(scene, crowd, particles, sfx, ball) {
    this.crowd = crowd;
    this.particles = particles;
    this.sfx = sfx;
    this.fan = new PopcornFan(scene, crowd.claimSeat(2.2, 0));
    this.ball = ball;
    ball.visible = false;
    scene.add(ball);
    // The fan cam's own light. It's always in the scene, so switching it on
    // doesn't recompile any shaders; it's just dark outside the cutscene.
    this.light = new SpotLight('#fff1d6', 0, 7, 0.42, 0.7, 0);
    scene.add(this.light, this.light.target);

    this.active = false;
    this.t = 0;
    this.head = new Vector3();
    this.from = new Vector3();
    this.to = new Vector3();
    this.shake = 0;
    this.calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.tmp = new Vector3();
  }

  start({ onImpact = () => {}, onDone = () => {} } = {}) {
    Object.assign(this, { active: true, t: 0, hit: false, whooshed: false, onImpact, onDone });
    this.fan.reset();
    // A letdown quiets the crowd, so the fan isn't bouncing out of the shot.
    this.crowd.hype = 0;
    const { seat } = this.fan;
    this.head.set(seat.x, seat.y + 0.69, seat.z);
    // In from over the camera's shoulder, into the fan's face.
    this.from.copy(this.head).add(this.tmp.set(-1.1, 1.05, 1.9));
    this.to.copy(this.head).add(this.tmp.set(-0.04, 0.05, 0.25));
    this.light.position.copy(this.head).add(this.tmp.set(-0.2, 1, 2));
    this.light.target.position.copy(this.head);
    this.light.intensity = 2.6;
    this.ball.visible = false;
  }

  // Tap to skip, once the throw that started it is out of the way.
  skip() {
    if (this.active && this.t > SKIPPABLE) this.finish();
  }

  finish() {
    this.active = false;
    this.ball.visible = false;
    this.light.intensity = 0;
    this.fan.reset();
    this.onDone();
  }

  update(dt, time) {
    // In the close-up the fan just sways; hops would bounce them out of shot.
    const { seat } = this.fan;
    const lift = this.active ? Math.sin(time * 2 + seat.phase) * 0.015 : this.crowd.lift(seat, time);
    this.fan.update(dt, time, lift);
    if (!this.active) return;

    const t = (this.t += dt);
    const ball = this.ball;
    if (!this.whooshed && t >= BALL_IN - 0.08) {
      this.whooshed = true;
      this.sfx.whoosh();
    }
    if (!this.hit && t >= BALL_IN) {
      const u = clamp01((t - BALL_IN) / (HIT - BALL_IN));
      ball.position.lerpVectors(this.from, this.to, u);
      ball.position.y += 0.3 * u * (1 - u);
      ball.rotation.x -= dt * 14;
      ball.visible = true;
    }
    if (!this.hit && t >= HIT) this.impact();
    if (this.hit) {
      // Off the face: up, to the right and back toward the court.
      const s = t - HIT;
      ball.position.copy(this.to).add(this.tmp.set(1.3 * s, 2 * s - 4.9 * s * s, 1.2 * s));
      ball.rotation.z += dt * 10;
      ball.visible = s < 1.3;
    }
    this.shake *= Math.exp(-dt * 9);
    if (t >= END) this.finish();
  }

  impact() {
    this.hit = true;
    this.fan.hit();
    this.burst();
    this.shake = this.calm ? 0 : 0.06;
    this.sfx.bonk();
    this.sfx.popcorn();
    this.sfx.ooh();
    this.onImpact(this.head);
  }

  // Popcorn everywhere. Kernels thrown toward the court clear the front of
  // the riser and fall to the floor; the rest land on the row.
  burst() {
    const at = this.fan.bucket.getWorldPosition(new Vector3());
    at.y += 0.12;
    const vel = new Vector3();
    const { seat } = this.fan;
    for (let i = 0; i < 110; i++) {
      vel.set((Math.random() - 0.5) * 2.4, 1.4 + Math.random() * 2.6, (Math.random() - 0.25) * 2.2);
      this.particles.spawn(at, vel, {
        size: 0.034 + Math.random() * 0.022,
        life: 2.2 + Math.random() * 0.8,
        colour: KERNELS[i % KERNELS.length],
        gravity: 5,
        drag: 0.9,
        spin: 10,
        floor: vel.z > 0.9 ? 0.02 : seat.y + 0.03,
      });
    }
  }

  // The fan cam: a slow push in on the fan's face, with a jolt on the hit.
  aim(camera) {
    const h = this.head;
    const push = clamp01(this.t / END);
    camera.position.set(h.x - 0.5, h.y + 0.1, h.z + 2.15 - 0.3 * push);
    if (this.shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * this.shake;
      camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    camera.lookAt(this.tmp.set(h.x + 0.02, h.y - 0.14, h.z));
  }

  // A tighter lens than the game camera, like a broadcast zoom.
  fov(aspect) {
    return aspect < 0.8 ? 60 : 38;
  }
}
