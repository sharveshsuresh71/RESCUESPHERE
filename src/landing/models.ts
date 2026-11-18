import * as THREE from 'three';

/*
 * Section models: schematic, CAD-style drawings that match each section's content.
 * Wireframes and muted blue-grey lines; the lime accent marks only the active part.
 * Each model is keyed to a section via data-model in index.html.
 */
export type ModelKey = 'core' | 'door' | 'room' | 'cubes' | 'knot' | 'rings' | 'path' | 'blocks';
export type V3 = [number, number, number];
export type Anim = (t: number) => void;

export interface Spec {
  group: THREE.Group;
  anim: Anim[];
  fit: number;
  /** position of the model on screen while its section is active */
  offset: V3;
  camPos: V3;
  camLook: V3;
}

export interface StageModel extends Spec {
  key: ModelKey;
  /** 0 = hidden, 1 = shown; eased by the stage */
  s: number;
}

const WIRE = 0x8f9bd0;
const WIRE_DIM = 0x46508a;
const ACCENT = 0xb3e04a;
const WARN = 0xf0a06a;
const CAM: V3 = [0, 0.4, 10.2];
const ORIGIN: V3 = [0, 0, 0];

interface Edged {
  edges: THREE.LineBasicMaterial;
  fill: THREE.MeshBasicMaterial;
  group: THREE.Group;
}

/** A box drawn as edges plus a faint fill. Returns the materials so they can be animated. */
function edgeBox(parent: THREE.Group, w: number, h: number, d: number, color: number, fillOpacity: number, x: number, y: number, z: number): Edged {
  const holder = new THREE.Group();
  holder.position.set(x, y, z);
  const geo = new THREE.BoxGeometry(w, h, d);
  const fill = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fillOpacity, depthWrite: false });
  holder.add(new THREE.Mesh(geo, fill));
  const edges = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
  holder.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edges));
  parent.add(holder);
  return { edges, fill, group: holder };
}

/** Straight segments from a flat list of coordinates: [x1,y1,z1, x2,y2,z2, ...]. */
function segments(parent: THREE.Group, coords: number[], color: number, opacity: number): THREE.LineBasicMaterial {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  parent.add(new THREE.LineSegments(geo, mat));
  return mat;
}

/** A square floor grid in the x/z plane at height y. */
function floorGrid(parent: THREE.Group, size: number, step: number, color: number, y: number, opacity: number): THREE.LineBasicMaterial {
  const coords: number[] = [];
  const half = size / 2;
  for (let i = -half; i <= half + 1e-6; i += step) {
    coords.push(i, 0, -half, i, 0, half);
    coords.push(-half, 0, i, half, 0, i);
  }
  const mat = segments(parent, coords, color, opacity);
  // move the grid we just added to the requested height
  const last = parent.children[parent.children.length - 1];
  if (last) last.position.y = y;
  return mat;
}

/* 1. Hero: a wireframe room with a scan plane and a route to the exit */
function buildCore(): Spec {
  const g = new THREE.Group();
  const anim: Anim[] = [];
  const W = 3.2, H = 1.9, D = 2.6, floorY = -H / 2;

  floorGrid(g, 5, 0.5, WIRE_DIM, floorY, 0.35);
  edgeBox(g, W, H, D, WIRE, 0.03, 0, 0, 0);
  const door = edgeBox(g, 0.8, 1.1, 0.03, ACCENT, 0.1, 0.7, floorY + 0.55, D / 2);

  const route = [new THREE.Vector3(-1.2, floorY + 0.02, -0.8), new THREE.Vector3(-0.2, floorY + 0.02, -0.2), new THREE.Vector3(0.7, floorY + 0.02, 0.5), new THREE.Vector3(0.7, floorY + 0.02, D / 2 + 0.2)];
  const routeGeo = new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3(route).getPoints(40));
  const routeMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9 });
  g.add(new THREE.Line(routeGeo, routeMat));

  const scanMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(W, D), scanMat);
  scan.rotation.x = -Math.PI / 2;
  g.add(scan);

  anim.push((t) => {
    g.rotation.set(-0.25, Math.sin(t * 0.25) * 0.4, 0);
    const p = (t * 0.3) % 1;
    scan.position.y = floorY + p * H;
    scanMat.opacity = 0.03 + 0.09 * Math.sin(Math.PI * p);
    routeMat.opacity = 0.55 + 0.35 * Math.sin(t * 2);
    door.edges.opacity = 0.6 + 0.3 * Math.sin(t * 2 + 1);
  });
  return { group: g, anim, fit: 1, offset: [2.3, 0, 0], camPos: CAM, camLook: ORIGIN };
}

