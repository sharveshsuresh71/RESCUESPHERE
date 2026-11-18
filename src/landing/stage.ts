import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildModels, type ModelKey, type Spec } from './models';

const ACCENT = 0xb3e04a;
const WIRE = 0x8f9bd0;

interface Entry {
  key: ModelKey;
  spec: Spec;
  /** holds the model; rotation comes from dragging, position from the section layout */
  pivot: THREE.Group;
  /** 0 = away, 1 = active; eases between them so the model assembles or disassembles */
  a: number;
}

/** A thin lime line that sweeps the stage on each section change. */
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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  // a neutral studio environment gives the materials real reflections
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.fog = new THREE.Fog(0x0b0d06, 16, 30);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 60);

  scene.add(new THREE.HemisphereLight(0xf1ffd4, 0x111508, 0.5));
  const key = new THREE.DirectionalLight(0xfff4e6, 1.8);
  key.position.set(-4, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 24 });
  key.shadow.bias = -0.0008;
  scene.add(key);

  const specs = buildModels();
  const keys = Object.keys(specs) as ModelKey[];
  const entries = {} as Record<ModelKey, Entry>;
  for (const k of keys) {
    const spec = specs[k];
    const pivot = new THREE.Group();
    pivot.add(spec.group);
    pivot.visible = false;
    scene.add(pivot);
    entries[k] = { key: k, spec, pivot, a: 0 };
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

  // drag the active model to turn it; it springs back to rest when released
  const drag = { x: 0, y: 0, active: false, lx: 0, ly: 0 };
  const INTERACTIVE = 'a,button,input,label,textarea,select,p,h1,h2,h3,h4,li,summary,form,.accordion,.card,.cta,.tilt';

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
    if (drag.active && !reduced) {
      drag.y = Math.min(1.2, Math.max(-1.2, drag.y + (e.clientX - drag.lx) * 0.006));
      drag.x = Math.min(0.6, Math.max(-0.6, drag.x + (e.clientY - drag.ly) * 0.004));
      drag.lx = e.clientX;
      drag.ly = e.clientY;
    }
  }, { passive: true });
  window.addEventListener('pointerdown', (e) => {
    if (reduced) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest(INTERACTIVE)) return;
    drag.active = true;
    drag.lx = e.clientX;
    drag.ly = e.clientY;
  });
  window.addEventListener('pointerup', () => { drag.active = false; });
  document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) pointer.inside = false; });

  /** The model for the section that crosses the middle of the viewport. */
  function activeKey(): ModelKey {
    const mid = window.innerHeight * 0.5;
    let best: ModelKey = 'core';
    let bestDist = Infinity;
    for (const s of sections) {
      const key = s.dataset.model as ModelKey | undefined;
      if (!key || !(key in entries)) continue;
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

    // drag settles back to rest when released
    if (!drag.active) {
      const k = Math.exp(-dt * 2.4);
      drag.x *= k;
      drag.y *= k;
    }

    const wide = window.innerWidth > 900;
    for (const key of keys) {
      const e = entries[key];
      const target = key === current ? 1 : 0;
      // assemble in on activation, scatter out when leaving
      e.a += (target - e.a) * (1 - Math.exp(-dt * (target ? 2.6 : 3.6)));
      const shown = e.a > 0.002;
      e.pivot.visible = shown;
      if (!shown) continue;
      e.spec.assemble(e.a);
      const [ox, oy, oz] = e.spec.offset;
      e.pivot.position.set((wide ? ox : 0) + pointer.nx * 0.2, oy - pointer.ny * 0.15 + (1 - e.a) * 0.4, oz);
      e.pivot.scale.setScalar(Math.max(0.001, e.spec.fit * (0.94 + 0.06 * e.a)));
      e.pivot.rotation.set(drag.x, drag.y, 0);
      for (const fn of e.spec.anim) fn(t);
    }

    // camera glides to the active model's viewpoint; pointer adds a small parallax
    const active = entries[current].spec;
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
