/* RescueSphere template script.
   - Hero: 3D glossy core, petal blades and orbit rings (three.js). Falls back to 2D petals.
   - Room: 3D room with a glowing escape route; scroll orbits the camera.
   - Effects: letter split reveals, scroll progress, cursor spotlight, card tilt,
     magnetic buttons, parallax headings, FAQ accordion, reveal-on-scroll, demo sign-up. */

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const HAS3D = typeof THREE !== 'undefined';

/* ---------- letter split ---------- */
function splitInto(el){
  let i = 0;
  const walk = (node) => {
    [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const ch of n.textContent) {
          const s = document.createElement('span');
          if (ch.trim() === '') { s.textContent = '\u00A0'; }
          else { s.className = 'ch'; s.style.setProperty('--i', i++); s.textContent = ch; }
          frag.appendChild(s);
        }
        n.replaceWith(frag);
      } else if (n.nodeType === 1) { walk(n); }
    });
  };
  walk(el);
  el.classList.add('split-ready');
}
document.querySelectorAll('[data-split]').forEach(el => {
  if (REDUCED) return;
  // only split headings that are not already revealed by the hero animation
  if (el.classList.contains('hero-title')) {
    el.querySelectorAll('.line').forEach(line => splitInto(line));
  } else {
    splitInto(el);
  }
});

/* ---------- hero 3D ---------- */
function heroWebGL(cv){
  let r;
  try { r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); }
  catch (e) { return false; }
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  r.outputEncoding = THREE.sRGBEncoding;

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(35, 1, .1, 60);
  cam.position.set(0, 0, 7.2);

  scene.add(new THREE.HemisphereLight(0xf4ffd0, 0x111508, .9));
  const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(-3, 4, 5); scene.add(key);
  const rim = new THREE.PointLight(0x46c489, 3, 14); rim.position.set(3, -1, 3); scene.add(rim);
  const warm = new THREE.PointLight(0xf0a06a, 1.6, 10); warm.position.set(-3, 1, 2); scene.add(warm);

  const group = new THREE.Group(); scene.add(group);

  // glossy core
  const core = new THREE.Mesh(new THREE.SphereGeometry(.9, 96, 72),
    new THREE.MeshPhysicalMaterial({ color: 0xb3e04a, roughness: .24, metalness: .05, clearcoat: 1, clearcoatRoughness: .08, emissive: 0x1d2a05, emissiveIntensity: .45 }));
  group.add(core);

  // petal blades: ellipsoids that radiate from the core and sway in 3D
  const mints = new THREE.MeshStandardMaterial({ color: 0x46c489, roughness: .35, emissive: 0x0d3b28, emissiveIntensity: .6, transparent: true, opacity: .92 });
  const peach = new THREE.MeshStandardMaterial({ color: 0xf0a06a, roughness: .35, emissive: 0x3a1a08, emissiveIntensity: .5, transparent: true, opacity: .92 });
  const blades = [];
  const N = 8;
  for (let i = 0; i < N; i++) {
    const geo = new THREE.SphereGeometry(1, 32, 16);
    geo.scale(.22, 1.1, .05);
    const blade = new THREE.Mesh(geo, i % 3 === 0 ? peach : mints);
    blade.position.y = 1.35;
    const pivot = new THREE.Group();
    pivot.add(blade);
    pivot.rotation.z = (i / N) * Math.PI * 2;
    group.add(pivot);
    blades.push({ pivot, base: (i / N) * Math.PI * 2, i });
  }

  // orbit rings
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xb3e04a, transparent: true, opacity: .55 });
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.9, .008, 8, 240), ringMat);
  ringA.rotation.set(1.2, .2, 0); group.add(ringA);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(2.25, .006, 8, 240), new THREE.MeshBasicMaterial({ color: 0xf0a06a, transparent: true, opacity: .35 }));
  ringB.rotation.set(.35, .9, .4); group.add(ringB);

  // drifting spores
  const P = 600, pos = new Float32Array(P * 3);
  for (let i = 0; i < P; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), rad = 2.4 + Math.random() * 2.2;
    pos[i * 3] = Math.cos(th) * s * rad; pos[i * 3 + 1] = u * rad * .8; pos[i * 3 + 2] = Math.sin(th) * s * rad;
  }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const spores = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xb3e04a, size: .03, transparent: true, opacity: .75, depthWrite: false }));
  scene.add(spores);

  let px = 0, py = 0;
  cv.addEventListener('pointermove', e => { const b = cv.getBoundingClientRect(); px = (e.clientX - b.left) / b.width - .5; py = (e.clientY - b.top) / b.height - .5; });
  cv.addEventListener('pointerleave', () => { px = 0; py = 0; });

  function resize(){ const w = cv.clientWidth, h = cv.clientHeight; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();

  const t0 = performance.now();
  let visible = true;
  new IntersectionObserver(es => visible = es[0].isIntersecting).observe(cv);

  function frame(now){
    requestAnimationFrame(frame);
    if (!visible) return;
    const t = REDUCED ? 0 : (now - t0) / 1000;
    group.rotation.y = t * .18 + px * .6;
    group.rotation.x = py * .4;
    core.scale.setScalar(1 + Math.sin(t * 1.6) * .02);
    blades.forEach(b => {
      b.pivot.rotation.z = b.base + Math.sin(t * .6 + b.i) * .08;
      b.pivot.rotation.x = Math.sin(t * .5 + b.i * .9) * .35;
    });
    ringA.rotation.z = t * .22;
    ringB.rotation.z = -t * .15;
    spores.rotation.y = t * .03;
    r.render(scene, cam);
  }
  requestAnimationFrame(frame);
  return true;
}

