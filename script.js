/* RescueSphere template script.
   1. One full-page three.js stage. Each section has its own 3D model; the model for the
      section in view grows in, the others shrink away. Models: glossy core with petal blades,
      escape-route exit door, interactive 3D room, floating cubes, torus knot, orbit rings,
      helix path, crystal cluster.
   2. Effects: letter reveals, scroll progress, cursor spotlight, card tilt, magnetic buttons,
      parallax headings, FAQ accordion, reveal-on-scroll, demo sign-up. */

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const HAS3D = typeof THREE !== 'undefined';

/* ---------- letter split ---------- */
function splitInto(el){
  let i = 0;
  const walk = node => [...node.childNodes].forEach(n => {
    if (n.nodeType === 3) {
      const frag = document.createDocumentFragment();
      for (const ch of n.textContent) {
        const s = document.createElement('span');
        if (ch.trim() === '') s.textContent = '\u00A0';
        else { s.className = 'ch'; s.style.setProperty('--i', i++); s.textContent = ch; }
        frag.appendChild(s);
      }
      n.replaceWith(frag);
    } else if (n.nodeType === 1) walk(n);
  });
  walk(el);
  el.classList.add('split-ready');
}
if (!REDUCED) document.querySelectorAll('[data-split]').forEach(el => {
  if (el.classList.contains('hero-title')) el.querySelectorAll('.line').forEach(splitInto);
  else splitInto(el);
});

/* ---------- the stage ---------- */
const stageCv = document.getElementById('stage3d');
let stage = null;

