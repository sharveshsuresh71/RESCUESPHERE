import * as THREE from 'three';

/** Every section of the landing page owns one of these 3D models. */
export type ModelKey = 'core' | 'door' | 'room' | 'cubes' | 'knot' | 'rings' | 'path' | 'blocks';

export type V3 = [number, number, number];
export type Anim = (t: number) => void;

export interface Spec {
  group: THREE.Group;
  /** per-frame animation callbacks; t is seconds since the stage started */
  anim: Anim[];
  /** scale multiplier so each model fits the stage */
  fit: number;
  /** where the model sits on screen when it is active */
  offset: V3;
  /** camera position and look-at point used while this model is active */
  camPos: V3;
  camLook: V3;
}

export interface StageModel extends Spec {
  key: ModelKey;
  /** 0 = hidden, 1 = fully shown; eased by the stage */
  s: number;
}

const DEFAULT_CAM: V3 = [0, 0.6, 9.4];
const ORIGIN: V3 = [0, 0, 0];

const lime = 0xb3e04a, mint = 0x46c489, peach = 0xf0a06a;

function stdMat(color: number, roughness: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, ...extra });
}

function physMat(color: number, roughness: number, extra: THREE.MeshPhysicalMaterialParameters = {}): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08, ...extra });
}

function addBox(g: THREE.Group, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

function addCylinder(g: THREE.Group, rt: number, rb: number, h: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 16), m);
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

/** A soft cloud of drifting particles around the origin. */
function addSpores(g: THREE.Group, count: number, radius: number, size: number, color: number): THREE.Points {
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const rr = radius * (0.7 + Math.random() * 0.6);
    arr[i * 3] = Math.cos(th) * s * rr;
    arr[i * 3 + 1] = u * rr * 0.8;
    arr[i * 3 + 2] = Math.sin(th) * s * rr;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.75, depthWrite: false }));
  g.add(pts);
  return pts;
}

/* 1. Hero core: glossy sphere, petal blades, rings, halo */
function buildCore(glowTex: THREE.Texture): Spec {
  const g = new THREE.Group();
  const anim: Anim[] = [];
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.9, 96, 72), physMat(lime, 0.24, { emissive: 0x1d2a05, emissiveIntensity: 0.45 }));
  core.castShadow = true;
  g.add(core);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: lime, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55 }));
  halo.scale.setScalar(4.2);
  g.add(halo);

  const mints = stdMat(mint, 0.35, { emissive: 0x0d3b28, emissiveIntensity: 0.6, transparent: true, opacity: 0.92 });
  const peaches = stdMat(peach, 0.35, { emissive: 0x3a1a08, emissiveIntensity: 0.5, transparent: true, opacity: 0.92 });
  const N = 8;
  for (let i = 0; i < N; i++) {
    const geo = new THREE.SphereGeometry(1, 32, 16);
    geo.scale(0.22, 1.1, 0.05);
    const pivot = new THREE.Group();
    const blade = new THREE.Mesh(geo, i % 3 === 0 ? peaches : mints);
    blade.position.y = 1.35;
    pivot.add(blade);
    pivot.rotation.z = (i / N) * Math.PI * 2;
    g.add(pivot);
    anim.push((t) => {
      pivot.rotation.z = (i / N) * Math.PI * 2 + Math.sin(t * 0.6 + i) * 0.08;
      pivot.rotation.x = Math.sin(t * 0.5 + i * 0.9) * 0.35;
    });
  }

  const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.008, 8, 240), new THREE.MeshBasicMaterial({ color: lime, transparent: true, opacity: 0.55 }));
  ringA.rotation.set(1.2, 0.2, 0);
  g.add(ringA);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.006, 8, 240), new THREE.MeshBasicMaterial({ color: peach, transparent: true, opacity: 0.35 }));
  ringB.rotation.set(0.35, 0.9, 0.4);
  g.add(ringB);
  const spores = addSpores(g, 500, 2.8, 0.03, lime);
  anim.push((t) => {
    core.scale.setScalar(1 + Math.sin(t * 1.6) * 0.02);
    ringA.rotation.z = t * 0.22;
    ringB.rotation.z = -t * 0.15;
    spores.rotation.y = t * 0.03;
  });
  return { group: g, anim, fit: 1, offset: [2.4, 0, 0], camPos: DEFAULT_CAM, camLook: ORIGIN };
}