/* 2D fallback petals when WebGL is unavailable */
function heroFallback(cv){
  const g = cv.getContext('2d');
  let w, h;
  function size(){ const dpr = Math.min(devicePixelRatio || 1, 2); w = cv.clientWidth; h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function frame(now){
    requestAnimationFrame(frame);
    const t = REDUCED ? 0 : now / 1000;
    g.clearRect(0, 0, w, h);
    g.save(); g.translate(w / 2, h / 2); g.rotate(t * .08);
    for (let i = 0; i < 12; i++){
      const a = i / 12 * Math.PI * 2, len = Math.min(w, h) * .42 * (1 + Math.sin(t * .9 + i) * .08);
      g.save(); g.rotate(a);
      const grad = g.createLinearGradient(0, 0, len, 0);
      grad.addColorStop(0, 'rgba(240,160,106,.95)'); grad.addColorStop(.35, i % 3 ? 'rgba(179,224,74,.9)' : 'rgba(70,196,137,.9)'); grad.addColorStop(1, 'rgba(179,224,74,0)');
      g.fillStyle = grad; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * .5, -len * .14, len, 0); g.quadraticCurveTo(len * .5, len * .14, 0, 0); g.fill();
      g.restore();
    }
    g.restore();
  }
  size(); addEventListener('resize', size); requestAnimationFrame(frame);
}

const heroCv = document.getElementById('hero3d');
if (heroCv) {
  if (!(HAS3D && heroWebGL(heroCv))) heroFallback(heroCv);
}

