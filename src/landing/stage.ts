import * as THREE from 'three';
import { buildModels, type ModelKey, type StageModel } from './models';

const ACCENT = 0xb3e04a;
const WIRE = 0x8f9bd0;

/** A thin horizontal scan line that sweeps the stage each time the active section changes. */
class ScanLine {
  private readonly mat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  private readonly mesh: THREE.Mesh;
  private life = 0;
  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 0.012), this.mat);
    this.mesh.visible = false;
    this.mesh.position.z = 0.6;
    scene.add(this.mesh);
  }
  fire(): void { this.life = 1; }
  update(dt: number): void {
    if (this.life <= 0) { this.mesh.visible = false; return; }
    this.life = Math.max(0, this.life - dt * 0.9);
    const p = 1 - this.life;
    this.mesh.visible = true;
    this.mesh.position.y = -2.8 + p * 5.6;
    this.mat.opacity = Math.sin(Math.PI * p) * 0.6;
  }
}

/**
 * Starts the full-page stage. Returns false if WebGL is unavailable, so the page
 * still works as a normal layout.
 */
export function startStage(canvas: HTMLCanvasElement, sections: HTMLElement[], reduced: boolean): boolean {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return false;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b0d06, 14, 28);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 60);

  const specs = buildModels();
  const keys = Object.keys(specs) as ModelKey[];
  const models = {} as Record<ModelKey, StageModel>;
  for (const key of keys) {
    const spec = specs[key];
    spec.group.visible = false;
    spec.group.scale.setScalar(0.001);
    scene.add(spec.group);
    models[key] = { ...spec, key, s: 0 };
  }

  const scan = new ScanLine(scene);

  // live reticle: a crosshair that tracks the pointer on the plane in front of the models
  const reticle = new THREE.Group();
  reticle.add(new THREE.Mesh(new THREE.RingGeometry(0.1, 0.108, 48), new THREE.MeshBasicMaterial({ color: WIRE, transparent: true, opacity: 0.8, side: THREE.DoubleSide })));
  reticle.add(new THREE.Mesh(new THREE.CircleGeometry(0.016, 16), new THREE.MeshBasicMaterial({ color: ACCENT })));
  reticle.visible = false;
  scene.add(reticle);
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

  const camPos = new THREE.Vector3(0, 0.4, 10.2);
  const camLook = new THREE.Vector3(0, 0, 0);
  let current: ModelKey = 'core';
  let warping = 0;
  // the page fires this before navigating into the planner: the camera pulls in
  window.addEventListener('rs:warp', () => { if (!reduced) warping = 1; });

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
    if (want !== current) {
      current = want;
      scan.fire();
    }

    const wide = window.innerWidth > 900;
    for (const key of keys) {
      const m = models[key];
      const target = key === current ? 1 : 0;
      m.s += (target - m.s) * (1 - Math.exp(-dt * 3.2));
      const shown = m.s > 0.004;
      m.group.visible = shown;
      if (!shown) continue;
      m.group.scale.setScalar(Math.max(0.001, m.s * m.fit));
      const [ox, oy, oz] = m.offset;
      m.group.position.set((wide ? ox : 0) + pointer.nx * 0.25, oy - pointer.ny * 0.2 + (1 - m.s) * 0.5, oz);
      for (const fn of m.anim) fn(t);
    }

    // camera glides to the active model's viewpoint; pointer adds a small parallax
    const active = models[current];
    const k = 1 - Math.exp(-dt * 2.0);
    const [px, py, pz] = active.camPos;
    const [lx, ly, lz] = active.camLook;
    camPos.lerp(new THREE.Vector3(px + pointer.nx * 0.5, py - pointer.ny * 0.3, pz), k);
    camLook.lerp(new THREE.Vector3(lx, ly, lz), k);
    if (warping > 0) {
      warping = Math.max(0, warping - dt);
      camPos.z -= dt * 6;
    }
    cam.position.copy(camPos);
    cam.lookAt(camLook);

    scan.update(dt);

    reticle.visible = pointer.inside;
    if (pointer.inside) {
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((pointer.x - rect.left) / rect.width) * 2 - 1, -((pointer.y - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      if (ray.ray.intersectPlane(plane, hit)) reticle.position.lerp(hit, 1 - Math.exp(-dt * 16));
    }
    reticle.lookAt(cam.position);

    renderer.render(scene, cam);
  }
  requestAnimationFrame(frame);
  return true;
}