/* 2. Exit door: a lit door in a wall and a glowing escape route with a pulse */
function buildDoor(): Spec {
  const g = new THREE.Group();
  const anim: Anim[] = [];
  const wallM = stdMat(0x262c15, 0.9);
  const wood = stdMat(0x6b4a2f, 0.6);
  addBox(g, 4.2, 3, 0.12, wallM, 0, 0, 0);
  const glow = stdMat(lime, 0.3, { emissive: lime, emissiveIntensity: 1.5 });
  addBox(g, 0.95, 2.05, 0.06, glow, -0.4, -0.1, 0.1);
  addBox(g, 1.15, 0.08, 0.12, wood, -0.4, 0.93, 0.12);
  addBox(g, 0.08, 2.05, 0.12, wood, -0.88, -0.1, 0.12);
  addBox(g, 0.08, 2.05, 0.12, wood, 0.08, -0.1, 0.12);

  const route = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.6, -0.9, 0.3), new THREE.Vector3(-0.8, -1.1, 0.6), new THREE.Vector3(0.4, -1.1, 0.9),
    new THREE.Vector3(1.4, -1.0, 0.5), new THREE.Vector3(1.2, -0.4, 0.3), new THREE.Vector3(0.4, -0.3, 0.25), new THREE.Vector3(-0.4, -0.5, 0.2)
  ]);
  const tubeM = stdMat(peach, 0.3, { emissive: peach, emissiveIntensity: 1.3 });
  g.add(new THREE.Mesh(new THREE.TubeGeometry(route, 220, 0.035, 10, false), tubeM));
  const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  g.add(pulse);
  const exitLight = new THREE.PointLight(lime, 3, 6, 1.5);
  exitLight.position.set(-0.4, 0, 0.6);
  g.add(exitLight);
  anim.push((t) => {
    pulse.position.copy(route.getPointAt((t * 0.12) % 1));
    glow.emissiveIntensity = 1.3 + Math.sin(t * 2.2) * 0.35;
    exitLight.intensity = 3 + Math.sin(t * 2.2) * 0.8;
  });
  return { group: g, anim, fit: 1.1, offset: [2.2, 0, 0], camPos: [0.6, 0.4, 8.6], camLook: ORIGIN };
}