/* ---------- 3D room ---------- */
function roomScene(cv, section){
  let r;
  try { r = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); } catch (e) { return false; }
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.outputEncoding = THREE.sRGBEncoding;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d06);
  scene.fog = new THREE.Fog(0x0b0d06, 10, 22);
  const cam = new THREE.PerspectiveCamera(38, 1, .1, 60);

  scene.add(new THREE.HemisphereLight(0xf1ffd4, 0x111508, .8));
  const key = new THREE.DirectionalLight(0xfff6e0, 2.2); key.position.set(-4, 7, 4); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 20 });
  scene.add(key);
  const lamp = new THREE.PointLight(0xf0a06a, 1.4, 8, 1.6); lamp.position.set(-2, 2.2, 0.5); scene.add(lamp);

  const M = (c, rough, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: rough }, extra || {}));
  const wood = M(0x6b4a2f, .6), fabric = M(0x2f6d55, .85), fabricLt = M(0x46c489, .8), cloth = M(0xd9e6a0, .7), metal = M(0x3b4236, .45, { metalness: .5 });
  const floorM = M(0x1d2210, .85), wallM = M(0x262c15, .9);

  const box = (w, h, d, m, x, y, z) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); return mesh; };
  const cyl = (rt, rb, h, m, x, y, z) => { const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 16), m); mesh.position.set(x, y, z); mesh.castShadow = true; scene.add(mesh); return mesh; };

  // floor and walls
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 6), floorM);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  box(7, 2.7, .1, wallM, 0, 1.35, -3);
  box(.1, 2.7, 6, wallM, -3.5, 1.35, 0);

  // bed
  box(2, .35, 1.4, wood, -1.6, .18, -1.2);
  box(1.9, .25, 1.3, cloth, -1.6, .42, -1.2);
  box(.8, .14, .4, cloth, -2.0, .6, -1.5);
  // sofa
  box(1.8, .35, .8, fabric, 1.4, .18, -1.9);
  box(1.8, .5, .2, fabricLt, 1.4, .55, -2.2);
  box(.2, .45, .8, fabric, .55, .42, -1.9); box(.2, .45, .8, fabric, 2.25, .42, -1.9);
  // coffee table
  box(1.0, .06, .6, wood, .2, .6, .3);
  [[-.4, -.2], [.4, -.2], [-.4, .2], [.4, .2]].forEach(([x, z]) => cyl(.03, .03, .58, wood, .2 + x, .29, .3 + z));
  // wardrobe
  box(1.0, 2.2, .55, wood, 2.7, 1.1, -2.6);
  box(.04, 1.8, .02, metal, 2.42, 1.1, -2.3);
  // plant
  cyl(.2, .16, .35, M(0xb5673b, .8), 2.6, .18, 1.6);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(.22, 16, 12), fabricLt);
  leaf.scale.set(.7, 1.6, .3); leaf.position.set(2.6, .75, 1.6); scene.add(leaf);

  // exit door: a glowing panel in the back wall
  const doorGlow = M(0xb3e04a, .3, { emissive: 0xb3e04a, emissiveIntensity: 1.6 });
  box(.95, 2.1, .06, doorGlow, -.6, 1.05, -2.94);
  box(1.15, .08, .12, wood, -.6, 2.15, -2.92);
  box(.08, 2.1, .12, wood, -1.2, 1.05, -2.92);
  box(.08, 2.1, .12, wood, 0, 1.05, -2.92);
  const exitLight = new THREE.PointLight(0xb3e04a, 1.2, 4); exitLight.position.set(-.6, 1.2, -2.5); scene.add(exitLight);

  // escape route: a glowing tube from the bed to the exit, plus a pulse that runs along it
  const route = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.6, .6, -.4), new THREE.Vector3(-.9, .05, .3), new THREE.Vector3(.2, .05, .9),
    new THREE.Vector3(1.0, .05, .2), new THREE.Vector3(.2, .05, -1.1), new THREE.Vector3(-.5, .05, -2.0),
    new THREE.Vector3(-.6, .6, -2.5)
  ]);
  const routeMat = new THREE.MeshStandardMaterial({ color: 0xf0a06a, emissive: 0xf0a06a, emissiveIntensity: 1.2, roughness: .3 });
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(route, 200, .03, 8, false), routeMat));
  const pulse = new THREE.Mesh(new THREE.SphereGeometry(.09, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  scene.add(pulse);

  // a few floating spores for depth
  const S = 260, sp = new Float32Array(S * 3);
  for (let i = 0; i < S; i++) { sp[i * 3] = (Math.random() - .5) * 8; sp[i * 3 + 1] = Math.random() * 3; sp[i * 3 + 2] = (Math.random() - .5) * 7; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sporesRoom = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xb3e04a, size: .03, transparent: true, opacity: .6, depthWrite: false }));
  scene.add(sporesRoom);

  function resize(){ const w = cv.clientWidth, h = cv.clientHeight; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();

  // scroll progress through the section: 0 at entry, 1 at exit
  function progress(){
    const rect = section.getBoundingClientRect();
    const total = rect.height - innerHeight;
    return Math.min(1, Math.max(0, -rect.top / Math.max(1, total)));
  }

  const t0 = performance.now();
  let visible = true;
  new IntersectionObserver(es => visible = es[0].isIntersecting).observe(cv);

  function frame(now){
    requestAnimationFrame(frame);
    if (!visible) return;
    const t = REDUCED ? 0 : (now - t0) / 1000;
    const p = progress();
    const a = p * Math.PI * 1.1 + Math.PI * .15 + (REDUCED ? 0 : Math.sin(t * .2) * .05);
    const dist = 8.2 - Math.sin(p * Math.PI) * 1.2;
    cam.position.set(Math.sin(a) * dist, 4.2 - p * 1.4, Math.cos(a) * dist);
    cam.lookAt(0, .7, -.6);
    const u = REDUCED ? .3 : (t * .09) % 1;
    pulse.position.copy(route.getPointAt(u));
    exitLight.intensity = 1.0 + Math.sin(t * 2.2) * .4;
    doorGlow.emissiveIntensity = 1.4 + Math.sin(t * 2.2) * .3;
    sporesRoom.rotation.y = t * .02;
    r.render(scene, cam);
  }
  requestAnimationFrame(frame);
  return true;
}

