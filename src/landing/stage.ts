import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildModels, type ModelKey, type Spec } from './models';

/*
 * Layout-bound 3D. Each <div class="slot" data-model="…"> reserves a rectangle in the page
 * layout. One WebGL canvas covers the viewport and renders each visible slot into its own
 * rectangle with its own scene and camera, so models never draw over text.
 *
 * Interaction, per slot:
 *   drag            turn the model
 *   shift + drag    move the model within its slot
 *   double-click    reset turn and position
 * Models assemble in when their slot scrolls into view and scatter out when it leaves.
 */

interface SlotView {
  el: HTMLElement;
  spec: Spec;
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  pivot: THREE.Group;
  rotX: number;
  rotY: number;
  panX: number;
  panY: number;
  visible: boolean;
  /** 0 = scattered, 1 = assembled; eased */
  a: number;
  drag: 'none' | 'rotate' | 'move';
  lx: number;
  ly: number;
  /** hover (mouse) or tap lock drives the optional split; hoverT is the target, hover the eased value */
  hoverT: number;
  hover: number;
  tapLock: boolean;
  moved: boolean;
  offPrev: boolean;
}

function easeOut(u: number): number { return 1 - Math.pow(1 - u, 3); }

export function startStage(canvas: HTMLCanvasElement, slotEls: HTMLElement[], reduced: boolean): boolean {
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
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const MODEL_KEYS: ModelKey[] = ['guide', 'door', 'room', 'cubes', 'knot', 'rings', 'path', 'blocks'];
  const views: SlotView[] = [];

  for (const el of slotEls) {
    const key = el.dataset.model as ModelKey | undefined;
    if (!key || !MODEL_KEYS.includes(key)) continue;
    // Build a fresh copy per slot: a three.js object can only live in one scene.
    const spec = buildModels()[key];

    const scene = new THREE.Scene();
    scene.environment = envTex;
    scene.add(new THREE.HemisphereLight(0xf1ffd4, 0x111508, 0.5));
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.8);
    sun.position.set(-4, 7, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 24 });
    sun.shadow.bias = -0.0008;
    scene.add(sun);

    const pivot = new THREE.Group();
    pivot.add(spec.group);
    scene.add(pivot);
    pivot.scale.setScalar(spec.fit);

    const view: SlotView = {
      el, spec, scene, pivot,
      cam: new THREE.PerspectiveCamera(32, 1, 0.1, 80),
      rotX: 0, rotY: 0, panX: 0, panY: 0,
      visible: false, a: 0, drag: 'none', lx: 0, ly: 0, hoverT: 0, hover: 0, tapLock: false, moved: false, offPrev: false
    };
    views.push(view);

    el.addEventListener('pointerdown', (e) => {
      if (reduced && e.shiftKey) return;
      view.drag = e.shiftKey ? 'move' : 'rotate';
      view.moved = false;
      view.lx = e.clientX;
      view.ly = e.clientY;
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');
    });
    el.addEventListener('pointermove', (e) => {
      if (view.drag === 'none') return;
      const dx = e.clientX - view.lx;
      const dy = e.clientY - view.ly;
      view.lx = e.clientX;
      view.ly = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 3) view.moved = true;
      if (view.drag === 'rotate') {
        view.rotY += dx * 0.009;
        view.rotX = Math.min(1.1, Math.max(-1.1, view.rotX + dy * 0.006));
      } else {
        view.panX = Math.min(2, Math.max(-2, view.panX + dx * 0.004));
        view.panY = Math.min(1.2, Math.max(-1.2, view.panY - dy * 0.004));
      }
    });
    const endDrag = (): void => {
      view.drag = 'none';
      el.classList.remove('is-dragging');
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('dblclick', () => {
      view.rotX = 0; view.rotY = 0; view.panX = 0; view.panY = 0;
    });

    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') view.hoverT = 1; });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !view.tapLock) view.hoverT = 0; });
    el.addEventListener('click', () => {
      if (view.moved) return;
      view.tapLock = !view.tapLock;
      view.hoverT = view.tapLock ? 1 : 0;
    });

    const io = new IntersectionObserver((entries) => {
      view.visible = entries[0]?.isIntersecting ?? false;
    }, { rootMargin: '200px 0px' });
    io.observe(el);
  }

  function resize(): void {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }
  window.addEventListener('resize', resize);
  resize();

  const t0 = performance.now();
  let last = t0;
  function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = reduced ? 0 : (now - t0) / 1000;
    const H = window.innerHeight;

    // clear the whole canvas, then draw each visible slot into its own rectangle
    renderer.setScissorTest(false);
    renderer.clear(true, true, true);
    renderer.setScissorTest(true);

    for (const v of views) {
      const reel = v.el.hasAttribute('data-reel');
      const off = v.el.closest('[data-off]') !== null;
      if (off !== v.offPrev) {
        v.offPrev = off;
        if (off) { v.hoverT = 0; v.tapLock = false; }
      }
      const want = v.visible && !off;
      // reel models: quick, clean exit and a slower entrance; other models keep their own timing
      const rate = reel ? (want ? 2.6 : 6) : (want ? 2.2 : 3.4);
      v.a += ((want ? 1 : 0) - v.a) * (1 - Math.exp(-dt * rate));
      if (v.a < 0.002) continue;
      const r = v.el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > H) continue;

      // Render a padded area around the slot so parts that drift past its edge are not cut off.
      // The view offset keeps the model at the same scale as the slot itself.
      const pad = Math.min(r.width, r.height) * 0.4;
      const pw = r.width + pad * 2, ph = r.height + pad * 2;
      const x = r.left - pad, y = H - (r.bottom + pad);
      renderer.setViewport(x, y, pw, ph);
      renderer.setScissor(x, y, pw, ph);
      v.cam.aspect = r.width / r.height;
      v.cam.setViewOffset(r.width, r.height, -pad, -pad, pw, ph);
      v.cam.updateProjectionMatrix();
      v.cam.position.set(v.spec.camPos[0], v.spec.camPos[1], v.spec.camPos[2]);
      v.cam.lookAt(v.spec.camLook[0], v.spec.camLook[1], v.spec.camLook[2]);

      const flipRad = (parseFloat(v.el.dataset.flip ?? '0') || 0) * Math.PI / 180;
      v.pivot.rotation.set(v.rotX, v.rotY + flipRad, 0);
      v.pivot.position.set(v.panX, v.panY, 0);
      v.hover += (v.hoverT - v.hover) * (1 - Math.exp(-dt * 5));
      v.spec.explode?.(v.hover);
      if (reel) {
        // scale in from 86% with no scatter, so the model reads as one clean object
        v.pivot.scale.setScalar(v.spec.fit * (0.86 + 0.14 * easeOut(v.a)));
        v.spec.assemble(1);
      } else {
        v.pivot.scale.setScalar(v.spec.fit);
        v.spec.assemble(easeOut(v.a));
      }
      if (!reduced) for (const fn of v.spec.anim) fn(t);
      renderer.render(v.scene, v.cam);
    }
    renderer.setScissorTest(false);
  }
  requestAnimationFrame(frame);
  return true;
}
