import * as THREE from 'three';
import { buildModels, type ModelKey, type StageModel } from './models';

const lime = 0xb3e04a, peach = 0xf0a06a, mint = 0x46c489;

/** Soft round texture for halos and the live cursor glow. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Particle burst that fires when the active model changes. */
class Burst {
  private readonly pos = new Float32Array(240 * 3);
  private readonly vel = new Float32Array(240 * 3);
  private readonly geo = new THREE.BufferGeometry();
  private readonly mat = new THREE.PointsMaterial({ color: lime, size: 0.07, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  private life = 0;
  constructor(scene: THREE.Scene) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    scene.add(new THREE.Points(this.geo, this.mat));
  }
  fire(color: number): void {
    this.mat.color.setHex(color);
    for (let i = 0; i < 240; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const speed = 1.5 + Math.random() * 3.5;
      this.pos[i * 3] = 0; this.pos[i * 3 + 1] = 0; this.pos[i * 3 + 2] = 0;
      this.vel[i * 3] = Math.cos(th) * s * speed;
      this.vel[i * 3 + 1] = u * speed;
      this.vel[i * 3 + 2] = Math.sin(th) * s * speed;
    }
    this.life = 1;
  }
  update(dt: number): void {
    if (this.life <= 0) { this.mat.opacity = 0; return; }
    this.life = Math.max(0, this.life - dt * 0.9);
    const drag = Math.max(0, 1 - dt * 2.2);
    for (let i = 0; i < this.pos.length; i++) {
      this.vel[i] = (this.vel[i] ?? 0) * drag;
      this.pos[i] = (this.pos[i] ?? 0) + (this.vel[i] ?? 0) * dt;
    }
    this.mat.opacity = this.life;
    this.geo.getAttribute('position').needsUpdate = true;
  }
}

/** Ring that expands out from the centre on each change, like a shockwave. */
class Shock {
  private readonly mat = new THREE.MeshBasicMaterial({ color: lime, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  private readonly mesh = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 96), this.mat);
  private life = 0;
  constructor(scene: THREE.Scene) {
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  fire(color: number): void { this.mat.color.setHex(color); this.life = 1; }
  update(dt: number, camera: THREE.Camera): void {
    if (this.life <= 0) { this.mesh.visible = false; return; }
    this.life = Math.max(0, this.life - dt * 1.25);
    this.mesh.visible = true;
    this.mesh.quaternion.copy(camera.quaternion);
    this.mesh.scale.setScalar((1 - this.life) * 7 + 0.2);
    this.mat.opacity = this.life * 0.8;
  }
}

/**
 * Starts the full-page 3D stage. Returns null if WebGL is unavailable, so the
 * page still works as a normal layout.
 */
export function startStage(canvas: HTMLCanvasElement, sections: HTMLElement[], reduced: boolean): boolean {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return false;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b0d06, 12, 26);
  const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 60);