/* 2. How it works: a floor plan, with the route drawn step by step to the exit */
function buildDoor(): Spec {
  const g = new THREE.Group();
  const anim: Anim[] = [];
  const W = 4.2, D = 3.0;
  g.rotation.x = -1.05;

  // outer walls with a door gap on the near edge, and one interior wall
  const plan = [
    -W / 2, 0, -D / 2, W / 2, 0, -D / 2,
    W / 2, 0, -D / 2, W / 2, 0, D / 2,
    W / 2, 0, D / 2, 0.6, 0, D / 2,
    -0.2, 0, D / 2, -W / 2, 0, D / 2,
    -W / 2, 0, D / 2, -W / 2, 0, -D / 2,
    -0.8, 0, -D / 2, -0.8, 0, 0.4
  ];
  const planMat = segments(g, plan, WIRE, 0.8);

  const wps = [new THREE.Vector3(-1.6, 0, 1.0), new THREE.Vector3(-0.6, 0, 0.2), new THREE.Vector3(0.6, 0, -0.4), new THREE.Vector3(1.5, 0, -0.9)];
  const curve = new THREE.CatmullRomCurve3(wps);
  const N = 60;
  const pts = curve.getPoints(N);
  const routeGeo = new THREE.BufferGeometry().setFromPoints(pts);
  routeGeo.setDrawRange(0, 0);
  const routeMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.95 });
  g.add(new THREE.Line(routeGeo, routeMat));

  // four step markers along the route, matching the four steps on the page
  const markers: { edges: THREE.LineBasicMaterial; at: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const at = (i + 1) / 4;
    const p = pts[Math.min(N, Math.round(at * N))] ?? new THREE.Vector3();
    const m = edgeBox(g, 0.16, 0.16, 0.16, WIRE, 0.08, p.x, p.y, p.z);
    markers.push({ edges: m.edges, at });
  }

  anim.push((t) => {
    g.rotation.z = Math.sin(t * 0.2) * 0.05;
    const p = (t * 0.1) % 1;
    routeGeo.setDrawRange(0, Math.max(2, Math.floor(p * N)));
    for (const m of markers) m.edges.color.setHex(p >= m.at ? ACCENT : WIRE);
    planMat.opacity = 0.7 + 0.1 * Math.sin(t);
  });
  return { group: g, anim, fit: 1.05, offset: [2.2, 0.1, 0], camPos: [0, 2.6, 8.4], camLook: ORIGIN };
}

/* 3. Room: a furnished room as a CAD drawing, with the exit door lit */
function buildRoom(): Spec {
  const g = new THREE.Group();
  const anim: Anim[] = [];

  floorGrid(g, 7, 0.5, WIRE_DIM, -0.02, 0.25);
  edgeBox(g, 7, 2.6, 0.05, WIRE_DIM, 0.02, 0, 1.3, -3);
  edgeBox(g, 0.05, 2.6, 6, WIRE_DIM, 0.02, -3.5, 1.3, 0);

  const furniture: [number, number, number, number, number, number][] = [
    [2, 0.35, 1.4, -1.6, 0.18, -1.2],   // bed
    [1.8, 0.35, 0.8, 1.4, 0.18, -1.9],  // sofa
    [1.8, 0.5, 0.2, 1.4, 0.55, -2.2],   // sofa back
    [1, 0.06, 0.6, 0.2, 0.6, 0.3],      // table top
    [1, 2.2, 0.55, 2.7, 1.1, -2.6]      // wardrobe
  ];
  for (const [w, h, d, x, y, z] of furniture) edgeBox(g, w, h, d, WIRE, 0.05, x, y, z);

  const door = edgeBox(g, 0.95, 2.1, 0.05, ACCENT, 0.06, -0.6, 1.05, -2.95);
  anim.push((t) => {
    g.rotation.y = -0.25 + Math.sin(t * 0.2) * 0.2;
    door.edges.opacity = 0.65 + 0.3 * Math.sin(t * 1.6);
  });
  return { group: g, anim, fit: 0.7, offset: [1.3, -0.4, 0], camPos: [1.4, 4.4, 7.2], camLook: [0, 1.1, -1] };
}

