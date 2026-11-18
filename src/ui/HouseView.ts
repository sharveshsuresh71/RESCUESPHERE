import * as THREE from 'three';
import { buildCore } from '../landing/models';

/*
 * A 3D house for the Exit Mapping screen. It turns slowly on its own, can be dragged, and opens up
 * (roof lifts, floors separate) while the mouse is over it or after a tap. The escape route stays lit.
 * The render loop stops by itself once the view has been removed from the page.
 */
export function mountHouse(host: HTMLElement): void {
  const canvas = document.createElement('canvas');
  canvas.className = 'house-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '3D house: hover or tap to open it and see the escape route');
  host.append(canvas);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    host.textContent = '3D view is not available in this browser.';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-4, 8, 6);
  sun.castShadow = true;
  scene.add(sun);

  const spec = buildCore();
  spec.assemble(1);
  const pivot = new THREE.Group();
  pivot.add(spec.group);
  pivot.scale.setScalar(spec.fit);
  scene.add(pivot);

  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  cam.position.set(spec.camPos[0], spec.camPos[1], spec.camPos[2]);
  cam.lookAt(spec.camLook[0], spec.camLook[1], spec.camLook[2]);

  let hoverT = 0;
  let hover = 0;
  let tapLock = false;
  let dragging = false;
  let moved = false;
  let lastX = 0;
  let rotY = 0.6;

  canvas.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hoverT = 1; });
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !tapLock) hoverT = 0; });
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = false;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    if (Math.abs(dx) > 2) moved = true;
    rotY += dx * 0.01;
  });
  const endDrag = (): void => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('click', () => {
    if (moved) return;
    tapLock = !tapLock;
    hoverT = tapLock ? 1 : 0;
  });

  const resize = (): void => {
    const w = host.clientWidth || 600;
    const h = host.clientHeight || 340;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  const t0 = performance.now();
  let last = t0;
  const frame = (now: number): void => {
    if (!canvas.isConnected) {
      ro.disconnect();
      renderer.dispose();
      return;
    }
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = Math.max(0, (now - t0) / 1000);

    hover += (hoverT - hover) * (1 - Math.exp(-dt * 4));
    spec.explode?.(hover);
    for (const fn of spec.anim) fn(t);
    if (!dragging) rotY += dt * 0.12;
    pivot.rotation.y = rotY;
    renderer.render(scene, cam);
  };
  requestAnimationFrame(frame);
}