  scene.add(new THREE.HemisphereLight(0xf1ffd4, 0x111508, 1.2));
  const key = new THREE.DirectionalLight(0xfff6e0, 2.4);
  key.position.set(-4, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 22 });
  scene.add(key);
  const rim = new THREE.PointLight(mint, 6, 16, 1.5);
  rim.position.set(4, -1, 3);
  scene.add(rim);
  const warm = new THREE.PointLight(peach, 4, 12, 1.5);
  warm.position.set(-3, 1.5, 2);
  scene.add(warm);

  const glow = glowTexture();
  const specs = buildModels(glow);
  const keys = Object.keys(specs) as ModelKey[];
  const models = {} as Record<ModelKey, StageModel>;
  for (const key of keys) {
    const spec = specs[key];
    spec.group.visible = false;
    spec.group.scale.setScalar(0.001);
    scene.add(spec.group);
    models[key] = { ...spec, key, s: 0 };
  }

  const burst = new Burst(scene);
  const shock = new Shock(scene);

  // live cursor: a small glowing orb that follows the pointer across the 3D space
  const cursor = new THREE.Group();
  cursor.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: lime })));
  const cursorHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: lime, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
  cursorHalo.scale.setScalar(0.8);
  cursor.add(cursorHalo);
  scene.add(cursor);
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const ray = new THREE.Raycaster();
  const hit = new THREE.Vector3();
  const pointer = { x: 0, y: 0, nx: 0, ny: 0, inside: false };

  function resize(): void {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.nx = e.clientX / window.innerWidth - 0.5;
    pointer.ny = e.clientY / window.innerHeight - 0.5;
    pointer.inside = true;
  }, { passive: true });
  document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) pointer.inside = false; });

  /** The model for the section that crosses the middle of the viewport. */
  function activeKey(): ModelKey {
    const mid = window.innerHeight * 0.5;
    let best: ModelKey = 'core';
    let bestDist = Infinity;
    for (const s of sections) {
      const key = s.dataset.model as ModelKey | undefined;
      if (!key || !(key in models)) continue;
      const rect = s.getBoundingClientRect();
      if (rect.top <= mid && rect.bottom >= mid) return key;
      const d = Math.min(Math.abs(rect.top - mid), Math.abs(rect.bottom - mid));
      if (d < bestDist) { bestDist = d; best = key; }
    }
    return best;
  }

  let current: ModelKey = 'core';
  let shake = 0;
  const camPos = new THREE.Vector3(0, 0.6, 9.4);
  const camLook = new THREE.Vector3(0, 0, 0);
  let warping = 0;
  // the page fires this before navigating into the planner: the camera dives in
  window.addEventListener('rs:warp', () => { if (!reduced) warping = 1; });

  function switchTo(next: ModelKey): void {
    const color = next === 'room' || next === 'door' ? peach : lime;
    burst.fire(color);
    shock.fire(color);
    shake = 0.35;
    current = next;
  }

  const t0 = performance.now();
  let last = t0;
  let visible = true;
  const io = new IntersectionObserver((entries) => { visible = entries[0]?.isIntersecting ?? true; });
  io.observe(canvas);

  function frame(now: number): void {
    requestAnimationFrame(frame);
    if (!visible) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = reduced ? 0 : (now - t0) / 1000;

    const want = activeKey();
    if (want !== current) switchTo(want);

    const wide = window.innerWidth > 900;
    for (const key of keys) {
      const m = models[key];
      const target = key === current ? 1 : 0;
      // ease in with a small overshoot when a model becomes active
      m.s += (target - m.s) * (1 - Math.exp(-dt * (target ? 4.2 : 5.5)));
      const visibleNow = m.s > 0.004;
      m.group.visible = visibleNow;
      if (!visibleNow) continue;
      const k = Math.max(0.001, m.s * m.fit);
      m.group.scale.setScalar(k);
      const [ox, oy, oz] = m.offset;
      m.group.position.set((wide ? ox : 0) + pointer.nx * 0.3, oy - pointer.ny * 0.2 + (1 - m.s) * 0.6, oz);
      m.group.rotation.y = (reduced ? 0 : Math.sin(t * 0.2) * 0.15) + pointer.nx * 0.2;
      for (const fn of m.anim) fn(t);
    }

    // camera: glide toward the active model's viewpoint, with a short shake on each change
    const active = models[current];
    const [px, py, pz] = active.camPos;
    const [lx, ly, lz] = active.camLook;
    const k = 1 - Math.exp(-dt * 2.2);
    camPos.lerp(new THREE.Vector3(px + pointer.nx * 0.6, py - pointer.ny * 0.4, pz), k);
    camLook.lerp(new THREE.Vector3(lx, ly, lz), k);
    shake = Math.max(0, shake - dt * 1.8);
    const jitter = reduced ? 0 : shake * 0.05;
    cam.position.set(camPos.x + Math.sin(t * 23) * jitter, camPos.y + Math.cos(t * 19) * jitter, camPos.z);
    cam.lookAt(camLook);

    burst.update(dt);
    shock.update(dt, cam);

    // live cursor: project the pointer onto the z = 0 plane in front of the models
    if (pointer.inside) {
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((pointer.x - rect.left) / rect.width) * 2 - 1, -((pointer.y - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      if (ray.ray.intersectPlane(plane, hit)) cursor.position.lerp(hit, 1 - Math.exp(-dt * 14));
    }
    cursor.scale.setScalar(1 + Math.sin(t * 4) * 0.08);

    if (warping > 0) {
      warping = Math.max(0, warping - dt);
      const z = 9.4 - (1 - warping) * 6;
      cam.position.z = z;
    }

    renderer.render(scene, cam);
  }
  requestAnimationFrame(frame);
  return true;
}