/* 4. Benefits: a 2x2 grid of dashboard panels, matching the cards, with bars that update */
function buildCubes(): Spec {
  const g = new THREE.Group();
  const anim: Anim[] = [];
  const panels: { edges: THREE.LineBasicMaterial; bars: THREE.Mesh[]; x: number; y: number }[] = [];

  for (let i = 0; i < 4; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = (col - 0.5) * 1.6;
    const y = (0.5 - row) * 1.15;
    const panel = edgeBox(g, 1.45, 0.95, 0.03, WIRE, 0.03, x, y, 0);
    const bars: THREE.Mesh[] = [];
    for (let b = 0; b < 3; b++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.3, 0.02),
        new THREE.MeshBasicMaterial({ color: WIRE_DIM, transparent: true, opacity: 0.85 })
      );
      bar.position.set(x - 0.36 + b * 0.36, y - 0.2, 0.03);
      g.add(bar);
      bars.push(bar);
    }
    panels.push({ edges: panel.edges, bars, x, y });
  }

  anim.push((t) => {
    panels.forEach((p, i) => {
      const lit = Math.sin(t * 1.2 - i * 1.1) > 0.7;
      p.edges.color.setHex(lit ? ACCENT : WIRE);
      p.bars.forEach((bar, b) => {
        const level = 0.6 + 0.4 * Math.abs(Math.sin(t * 0.8 + i * 0.9 + b * 0.7));
        bar.scale.y = level;
      });
    });
  });
  return { group: g, anim, fit: 1, offset: [2.3, 0, 0], camPos: CAM, camLook: ORIGIN };
}

/* 5. Problems: a corridor with a blocked route and a detour, drawn as a schematic */
function buildKnot(): Spec {
  const g = new THREE.Group();
  const anim: Anim[] = [];
  floorGrid(g, 6, 0.5, WIRE_DIM, -0.9, 0.25);
  edgeBox(g, 5, 1.6, 0.06, WIRE, 0.03, 0, -0.1, -0.9);
  edgeBox(g, 5, 1.6, 0.06, WIRE, 0.03, 0, -0.1, 0.9);
  const exit = edgeBox(g, 0.12, 1.2, 1.8, ACCENT, 0.12, 2.5, -0.1, 0);
  const block = edgeBox(g, 0.9, 0.9, 0.9, WARN, 0.12, -0.2, -0.45, 0);

  const blocked = segments(g, [-2.4, -0.9, 0, -0.7, -0.9, 0], WARN, 0.9);
  const detour = new THREE.BufferGeometry().setFromPoints(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.4, -0.9, 0), new THREE.Vector3(-1.0, -0.9, 0.7),
      new THREE.Vector3(0.3, -0.9, 0.85), new THREE.Vector3(2.4, -0.9, 0.2)
    ]).getPoints(40)
  );
  const detourMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9 });
  g.add(new THREE.Line(detour, detourMat));

  anim.push((t) => {
    g.rotation.y = Math.sin(t * 0.18) * 0.3;
    block.edges.opacity = 0.55 + 0.4 * Math.sin(t * 2.4);
    block.fill.opacity = 0.06 + 0.1 * Math.sin(t * 2.4);
    blocked.opacity = 0.4 + 0.4 * Math.sin(t * 2.4);
    detourMat.opacity = 0.5 + 0.4 * Math.sin(t * 1.4);
    exit.edges.opacity = 0.7 + 0.2 * Math.sin(t * 1.6);
  });
  return { group: g, anim, fit: 1, offset: [-2.3, 0, 0], camPos: CAM, camLook: ORIGIN };
}