function buildStage(cv){
  let r;
  try { r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); }
  catch (e) { return null; }
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  r.outputEncoding = THREE.sRGBEncoding;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b0d06, 12, 26);
  const cam = new THREE.PerspectiveCamera(36, 1, .1, 60);

  scene.add(new THREE.HemisphereLight(0xf1ffd4, 0x111508, .85));
  const key = new THREE.DirectionalLight(0xfff6e0, 2.1); key.position.set(-4, 6, 5); scene.add(key);
  const rim = new THREE.PointLight(0x46c489, 2.6, 16); rim.position.set(4, -1, 3); scene.add(rim);
  const warm = new THREE.PointLight(0xf0a06a, 1.4, 12); warm.position.set(-3, 1.5, 2); scene.add(warm);

  /* shared helpers */
  const M = (c, rough, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: rough }, extra || {}));
  const P = (c, rough, extra) => new THREE.MeshPhysicalMaterial(Object.assign({ color: c, roughness: rough, metalness: .05, clearcoat: 1, clearcoatRoughness: .08 }, extra || {}));
  const add = (g, mesh, x, y, z) => { if (x !== undefined) mesh.position.set(x, y, z); g.add(mesh); return mesh; };
  const box = (g, w, h, d, m, x, y, z) => add(g, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), x, y, z);
  const cyl = (g, rt, rb, h, m, x, y, z) => add(g, new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 16), m), x, y, z);
  const spores = (g, n, rad, size, color) => {
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), rr = rad * (.7 + Math.random() * .6);
      arr[i * 3] = Math.cos(th) * s * rr; arr[i * 3 + 1] = u * rr * .8; arr[i * 3 + 2] = Math.sin(th) * s * rr;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity: .75, depthWrite: false }));
    g.add(pts); return pts;
  };

  /* 1. CORE: glossy sphere, petal blades, orbit rings */
  function makeCore(){
    const g = new THREE.Group(), anim = [];
    const core = add(g, new THREE.Mesh(new THREE.SphereGeometry(.9, 96, 72), P(0xb3e04a, .24, { emissive: 0x1d2a05, emissiveIntensity: .45 })));
    const mints = M(0x46c489, .35, { emissive: 0x0d3b28, emissiveIntensity: .6, transparent: true, opacity: .92 });
    const peach = M(0xf0a06a, .35, { emissive: 0x3a1a08, emissiveIntensity: .5, transparent: true, opacity: .92 });
    const N = 8;
    for (let i = 0; i < N; i++){
      const geo = new THREE.SphereGeometry(1, 32, 16); geo.scale(.22, 1.1, .05);
      const pivot = new THREE.Group(); const blade = new THREE.Mesh(geo, i % 3 === 0 ? peach : mints);
      blade.position.y = 1.35; pivot.add(blade); pivot.rotation.z = (i / N) * Math.PI * 2; g.add(pivot);
      anim.push(t => { pivot.rotation.z = (i / N) * Math.PI * 2 + Math.sin(t * .6 + i) * .08; pivot.rotation.x = Math.sin(t * .5 + i * .9) * .35; });
    }
    const ra = add(g, new THREE.Mesh(new THREE.TorusGeometry(1.9, .008, 8, 240), new THREE.MeshBasicMaterial({ color: 0xb3e04a, transparent: true, opacity: .55 })));
    ra.rotation.set(1.2, .2, 0);
    const rb = add(g, new THREE.Mesh(new THREE.TorusGeometry(2.25, .006, 8, 240), new THREE.MeshBasicMaterial({ color: 0xf0a06a, transparent: true, opacity: .35 })));
    rb.rotation.set(.35, .9, .4);
    const sp = spores(g, 500, 2.8, .03, 0xb3e04a);
    anim.push(t => { core.scale.setScalar(1 + Math.sin(t * 1.6) * .02); ra.rotation.z = t * .22; rb.rotation.z = -t * .15; sp.rotation.y = t * .03; });
    return { group: g, anim, fit: 1, offset: [2.4, 0, 0] };
  }

  /* 2. DOOR: exit door in a wall, a glowing escape route and a pulse running along it */
  function makeDoor(){
    const g = new THREE.Group(), anim = [];
    const wallM = M(0x262c15, .9), wood = M(0x6b4a2f, .6);
    box(g, 4.2, 3, .12, wallM, 0, 0, 0);
    const glow = M(0xb3e04a, .3, { emissive: 0xb3e04a, emissiveIntensity: 1.5 });
    box(g, .95, 2.05, .06, glow, -.4, -.1, .1);
    box(g, 1.15, .08, .12, wood, -.4, .93, .12); box(g, .08, 2.05, .12, wood, -.88, -.1, .12); box(g, .08, 2.05, .12, wood, .08, -.1, .12);
    const route = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.6, -.9, .3), new THREE.Vector3(-.8, -1.1, .6), new THREE.Vector3(.4, -1.1, .9),
      new THREE.Vector3(1.4, -1.0, .5), new THREE.Vector3(1.2, -.4, .3), new THREE.Vector3(.4, -.3, .25), new THREE.Vector3(-.4, -.5, .2)
    ]);
    const tubeM = M(0xf0a06a, .3, { emissive: 0xf0a06a, emissiveIntensity: 1.3 });
    add(g, new THREE.Mesh(new THREE.TubeGeometry(route, 220, .035, 10, false), tubeM));
    const pulse = add(g, new THREE.Mesh(new THREE.SphereGeometry(.11, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    const ex = new THREE.PointLight(0xb3e04a, 1.6, 4); ex.position.set(-.4, 0, .6); g.add(ex);
    anim.push(t => {
      pulse.position.copy(route.getPointAt((t * .12) % 1));
      glow.emissiveIntensity = 1.3 + Math.sin(t * 2.2) * .35;
      ex.intensity = 1.2 + Math.sin(t * 2.2) * .4;
    });
    return { group: g, anim, fit: 1.1, offset: [2.2, 0, 0] };
  }

  /* 3. ROOM: the interactive 3D room (furniture, plant, wardrobe) */
  function makeRoom(){
    const g = new THREE.Group(), anim = [];
    const wood = M(0x6b4a2f, .6), fabric = M(0x2f6d55, .85), fabricLt = M(0x46c489, .8), cloth = M(0xd9e6a0, .7), metal = M(0x3b4236, .45, { metalness: .5 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 6), M(0x1d2210, .85)); floor.rotation.x = -Math.PI / 2; g.add(floor);
    box(g, 7, 2.7, .1, M(0x262c15, .9), 0, 1.35, -3);
    box(g, .1, 2.7, 6, M(0x262c15, .9), -3.5, 1.35, 0);
    box(g, 2, .35, 1.4, wood, -1.6, .18, -1.2); box(g, 1.9, .25, 1.3, cloth, -1.6, .42, -1.2); box(g, .8, .14, .4, cloth, -2.0, .6, -1.5);
    box(g, 1.8, .35, .8, fabric, 1.4, .18, -1.9); box(g, 1.8, .5, .2, fabricLt, 1.4, .55, -2.2);
    box(g, .2, .45, .8, fabric, .55, .42, -1.9); box(g, .2, .45, .8, fabric, 2.25, .42, -1.9);
    box(g, 1.0, .06, .6, wood, .2, .6, .3);
    [[-.4, -.2], [.4, -.2], [-.4, .2], [.4, .2]].forEach(([x, z]) => cyl(g, .03, .03, .58, wood, .2 + x, .29, .3 + z));
    box(g, 1.0, 2.2, .55, wood, 2.7, 1.1, -2.6); box(g, .04, 1.8, .02, metal, 2.42, 1.1, -2.3);
    cyl(g, .2, .16, .35, M(0xb5673b, .8), 2.6, .18, 1.6);
    const leaf = add(g, new THREE.Mesh(new THREE.SphereGeometry(.22, 16, 12), fabricLt), 2.6, .75, 1.6); leaf.scale.set(.7, 1.6, .3);
    const doorGlow = M(0xb3e04a, .3, { emissive: 0xb3e04a, emissiveIntensity: 1.5 });
    box(g, .95, 2.1, .06, doorGlow, -.6, 1.05, -2.94);
    box(g, 1.15, .08, .12, wood, -.6, 2.15, -2.92);
    const lamp = new THREE.PointLight(0xf0a06a, 1.4, 8, 1.6); lamp.position.set(-2, 2.2, .5); g.add(lamp);
    anim.push(t => { doorGlow.emissiveIntensity = 1.4 + Math.sin(t * 2.2) * .3; });
    return { group: g, anim, fit: .62, offset: [1.2, -.5, 0], camLook: [0, 1.4, -1] };
  }

  /* 4. CUBES: floating rounded cubes for the benefits */
  function makeCubes(){
    const g = new THREE.Group(), anim = [];
    const cols = [0xb3e04a, 0x46c489, 0xf0a06a, 0xb3e04a];
    const cubes = [];
    for (let i = 0; i < 4; i++){
      const c = add(g, new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), P(cols[i], .3, { roughness: .3 })), (i - 1.5) * 1.35, Math.sin(i) * .2, 0);
      cubes.push(c);
    }
    const inner = add(g, new THREE.Mesh(new THREE.IcosahedronGeometry(.45, 1), M(0xffffff, .2, { emissive: 0xf0a06a, emissiveIntensity: .3 })), 0, 0, 0);
    anim.push(t => {
      cubes.forEach((c, i) => { c.rotation.x = t * .4 + i; c.rotation.y = t * .55 + i * .6; c.position.y = Math.sin(t * .9 + i) * .2; });
      inner.rotation.y = -t * .8;
    });
    return { group: g, anim, fit: 1, offset: [2.3, 0, 0] };
  }

  /* 5. KNOT: a glossy torus knot for the problems panel */
  function makeKnot(){
    const g = new THREE.Group(), anim = [];
    const knot = add(g, new THREE.Mesh(new THREE.TorusKnotGeometry(.8, .24, 220, 28), P(0xb3e04a, .25, { metalness: .4, roughness: .2 })));
    const wire = add(g, new THREE.Mesh(new THREE.TorusKnotGeometry(.82, .25, 120, 12), new THREE.MeshBasicMaterial({ color: 0x46c489, wireframe: true, transparent: true, opacity: .25 })));
    anim.push(t => { knot.rotation.x = t * .3; knot.rotation.y = t * .45; wire.rotation.copy(knot.rotation); });
    return { group: g, anim, fit: 1, offset: [2.2, 0, 0] };
  }

  /* 6. RINGS: stacked orbit rings with orbiting spheres for the FAQ */
  function makeRings(){
    const g = new THREE.Group(), anim = [];
    const rings = [];
    for (let i = 0; i < 5; i++){
      const rr = add(g, new THREE.Mesh(new THREE.TorusGeometry(.9 + i * .33, .018, 10, 200), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x46c489 : 0xb3e04a, transparent: true, opacity: .75 })));
      rr.rotation.set(Math.PI / 2 + i * .25, i * .6, 0); rings.push(rr);
    }
    const orbs = [];
    for (let i = 0; i < 5; i++){
      orbs.push(add(g, new THREE.Mesh(new THREE.SphereGeometry(.09, 16, 12), P(0xf0a06a, .3))));
    }
    anim.push(t => {
      rings.forEach((rr, i) => { rr.rotation.z = t * (.2 + i * .07) * (i % 2 ? 1 : -1); });
      orbs.forEach((o, i) => {
        const ring = rings[i], a = t * (.6 + i * .15) + i;
        const rad = .9 + i * .33;
        o.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
        o.position.applyEuler(ring.rotation);
      });
    });
    return { group: g, anim, fit: 1, offset: [2.2, 0, 0] };
  }

  /* 7. PATH: a glowing helix with a pulse for the roadmap */
  function makePath(){
    const g = new THREE.Group(), anim = [];
    const pts = [];
    for (let i = 0; i <= 120; i++){ const t = i / 120; pts.push(new THREE.Vector3(Math.cos(t * Math.PI * 4) * 1.1, (t - .5) * 3.2, Math.sin(t * Math.PI * 4) * 1.1)); }
    const curve = new THREE.CatmullRomCurve3(pts);
    add(g, new THREE.Mesh(new THREE.TubeGeometry(curve, 300, .03, 8, false), M(0xb3e04a, .3, { emissive: 0xb3e04a, emissiveIntensity: .9 })));
    const dots = [];
    for (let i = 0; i < 6; i++){ dots.push(add(g, new THREE.Mesh(new THREE.SphereGeometry(.1, 16, 12), P(0x46c489, .3)))); }
    anim.push(t => {
      dots.forEach((d, i) => d.position.copy(curve.getPointAt(((t * .07) + i / 6) % 1)));
      g.rotation.y = t * .15;
    });
    return { group: g, anim, fit: 1, offset: [2.2, 0, 0] };
  }

  /* 8. BLOCKS: a cluster of crystals for the footer */
  function makeBlocks(){
    const g = new THREE.Group(), anim = [];
    const cols = [0xb3e04a, 0x46c489, 0xf0a06a];
    const shapes = [];
    for (let i = 0; i < 7; i++){
      const m = add(g, new THREE.Mesh(new THREE.OctahedronGeometry(.32 + (i % 3) * .08, 0), P(cols[i % 3], .25, { metalness: .2 })),
        Math.cos(i * 2.1) * 1.3, Math.sin(i * 1.7) * .6, Math.sin(i * 2.1) * .8);
      shapes.push(m);
    }
    anim.push(t => shapes.forEach((m, i) => { m.rotation.x = t * (.3 + i * .05); m.rotation.y = t * (.5 + i * .04); m.position.y += Math.sin(t + i) * .0003; }));
    return { group: g, anim, fit: 1, offset: [2.0, -.4, 0] };
  }

  const builders = { core: makeCore, door: makeDoor, room: makeRoom, cubes: makeCubes, knot: makeKnot, rings: makeRings, path: makePath, blocks: makeBlocks };
  const models = {};
  for (const [key, fn] of Object.entries(builders)){
    const m = fn();
    m.group.visible = false; m.group.scale.setScalar(.001); m.s = 0; m.key = key;
    scene.add(m.group); models[key] = m;
  }

  function resize(){
    const w = cv.clientWidth, h = cv.clientHeight;
    r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  /* which model should be on: the section that crosses the middle of the viewport */
  const sections = [...document.querySelectorAll('[data-model]')];
  function activeKey(){
    const mid = innerHeight * .5;
    let best = null, bestDist = Infinity;
    for (const s of sections){
      const rect = s.getBoundingClientRect();
      if (rect.top <= mid && rect.bottom >= mid) return s.dataset.model;
      const d = Math.min(Math.abs(rect.top - mid), Math.abs(rect.bottom - mid));
      if (d < bestDist){ bestDist = d; best = s.dataset.model; }
    }
    return best || 'core';
  }

  let px = 0, py = 0;
  addEventListener('pointermove', e => { px = e.clientX / innerWidth - .5; py = e.clientY / innerHeight - .5; }, { passive: true });

  const t0 = performance.now();
  let last = t0, cur = 'core';
  function frame(now){
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const t = REDUCED ? 0 : (now - t0) / 1000;
    const want = activeKey();
    if (want !== cur) cur = want;
    const wide = innerWidth > 900;

    for (const key in models){
      const m = models[key];
      const target = key === cur ? 1 : 0;
      m.s += (target - m.s) * (1 - Math.exp(-dt * 4));
      const vis = m.s > .004;
      m.group.visible = vis;
      if (!vis) continue;
      const k = Math.max(.001, m.s * m.fit);
      m.group.scale.setScalar(k);
      const ox = wide ? m.offset[0] : 0;
      const oy = m.offset[1] + (1 - m.s) * .6;
      m.group.position.set(ox + px * .3, oy - py * .2, m.offset[2]);
      m.group.rotation.y = (REDUCED ? 0 : Math.sin(t * .2) * .15) + px * .2;
      m.anim.forEach(fn => fn(t));
    }

    const look = models[cur] && models[cur].camLook ? models[cur].camLook : [0, 0, 0];
    cam.position.set(px * .6, .6 - py * .4, 9.4);
    cam.lookAt(look[0] + (wide ? 0 : 0), look[1], look[2]);
    r.render(scene, cam);
  }
  requestAnimationFrame(frame);
  return true;
}

stage = stageCv && HAS3D ? buildStage(stageCv) : null;

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