const roomCv = document.getElementById('room3dcv');
const roomSection = document.getElementById('room');
if (roomCv && roomSection && HAS3D) {
  roomScene(roomCv, roomSection);
}

/* ---------- scroll progress, parallax, cursor spotlight ---------- */
const bar = document.getElementById('progress');
const parallax = [...document.querySelectorAll('[data-speed]')];
function onScroll(){
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  if (!REDUCED) parallax.forEach(el => {
    const speed = parseFloat(el.dataset.speed) || 0;
    const r = el.getBoundingClientRect();
    el.style.transform = `translateY(${(r.top - innerHeight / 2) * -speed}px)`;
  });
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();

const spot = document.getElementById('spot');
addEventListener('pointermove', e => { spot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; }, { passive: true });

/* ---------- card tilt and magnetic buttons ---------- */
if (!REDUCED && matchMedia('(hover:hover)').matches) {
  document.querySelectorAll('.tilt').forEach(card => {
    card.addEventListener('pointermove', e => {
      const b = card.getBoundingClientRect();
      const x = (e.clientX - b.left) / b.width - .5, y = (e.clientY - b.top) / b.height - .5;
      card.style.transform = `perspective(900px) rotateX(${-y * 8}deg) rotateY(${x * 10}deg)`;
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  });
  document.querySelectorAll('.magnetic').forEach(btn => {
    btn.addEventListener('pointermove', e => {
      const b = btn.getBoundingClientRect();
      btn.style.transform = `translate(${(e.clientX - b.left - b.width / 2) * .25}px, ${(e.clientY - b.top - b.height / 2) * .25}px)`;
    });
    btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
  });
}

/* ---------- FAQ accordion ---------- */
document.querySelectorAll('.accordion .q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.parentElement;
    const open = !item.classList.contains('open');
    document.querySelectorAll('.accordion li').forEach(li => li.classList.remove('open'));
    document.querySelectorAll('.accordion .q').forEach(b => { b.setAttribute('aria-expanded', 'false'); b.querySelector('.ic').textContent = '↓'; });
    if (open) { item.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); btn.querySelector('.ic').textContent = '↑'; }
  });
});

/* ---------- reveal on scroll ---------- */
(function(){
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || REDUCED) { els.forEach(el => el.classList.add('in')); return; }
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: .15 });
  els.forEach(el => io.observe(el));
})();

/* ---------- demo sign-up ---------- */
document.getElementById('joinForm').addEventListener('submit', e => {
  e.preventDefault();
  document.getElementById('joinMsg').textContent = 'Thanks. You are on the list. (Demo: connect this form to your email service.)';
  e.target.reset();
});
