import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildModels, type ModelKey, type Spec } from '../landing/models';

/* Standalone 3D viewer for the RescueSphere section models. Shares the model code with the landing page. */

interface Entry { key: ModelKey; name: string; note: string; about: string }
const ENTRIES: Entry[] = [
  { key: 'core', name: 'Hero · Room overview', note: 'Wireframe room with a scan plane and the route to the exit.', about: 'The scan plane sweeps the room height while the route stays fixed to the floor, showing how the plan covers the whole space.' },
  { key: 'door', name: 'How it works · Floor plan', note: 'Route drawn step by step, four markers for the four steps.', about: 'The route draws from the bed toward the exit. Each marker lights when the route passes it, matching the four steps on the page.' },
  { key: 'room', name: 'Room · Furnished layout', note: 'Furniture as a CAD drawing; the exit door is lit.', about: 'A furnished room drawn as edges. The exit door stays lit so it is easy to find on the plan.' },
  { key: 'cubes', name: 'Benefits · Dashboard panels', note: 'Four panels with live bars, matching the card grid.', about: 'Each panel shows a live level meter. The panel edge brightens in turn, like a monitoring dashboard.' },
  { key: 'knot', name: 'Problems · Blocked route', note: 'Corridor with a blocked route and a detour.', about: 'The direct route is blocked (amber). The detour (lime) shows the alternative path that avoids the obstacle.' },
  { key: 'rings', name: 'FAQ · Accordion rows', note: 'Rows open in turn, like the accordion.', about: 'The active row expands and the others close. This mirrors how the FAQ opens one answer at a time.' },
  { key: 'path', name: 'Roadmap · Timeline', note: 'Three milestones with a pulse reaching each.', about: 'A pulse travels the timeline. Each milestone lights as the pulse reaches it: now, next, later.' },
  { key: 'blocks', name: 'Footer · Ground grid', note: 'Perspective grid with a scan sweep.', about: 'A ground grid with a sweep line moving across it. A quiet closing graphic for the page.' }
];

type Preset = 'iso' | 'top' | 'front' | 'side';
const PRESET_DIR: Record<Preset, THREE.Vector3> = {
  iso: new THREE.Vector3(1, 0.8, 1).normalize(),
  top: new THREE.Vector3(0, 1, 0.0001).normalize(),
  front: new THREE.Vector3(0, 0.15, 1).normalize(),
  side: new THREE.Vector3(1, 0.15, 0).normalize()
};
const PRESET_LABEL: Record<Preset, string> = { iso: 'Isometric', top: 'Top', front: 'Front', side: 'Side' };

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
}