/* 3. Room: a furnished room. Shadows are on for this model only. */
function buildRoom(): Spec {
  const g = new THREE.Group();
  const anim: Anim[] = [];
  const wood = stdMat(0x6b4a2f, 0.6);
  const fabric = stdMat(0x2f6d55, 0.85);
  const fabricLt = stdMat(mint, 0.8);
  const cloth = stdMat(0xd9e6a0, 0.7);
  const metal = stdMat(0x3b4236, 0.45, { metalness: 0.5 });
  const wallM = stdMat(0x262c15, 0.9);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 6), stdMat(0x1d2210, 0.85));
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  addBox(g, 7, 2.7, 0.1, wallM, 0, 1.35, -3);
  addBox(g, 0.1, 2.7, 6, wallM, -3.5, 1.35, 0);

  // bed
  addBox(g, 2, 0.35, 1.4, wood, -1.6, 0.18, -1.2);
  addBox(g, 1.9, 0.25, 1.3, cloth, -1.6, 0.42, -1.2);
  addBox(g, 0.8, 0.14, 0.4, cloth, -2.0, 0.6, -1.5);
  // sofa
  addBox(g, 1.8, 0.35, 0.8, fabric, 1.4, 0.18, -1.9);
  addBox(g, 1.8, 0.5, 0.2, fabricLt, 1.4, 0.55, -2.2);
  addBox(g, 0.2, 0.45, 0.8, fabric, 0.55, 0.42, -1.9);
  addBox(g, 0.2, 0.45, 0.8, fabric, 2.25, 0.42, -1.9);
  // coffee table
  addBox(g, 1.0, 0.06, 0.6, wood, 0.2, 0.6, 0.3);
  for (const [x, z] of [[-0.4, -0.2], [0.4, -0.2], [-0.4, 0.2], [0.4, 0.2]] as const) {
    addCylinder(g, 0.03, 0.03, 0.58, wood, 0.2 + x, 0.29, 0.3 + z);
  }
  // wardrobe, plant, exit door
  addBox(g, 1.0, 2.2, 0.55, wood, 2.7, 1.1, -2.6);
  addBox(g, 0.04, 1.8, 0.02, metal, 2.42, 1.1, -2.3);
  addCylinder(g, 0.2, 0.16, 0.35, stdMat(0xb5673b, 0.8), 2.6, 0.18, 1.6);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), fabricLt);
  leaf.position.set(2.6, 0.75, 1.6);
  leaf.scale.set(0.7, 1.6, 0.3);
  g.add(leaf);
  const doorGlow = stdMat(lime, 0.3, { emissive: lime, emissiveIntensity: 1.5 });
  addBox(g, 0.95, 2.1, 0.06, doorGlow, -0.6, 1.05, -2.94);
  addBox(g, 1.15, 0.08, 0.12, wood, -0.6, 2.15, -2.92);

  const lamp = new THREE.PointLight(peach, 4, 9, 1.5);
  lamp.position.set(-2, 2.2, 0.5);
  g.add(lamp);

  g.traverse((o) => {
    if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  anim.push((t) => {
    doorGlow.emissiveIntensity = 1.4 + Math.sin(t * 2.2) * 0.3;
    lamp.intensity = 3.6 + Math.sin(t * 1.3) * 0.4;
  });
  return { group: g, anim, fit: 0.62, offset: [1.2, -0.5, 0], camPos: [1.5, 4.2, 6.6], camLook: [0, 1.2, -1] };
}

/* 4. Cubes: four rounded cubes around a crystal, for the benefits */
function buildCubes(): Spec {
  const g = new THREE.Group();
  const anim: Anim[] = [];
  const colors = [lime, mint, peach, lime];
  const cubes: THREE.Mesh[] = [];
  colors.forEach((c, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), physMat(c, 0.3, { roughness: 0.3 }));
    m.position.set((i - 1.5) * 1.35, Math.sin(i) * 0.2, 0);
    g.add(m);
    cubes.push(m);
  });
  const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), stdMat(0xffffff, 0.2, { emissive: peach, emissiveIntensity: 0.3 }));
  g.add(crystal);
  anim.push((t) => {
    cubes.forEach((c, i) => {
      c.rotation.x = t * 0.4 + i;
      c.rotation.y = t * 0.55 + i * 0.6;
      c.position.y = Math.sin(t * 0.9 + i) * 0.2;
    });
    crystal.rotation.y = -t * 0.8;
  });
  return { group: g, anim, fit: 1, offset: [2.3, 0, 0], camPos: DEFAULT_CAM, camLook: ORIGIN };
}

/* 5. Knot: a glossy torus knot with a wireframe shell, for the problems panel */
function buildKnot(): Spec {
  const g = new THREE.Group();
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.24, 220, 28), physMat(lime, 0.25, { metalness: 0.4, roughness: 0.2 }));
  knot.castShadow = true;
  g.add(knot);
  const wire = new THREE.Mesh(new THREE.TorusKnotGeometry(0.82, 0.25, 120, 12), new THREE.MeshBasicMaterial({ color: mint, wireframe: true, transparent: true, opacity: 0.25 }));
  g.add(wire);
  return {
    group: g,
    anim: [(t) => {
      knot.rotation.x = t * 0.3;
      knot.rotation.y = t * 0.45;
      wire.rotation.copy(knot.rotation);
    }],
    fit: 1, offset: [2.2, 0, 0], camPos: DEFAULT_CAM, camLook: ORIGIN
  };
}

