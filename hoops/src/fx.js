import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  TorusGeometry,
  Vector3,
} from 'three';

const dummy = new Object3D();
const color = new Color();

// Pooled cube particles: confetti on makes, sparks behind a ball on fire.
export class Particles {
  constructor(scene, capacity = 400) {
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.items = [];
    this.capacity = capacity;
    // Seed instanceColor so setColorAt has a buffer to write into.
    this.mesh.setColorAt(0, color.set('#ffffff'));
    scene.add(this.mesh);
  }

  spawn(pos, vel, { size = 0.06, life = 1, colour = '#ffffff', gravity = 9.8, drag = 1.5, spin = 8 } = {}) {
    if (this.items.length >= this.capacity) this.items.shift();
    this.items.push({
      pos: pos.clone(),
      vel: vel.clone(),
      rot: new Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new Vector3((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin),
      size,
      life,
      age: 0,
      colour,
      gravity,
      drag,
    });
  }

  confetti(pos, colours, count = 60) {
    const vel = new Vector3();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 3;
      vel.set(Math.cos(a) * s, 2.5 + Math.random() * 3.5, Math.sin(a) * s + 1);
      this.spawn(pos, vel, {
        size: 0.05 + Math.random() * 0.04,
        life: 1.2 + Math.random() * 0.8,
        colour: colours[i % colours.length],
        gravity: 6,
        drag: 2.2,
      });
    }
  }

  update(dt) {
    let n = 0;
    this.items = this.items.filter((p) => (p.age += dt) < p.life);
    for (const p of this.items) {
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.02) {
        p.pos.y = 0.02;
        p.vel.set(0, 0, 0);
        p.spin.set(0, 0, 0);
      }
      p.rot.addScaledVector(p.spin, dt);
      const fade = 1 - Math.max(0, (p.age - p.life * 0.7) / (p.life * 0.3));
      dummy.position.copy(p.pos);
      dummy.rotation.set(p.rot.x, p.rot.y, p.rot.z);
      dummy.scale.setScalar(p.size * fade);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(n, dummy.matrix);
      this.mesh.setColorAt(n, color.set(p.colour));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// A dotted preview of the whole throw, with a ring where the ball arrives:
// flat where it drops through rim height or lands, upright on the glass.
export class AimDots {
  constructor(scene, count = 64) {
    const cream = new MeshBasicMaterial({ color: '#f4ecd6' });
    this.mesh = new InstancedMesh(new BoxGeometry(0.05, 0.05, 0.05), cream, count);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.count = count;
    // Amber so the landing ring stands out against the white net and glass.
    this.marker = new Mesh(new TorusGeometry(0.12, 0.022, 4, 20), new MeshBasicMaterial({ color: '#ffc23d' }));
    this.marker.visible = false;
    scene.add(this.mesh, this.marker);
  }

  show({ points, end }) {
    const n = Math.min(points.length, this.count);
    for (let i = 0; i < n; i++) {
      dummy.position.copy(points[i]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = true;
    this.marker.position.copy(end.at);
    this.marker.rotation.set(end.surface === 'board' ? 0 : Math.PI / 2, 0, 0);
    this.marker.visible = true;
  }

  hide() {
    this.mesh.visible = false;
    this.marker.visible = false;
  }
}