/* 6. FAQ: four stacked rows; the active row opens, like the accordion */
function buildRings(): Spec {
  const g = new THREE.Group();
  const anim: Anim[] = [];
  const rowH = 0.32, gap = 0.12, rowW = 3.2;
  const rows: { holder: THREE.Group; edges: THREE.LineBasicMaterial; fill: THREE.MeshBasicMaterial }[] = [];
  for (let i = 0; i < 4; i++) {
    const holder = new THREE.Group();
    const geo = new THREE.BoxGeometry(rowW, rowH, 0.03);
    geo.translate(0, -rowH / 2, 0);
    const fill = new THREE.MeshBasicMaterial({ color: WIRE, transparent: true, opacity: 0.03, depthWrite: false });
    holder.add(new THREE.Mesh(geo, fill));
    const edges = new THREE.LineBasicMaterial({ color: WIRE, transparent: true, opacity: 0.9 });
    holder.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edges));
    g.add(holder);
    rows.push({ holder, edges, fill });
  }

  anim.push((t) => {
    const active = Math.floor(t / 2.4) % 4;
    const phase = (t % 2.4) / 2.4;
    const open = Math.sin(Math.PI * Math.min(1, phase * 1.6));
    let y = 0.9;
    rows.forEach((r, i) => {
      const isActive = i === active;
      const grow = isActive ? 1 + 1.2 * Math.max(0, open) : 1;
      r.holder.scale.y = grow;
      r.holder.position.set(0, y, 0);
      r.edges.color.setHex(isActive ? ACCENT : WIRE);
      r.fill.opacity = isActive ? 0.08 : 0.03;
      y -= rowH * grow + gap;
    });
  });
  return { group: g, anim, fit: 1, offset: [2.2, 0.2, 0], camPos: CAM, camLook: ORIGIN };
}

/* 7. Roadmap: a timeline with three milestones, matching the three columns; a pulse reaches each */
function buildPath(): Spec {
  const g = new THREE.Group();
  const anim: Anim[] = [];
  g.rotation.x = -0.2;
  const xs = [-2.4, 0, 2.4];
  segments(g, [-2.6, 0, 0, 2.6, 0, 0], WIRE, 0.8);
  const nodes = xs.map((x) => {
    const n = edgeBox(g, 0.22, 0.22, 0.22, WIRE, 0.1, x, 0, 0);
    segments(g, [x, 0, 0, x, 0.7, 0], WIRE_DIM, 0.6);
    return { edges: n.edges, x };
  });
  const pulse = edgeBox(g, 0.16, 0.16, 0.16, ACCENT, 0.4, -2.4, 0, 0);

  anim.push((t) => {
    const p = (t * 0.18) % 1;
    const x = -2.4 + 4.8 * p;
    pulse.group.position.x = x;
    for (const n of nodes) n.edges.color.setHex(x >= n.x - 0.05 ? ACCENT : WIRE);
    g.rotation.y = Math.sin(t * 0.15) * 0.12;
  });
  return { group: g, anim, fit: 0.85, offset: [0, 1.1, 0], camPos: [0, 1.6, 9], camLook: ORIGIN };
}

/* 8. Footer: a perspective ground grid with a scan line sweeping across it */
function buildBlocks(): Spec {
  const g = new THREE.Group();
  const anim: Anim[] = [];
  g.rotation.x = -1.15;
  floorGrid(g, 14, 0.7, WIRE_DIM, 0, 0.3);
  const sweepMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.04), sweepMat);
  sweep.rotation.x = -Math.PI / 2;
  g.add(sweep);
  anim.push((t) => {
    const p = (t * 0.12) % 1;
    sweep.position.z = -7 + 14 * p;
    sweepMat.opacity = 0.1 + 0.3 * Math.sin(Math.PI * p);
  });
  return { group: g, anim, fit: 0.9, offset: [0, -1.1, 0], camPos: [0, 3.2, 8.8], camLook: [0, -0.4, 0] };
}

/** Builds every section model. */
export function buildModels(): Record<ModelKey, Spec> {
  return {
    core: buildCore(),
    door: buildDoor(),
    room: buildRoom(),
    cubes: buildCubes(),
    knot: buildKnot(),
    rings: buildRings(),
    path: buildPath(),
    blocks: buildBlocks()
  };
}