/* 6. Rings: five orbit rings, each carrying a sphere, for the FAQ */
function buildRings(): Spec {
  const g = new THREE.Group();
  const rings: THREE.Mesh[] = [];
  const radii: number[] = [];
  for (let i = 0; i < 5; i++) {
    const r = 0.9 + i * 0.33;
    radii.push(r);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 10, 200), new THREE.MeshBasicMaterial({ color: i % 2 ? mint : lime, transparent: true, opacity: 0.75 }));
    ring.rotation.set(Math.PI / 2 + i * 0.25, i * 0.6, 0);
    g.add(ring);
    rings.push(ring);
  }
  const orbs: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), physMat(peach, 0.3));
    g.add(o);
    orbs.push(o);
  }
  return {
    group: g,
    anim: [(t) => {
      rings.forEach((ring, i) => { ring.rotation.z = t * (0.2 + i * 0.07) * (i % 2 ? 1 : -1); });
      orbs.forEach((o, i) => {
        const ring = rings[i];
        const rad = radii[i];
        if (!ring || rad === undefined) return;
        const a = t * (0.6 + i * 0.15) + i;
        o.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
        o.position.applyEuler(ring.rotation);
      });
    }],
    fit: 1, offset: [2.2, 0, 0], camPos: DEFAULT_CAM, camLook: ORIGIN
  };
}

/* 7. Path: a glowing helix with pulses, for the roadmap */
function buildPath(): Spec {
  const g = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    pts.push(new THREE.Vector3(Math.cos(t * Math.PI * 4) * 1.1, (t - 0.5) * 3.2, Math.sin(t * Math.PI * 4) * 1.1));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 300, 0.03, 8, false), stdMat(lime, 0.3, { emissive: lime, emissiveIntensity: 0.9 })));
  const dots: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), physMat(mint, 0.3));
    g.add(d);
    dots.push(d);
  }
  return {
    group: g,
    anim: [(t) => {
      dots.forEach((d, i) => d.position.copy(curve.getPointAt((t * 0.07 + i / 6) % 1)));
      g.rotation.y = t * 0.15;
    }],
    fit: 1, offset: [2.2, 0, 0], camPos: DEFAULT_CAM, camLook: ORIGIN
  };
}

/* 8. Blocks: a cluster of crystals, for the footer */
function buildBlocks(): Spec {
  const g = new THREE.Group();
  const colors = [lime, mint, peach];
  const shapes: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.32 + (i % 3) * 0.08, 0), physMat(colors[i % 3] ?? lime, 0.25, { metalness: 0.2 }));
    m.position.set(Math.cos(i * 2.1) * 1.3, Math.sin(i * 1.7) * 0.6, Math.sin(i * 2.1) * 0.8);
    g.add(m);
    shapes.push(m);
  }
  return {
    group: g,
    anim: [(t) => shapes.forEach((m, i) => {
      m.rotation.x = t * (0.3 + i * 0.05);
      m.rotation.y = t * (0.5 + i * 0.04);
    })],
    fit: 1, offset: [2.0, -0.4, 0], camPos: DEFAULT_CAM, camLook: ORIGIN
  };
}

/** Builds every model. The glow texture is shared by the hero halo. */
export function buildModels(glowTex: THREE.Texture): Record<ModelKey, Spec> {
  return {
    core: buildCore(glowTex),
    door: buildDoor(),
    room: buildRoom(),
    cubes: buildCubes(),
    knot: buildKnot(),
    rings: buildRings(),
    path: buildPath(),
    blocks: buildBlocks()
  };
}
