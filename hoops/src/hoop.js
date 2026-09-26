import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  TorusGeometry,
} from 'three';
import { BOARD, NET, POLE, RIM } from './config.js';
import { boardTexture, PALETTE } from './textures.js';

const STRANDS = 10;
const RINGS = 5;

// A diamond-mesh net. Each knot is a damped spring pinned to its rest spot;
// balls shove knots out of the way and the springs pull them back.
class Net {
  constructor() {
    const count = STRANDS * RINGS;
    this.rest = new Float32Array(count * 3);
    this.offset = new Float32Array(count * 3);
    this.velocity = new Float32Array(count * 3);
    for (let ring = 0; ring < RINGS; ring++) {
      const t = ring / (RINGS - 1);
      const radius = RIM.radius + (NET.bottomRadius - RIM.radius) * t;
      const y = RIM.y - NET.depth * t;
      for (let i = 0; i < STRANDS; i++) {
        const a = ((i + (ring % 2) * 0.5) / STRANDS) * Math.PI * 2;
        const k = (ring * STRANDS + i) * 3;
        this.rest[k] = Math.cos(a) * radius;
        this.rest[k + 1] = y;
        this.rest[k + 2] = Math.sin(a) * radius;
      }
    }

    const pairs = [];
    for (let ring = 0; ring < RINGS - 1; ring++) {
      for (let i = 0; i < STRANDS; i++) {
        const next = ring % 2 === 0 ? (i + STRANDS - 1) % STRANDS : (i + 1) % STRANDS;
        pairs.push(ring * STRANDS + i, (ring + 1) * STRANDS + i);
        pairs.push(ring * STRANDS + i, (ring + 1) * STRANDS + next);
      }
    }
    this.pairs = pairs;
    this.positions = new Float32Array(pairs.length * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.mesh = new LineSegments(geometry, new LineBasicMaterial({ color: PALETTE.line }));
    this.mesh.frustumCulled = false;
    this.write();
  }

  update(dt, balls, hoopX) {
    const { rest, offset, velocity } = this;
    const stiffness = 160;
    const damping = 9;
    for (let k = STRANDS * 3; k < rest.length; k += 3) {
      for (let a = 0; a < 3; a++) {
        velocity[k + a] += (-stiffness * offset[k + a] - damping * velocity[k + a]) * dt;
        offset[k + a] += velocity[k + a] * dt;
      }
    }

    for (const ball of balls) {
      const bx = ball.pos.x - hoopX;
      const by = ball.pos.y;
      const bz = ball.pos.z;
      if (Math.abs(by - (RIM.y - NET.depth / 2)) > 0.6 || bx * bx + bz * bz > 0.8) continue;
      const reach = ball.radius + 0.015;
      for (let k = STRANDS * 3; k < rest.length; k += 3) {
        const px = rest[k] + offset[k];
        const py = rest[k + 1] + offset[k + 1];
        const pz = rest[k + 2] + offset[k + 2];
        const dx = px - bx;
        const dy = py - by;
        const dz = pz - bz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= reach * reach || d2 < 1e-10) continue;
        const d = Math.sqrt(d2);
        const push = (reach - d) / d;
        offset[k] += dx * push;
        offset[k + 1] += dy * push;
        offset[k + 2] += dz * push;
        // Let the knot carry some of the ball's motion so the net whips.
        velocity[k] += ball.vel.x * 0.35;
        velocity[k + 1] += ball.vel.y * 0.35;
        velocity[k + 2] += ball.vel.z * 0.35;
      }
    }
    this.write();
  }

  write() {
    const { rest, offset, pairs, positions } = this;
    for (let p = 0; p < pairs.length; p++) {
      const k = pairs[p] * 3;
      positions[p * 3] = rest[k] + offset[k];
      positions[p * 3 + 1] = rest[k + 1] + offset[k + 1];
      positions[p * 3 + 2] = rest[k + 2] + offset[k + 2];
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}

// Backboard, rim, net and stanchion in one group that can slide along x.
export function buildHoop() {
  const group = new Group();
  const steel = new MeshLambertMaterial({ color: '#2b3040' });
  const frame = new MeshLambertMaterial({ color: '#c9d3da' });
  const face = new MeshLambertMaterial({ map: boardTexture() });
  const rimMat = new MeshLambertMaterial({ color: PALETTE.rim, emissive: '#5a1206' });
  const pad = new MeshLambertMaterial({ color: PALETTE.teal });

  const add = (mesh, x, y, z, shadow = true) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    group.add(mesh);
    return mesh;
  };

  add(
    new Mesh(new BoxGeometry(BOARD.width, BOARD.height, BOARD.thickness), [frame, frame, frame, frame, face, frame]),
    0,
    BOARD.bottom + BOARD.height / 2,
    BOARD.front - BOARD.thickness / 2,
  );

  const rim = add(new Mesh(new TorusGeometry(RIM.radius, 0.026, 6, 28), rimMat), 0, RIM.y, 0);
  rim.rotation.x = Math.PI / 2;
  const bracketLength = -BOARD.front - RIM.radius;
  add(new Mesh(new BoxGeometry(0.16, 0.05, bracketLength + 0.02), rimMat), 0, RIM.y - 0.01, BOARD.front + bracketLength / 2);

  // Arm from the back of the board to the pole.
  const armStart = BOARD.front - BOARD.thickness;
  const armLength = armStart - POLE.z;
  add(new Mesh(new BoxGeometry(0.14, 0.14, armLength), steel), 0, 3.35, POLE.z + armLength / 2);
  add(new Mesh(new BoxGeometry(0.5, 0.5, 0.1), steel), 0, 3.4, armStart - 0.05);

  add(new Mesh(new CylinderGeometry(POLE.radius, POLE.radius, POLE.height, 8), steel), 0, POLE.height / 2, POLE.z);
  add(new Mesh(new CylinderGeometry(0.22, 0.22, 1.9, 8), pad), 0, 0.95, POLE.z);
  add(new Mesh(new BoxGeometry(1.1, 0.35, 1.3), pad), 0, 0.175, POLE.z - 0.2);

  const net = new Net();
  group.add(net.mesh);

  return { group, net };
}
