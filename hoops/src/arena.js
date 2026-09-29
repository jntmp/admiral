import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  SpotLight,
} from 'three';
import {
  bannerTexture,
  FLOOR,
  floorTexture,
  PALETTE,
  scoreboardTexture,
  wallTexture,
} from './textures.js';

const ROWS = 7;
const ROW_DEPTH = 0.8;
const ROW_RISE = 0.45;
const BACK_FRONT = -3.3; // z of the first row behind the hoop
const SIDE_FRONT = 9.6; // |x| of the first row along each sideline
const SIDE_END = 13; // how far toward half court the side stands run
const BACK_WALL = BACK_FRONT - ROWS * ROW_DEPTH;
const SIDE_WALL = SIDE_FRONT + ROWS * ROW_DEPTH;

function box(w, h, d, material, x, y, z) {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

// Arena lighting: the court sits in a pool of light and the stands fall off
// into the dark, which keeps the busy crowd from fighting the hoop.
function buildLights(scene) {
  scene.add(new HemisphereLight(0xd9dcff, 0x2a2140, 0.75));

  const fill = new DirectionalLight(0xfff0d8, 0.35);
  fill.position.set(-4, 10, 12);
  scene.add(fill);

  const key = new SpotLight(0xfff0d8, 3.2, 0, 0.62, 0.55, 0);
  key.position.set(1.5, 15, 5);
  key.target.position.set(0, 0, 2.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 4;
  key.shadow.camera.far = 30;
  key.shadow.bias = -0.0004;
  scene.add(key, key.target);

  // Warm key on the hoop so it reads against the stands.
  const spot = new PointLight(0xffd29a, 8, 10, 1.6);
  spot.position.set(0, 6, 2.5);
  scene.add(spot);
}

function buildFloor(scene) {
  const width = FLOOR.maxX - FLOOR.minX;
  const depth = FLOOR.maxZ - FLOOR.minZ;
  const court = new Mesh(
    new PlaneGeometry(width, depth),
    new MeshLambertMaterial({ map: floorTexture() }),
  );
  court.rotation.x = -Math.PI / 2;
  court.position.set((FLOOR.minX + FLOOR.maxX) / 2, 0, (FLOOR.minZ + FLOOR.maxZ) / 2);
  court.receiveShadow = true;
  scene.add(court);

  const apron = new Mesh(new PlaneGeometry(60, 60), new MeshLambertMaterial({ color: PALETTE.tealDark }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, -0.01, 5);
  scene.add(apron);
}

function buildWalls(scene) {
  const tex = wallTexture();
  const back = tex.clone();
  back.repeat.set(16, 7);
  const side = tex.clone();
  side.repeat.set(14, 7);
  const height = 14;

  const backWall = new Mesh(new PlaneGeometry(SIDE_WALL * 2, height), new MeshLambertMaterial({ map: back }));
  backWall.position.set(0, height / 2, BACK_WALL);
  scene.add(backWall);

  for (const sign of [-1, 1]) {
    const wall = new Mesh(new PlaneGeometry(28, height), new MeshLambertMaterial({ map: side }));
    wall.rotation.y = -sign * Math.PI / 2;
    wall.position.set(sign * SIDE_WALL, height / 2, BACK_WALL + 14);
    scene.add(wall);
  }

  const ceiling = new Mesh(new PlaneGeometry(40, 40), new MeshBasicMaterial({ color: '#0b0f22' }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, height, 6);
  scene.add(ceiling);
}

function buildStands(scene) {
  const riser = new MeshLambertMaterial({ color: '#2c3358' });
  const seatColors = [PALETTE.teal, '#d9622b'];
  const seats = seatColors.map((c) => new MeshLambertMaterial({ color: c }));

  for (let row = 0; row < ROWS; row++) {
    const top = (row + 1) * ROW_RISE;
    const seat = seats[row % 2];
    // Behind the hoop.
    const z = BACK_FRONT - row * ROW_DEPTH - ROW_DEPTH / 2;
    const width = SIDE_WALL * 2;
    scene.add(box(width, top, ROW_DEPTH, riser, 0, top / 2, z));
    scene.add(box(width, 0.08, 0.3, seat, 0, top + 0.04, z + 0.1));
    // Along both sidelines.
    const length = SIDE_END - BACK_FRONT;
    for (const sign of [-1, 1]) {
      const x = sign * (SIDE_FRONT + row * ROW_DEPTH + ROW_DEPTH / 2);
      scene.add(box(ROW_DEPTH, top, length, riser, x, top / 2, BACK_FRONT + length / 2));
      scene.add(box(0.3, 0.08, length, seat, x - sign * 0.1, top + 0.04, BACK_FRONT + length / 2));
    }
  }
}

function buildScoreboard(scene) {
  const texture = scoreboardTexture();
  const frame = new MeshLambertMaterial({ color: '#1a1d2e' });
  const face = new MeshBasicMaterial({ map: texture });
  const board = new Mesh(new BoxGeometry(5.2, 2.4, 0.3), [frame, frame, frame, frame, face, frame]);
  board.position.set(0, 8.2, BACK_WALL + 0.2);
  scene.add(board);

  const banners = [
    ['CHAMPS', '98', PALETTE.teal],
    ['CHAMPS', '04', '#b8392a'],
    ['FINALS', '17', '#3a3f8f'],
    ['CHAMPS', '26', PALETTE.teal],
  ];
  banners.forEach(([top, bottom, color], i) => {
    const mesh = new Mesh(
      new PlaneGeometry(1.2, 2),
      new MeshLambertMaterial({ map: bannerTexture(top, bottom, color), alphaTest: 0.5 }),
    );
    const x = [-6.4, -4.4, 4.4, 6.4][i];
    mesh.position.set(x, 8.6, BACK_WALL + 0.05);
    scene.add(mesh);
  });

  return texture;
}

const SHIRTS = ['#1f6670', '#e8742a', '#f4ecd6', '#3a3f8f', '#b8392a', '#ffc23d', '#2e8b57', '#6b4fa0', '#1a1d2e'];
const SKIN = ['#f1c7a1', '#d9a47a', '#b57a52', '#8a5636', '#5e3a24'];
const HAIR = ['#2b1a10', '#4a2e18', '#1a1a1a', '#c9a45c', '#7a3b1e'];

// Fans are two stacked boxes. Hype makes them bounce; it decays on its own.
export class Crowd {
  constructor(scene) {
    const rand = (() => {
      let s = 1234567;
      return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    })();

    this.seats = [];
    const add = (x, z, rowTop, facing) => {
      if (rand() < 0.14) return;
      this.seats.push({ x, z, y: rowTop, facing, phase: rand() * Math.PI * 2, delay: 0, jump: 0.7 + rand() * 0.6 });
    };
    for (let row = 0; row < ROWS; row++) {
      const top = (row + 1) * ROW_RISE;
      const z = BACK_FRONT - row * ROW_DEPTH - ROW_DEPTH * 0.55;
      for (let x = -SIDE_WALL + 0.8; x < SIDE_WALL - 0.6; x += 0.56) add(x + (rand() - 0.5) * 0.08, z, top, 0);
      for (const sign of [-1, 1]) {
        const x = sign * (SIDE_FRONT + row * ROW_DEPTH + ROW_DEPTH * 0.55);
        for (let sz = BACK_FRONT + 0.4; sz < SIDE_END - 0.3; sz += 0.56) {
          add(x, sz + (rand() - 0.5) * 0.08, top, -sign * Math.PI / 2);
        }
      }
    }

    const n = this.seats.length;
    // A cool tint on every fan pushes the stands back behind the court.
    const lambert = () => new MeshLambertMaterial({ color: '#a4a8c4' });
    this.bodies = new InstancedMesh(new BoxGeometry(0.4, 0.56, 0.3), lambert(), n);
    this.heads = new InstancedMesh(new BoxGeometry(0.24, 0.26, 0.24), lambert(), n);
    this.hair = new InstancedMesh(new BoxGeometry(0.26, 0.08, 0.26), lambert(), n);
    const c = new Color();
    this.seats.forEach((seat, i) => {
      this.bodies.setColorAt(i, c.set(SHIRTS[Math.floor(rand() * SHIRTS.length)]));
      this.heads.setColorAt(i, c.set(SKIN[Math.floor(rand() * SKIN.length)]));
      this.hair.setColorAt(i, c.set(HAIR[Math.floor(rand() * HAIR.length)]));
    });
    for (const mesh of [this.bodies, this.heads, this.hair]) {
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
    this.hype = 0;
    this.dummy = new Object3D();
    this.rand = rand;
  }

  // Take a fan out of the instanced crowd so a hand-built one can sit in
  // their place: the seat behind the hoop in this row nearest to x.
  claimSeat(x, row) {
    const y = (row + 1) * ROW_RISE;
    let best = null;
    for (const seat of this.seats) {
      if (seat.facing !== 0 || Math.abs(seat.y - y) > 0.01) continue;
      if (!best || Math.abs(seat.x - x) < Math.abs(best.x - x)) best = seat;
    }
    best.hidden = true;
    return best;
  }

  // How far a fan is off their seat right now: a little idle sway, plus a
  // hop when the crowd is hyped.
  lift(seat, time) {
    const idle = Math.sin(time * 2 + seat.phase) * 0.015;
    const t = Math.max(0, this.cheerTime - seat.delay);
    const hop = this.hype > 0 ? Math.abs(Math.sin(t * 9 * seat.jump)) * 0.28 * Math.min(1, this.hype) : 0;
    return idle + hop;
  }

  cheer(amount) {
    this.hype = Math.min(1.5, Math.max(this.hype, amount));
    for (const seat of this.seats) seat.delay = this.rand() * 0.35;
    this.cheerTime = 0;
  }

  update(dt, time) {
    this.hype = Math.max(0, this.hype - dt * 0.45);
    this.cheerTime = (this.cheerTime ?? 10) + dt;
    const d = this.dummy;
    this.seats.forEach((seat, i) => {
      const lift = this.lift(seat, time);
      d.rotation.set(0, seat.facing, 0);
      d.scale.setScalar(seat.hidden ? 0 : 1);
      d.position.set(seat.x, seat.y + 0.28 + lift, seat.z);
      d.updateMatrix();
      this.bodies.setMatrixAt(i, d.matrix);
      d.position.y = seat.y + 0.69 + lift * 1.1;
      d.updateMatrix();
      this.heads.setMatrixAt(i, d.matrix);
      d.position.y = seat.y + 0.85 + lift * 1.1;
      d.updateMatrix();
      this.hair.setMatrixAt(i, d.matrix);
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    this.hair.instanceMatrix.needsUpdate = true;
  }
}

export function buildArena(scene) {
  scene.background = new Color(PALETTE.navy);
  scene.fog = new Fog(PALETTE.navy, 18, 34);
  buildLights(scene);
  buildFloor(scene);
  buildWalls(scene);
  buildStands(scene);
  const scoreboard = buildScoreboard(scene);
  const crowd = new Crowd(scene);
  return { scoreboard, crowd };
}