function main(): void {
  const canvas = el<HTMLCanvasElement>('vw-canvas');
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch {
    el('vw-fallback').hidden = false;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x0a0d12, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 200);
  camera.position.set(6, 5, 7);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.5;
  controls.maxDistance = 60;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x0a0d12, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(4, 8, 5);
  scene.add(sun);

  const grid = new THREE.GridHelper(20, 40, 0x2a3350, 0x161c2e);
  scene.add(grid);
  const axes = new THREE.AxesHelper(1.4);
  axes.visible = false;
  scene.add(axes);

  // every model lives in the scene; only the selected one is visible
  const specs = buildModels();
  const keys = ENTRIES.map((e) => e.key);
  for (const k of keys) {
    const s: Spec | undefined = specs[k];
    if (!s) continue;
    s.assemble(1);
    s.group.visible = false;
    scene.add(s.group);
  }

  let current: ModelKey = 'core';
  let playing = true;
  let speed = 1;
  let clock = 0;
  let fillValue = 1;
  let tween: { start: number; dur: number; fromP: THREE.Vector3; toP: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3 } | null = null;
  let preset: Preset = 'iso';
  const baseOpacity = new WeakMap<THREE.Material, number>();

  /* fill: scales the faint face fills of the models, leaving the edges crisp */
  function applyFill(): void {
    for (const k of keys) {
      const s = specs[k];
      if (!s) continue;
      s.group.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || o instanceof THREE.LineSegments) return;
        const m = o.material;
        if (!(m instanceof THREE.MeshBasicMaterial) || !m.transparent) return;
        if (!baseOpacity.has(m)) baseOpacity.set(m, m.opacity);
        m.opacity = (baseOpacity.get(m) ?? m.opacity) * fillValue;
      });
    }
  }

  function frameTo(p: Preset, box: THREE.Box3, animate: boolean): void {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 0.5) / 2;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const dist = (radius / Math.sin(fov / 2)) * 1.15;
    const toP = center.clone().add(PRESET_DIR[p].clone().multiplyScalar(dist));
    if (!animate) {
      camera.position.copy(toP);
      controls.target.copy(center);
      tween = null;
    } else {
      tween = { start: performance.now(), dur: 650, fromP: camera.position.clone(), toP, fromT: controls.target.clone(), toT: center };
    }
  }

  function setPresetButtons(p: Preset): void {
    preset = p;
    document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.preset === p));
    });
    el('vw-view').textContent = PRESET_LABEL[p];
  }

  function boundsOf(key: ModelKey): THREE.Box3 {
    const s = specs[key];
    if (!s) return new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    s.group.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(s.group);
  }

  function countOf(key: ModelKey): { meshes: number; lines: number } {
    let meshes = 0, lines = 0;
    specs[key]?.group.traverse((o) => {
      if (o instanceof THREE.LineSegments || o instanceof THREE.Line) lines++;
      else if (o instanceof THREE.Mesh) meshes++;
    });
    return { meshes, lines };
  }

  function show(key: ModelKey): void {
    current = key;
    for (const k of keys) {
      const s = specs[k];
      if (s) s.group.visible = k === key;
    }
    const entry = ENTRIES.find((e) => e.key === key);
    if (entry) {
      el('vw-name').textContent = entry.name;
      el('vw-note').textContent = entry.note;
      el('vw-about').textContent = entry.about;
    }
    document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.key === key));
    });
    const box = boundsOf(key);
    const size = box.getSize(new THREE.Vector3());
    el('vw-size').textContent = `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)}`;
    const c = countOf(key);
    el('vw-meshes').textContent = String(c.meshes);
    el('vw-lines').textContent = String(c.lines);
    grid.position.y = box.min.y - 0.01;
    frameTo(preset, box, true);
  }

  /* build the model list */
  const list = el('vw-models');
  ENTRIES.forEach((e, i) => {
    const b = document.createElement('button');
    b.className = 'vw-model';
    b.dataset.key = e.key;
    b.setAttribute('aria-pressed', String(e.key === current));
    b.innerHTML = `<i>${String(i + 1).padStart(2, '0')}</i><b>${e.name}</b><small>${e.note}</small>`;
    b.addEventListener('click', () => show(e.key));
    list.appendChild(b);
  });

  document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => {
    b.addEventListener('click', () => {
      const p = b.dataset.preset as Preset | undefined;
      if (!p) return;
      setPresetButtons(p);
      frameTo(p, boundsOf(current), true);
    });
  });
  el('vw-fit').addEventListener('click', () => frameTo(preset, boundsOf(current), true));
  el<HTMLInputElement>('vw-anim').addEventListener('change', (e) => { playing = (e.target as HTMLInputElement).checked; });
  el<HTMLInputElement>('vw-grid').addEventListener('change', (e) => { grid.visible = (e.target as HTMLInputElement).checked; });
  el<HTMLInputElement>('vw-axes').addEventListener('change', (e) => { axes.visible = (e.target as HTMLInputElement).checked; });
  el<HTMLInputElement>('vw-fill').addEventListener('input', (e) => {
    fillValue = Number((e.target as HTMLInputElement).value) / 100;
    el('vw-fill-out').textContent = `${Math.round(fillValue * 100)}%`;
    applyFill();
  });
  el<HTMLInputElement>('vw-speed').addEventListener('input', (e) => {
    speed = Number((e.target as HTMLInputElement).value) / 100;
    el('vw-speed-out').textContent = `${speed.toFixed(1)}×`;
  });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type !== 'checkbox') return;
    const n = Number(e.key);
    if (n >= 1 && n <= keys.length) { const k = keys[n - 1]; if (k) show(k); return; }
    if (e.key === 'f' || e.key === 'F') frameTo(preset, boundsOf(current), true);
    if (e.key === 'g' || e.key === 'G') { grid.visible = !grid.visible; el<HTMLInputElement>('vw-grid').checked = grid.visible; }
    if (e.code === 'Space') {
      e.preventDefault();
      playing = !playing;
      el<HTMLInputElement>('vw-anim').checked = playing;
    }
  });

  function resize(): void {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  show(current);
  setPresetButtons('iso');
  applyFill();

  let last = performance.now();
  function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (playing) clock += dt * speed;
    const s = specs[current];
    if (s) for (const fn of s.anim) fn(clock);

    if (tween) {
      const u = Math.min(1, (now - tween.start) / tween.dur);
      const e = 1 - Math.pow(1 - u, 3);
      camera.position.lerpVectors(tween.fromP, tween.toP, e);
      controls.target.lerpVectors(tween.fromT, tween.toT, e);
      if (u >= 1) tween = null;
    }
    controls.update();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

main();
