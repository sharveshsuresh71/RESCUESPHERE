import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/*
 * RescueSphere section models. Each one shows something from its section's content:
 *   core   - a cut-away home with the escape route to the exit and the meeting point
 *   door   - a floor plan with the route drawn step by step and four step markers
 *   room   - a furnished room with a lit exit door
 *   cubes  - four benefit tiles, each with its own icon
 *   knot   - a blocked corridor, with a warning and a detour
 *   rings  - FAQ cards; the active card opens
 *   path   - a roadmap: three platforms, a route between them, a pulse reaching each
 *   blocks - a small neighbourhood with a meeting point
 * Models assemble into place on each transition (Spec.assemble) and rest still otherwise.
 */
export type ModelKey = 'guide' | 'door' | 'room' | 'cubes' | 'knot' | 'rings' | 'path' | 'blocks';
export type V3 = [number, number, number];
export type Anim = (t: number) => void;

export interface Spec {
  group: THREE.Group;
  /** small looping signal animations (pulses), t = seconds */
  anim: Anim[];
  /** 0 = parts scattered, 1 = assembled */
  assemble: (p: number) => void;
  /** optional: 0 = whole, 1 = split apart (driven by hover or tap) */
  explode?: (h: number) => void;
  fit: number;
  offset: V3;
  camPos: V3;
  camLook: V3;
}

const C = {
  wall: 0xe9e4da, wood: 0xb08260, woodDark: 0x6b4a2f, fabric: 0x3d6b62, fabricLt: 0x5f8f83,
  linen: 0xe4e0d5, cushion: 0xc9b99c, metal: 0x596275, glass: 0x9fb8d6, terra: 0xb5673b,
  plant: 0x3f7d55, dark: 0x161b2a, floor: 0x1a1f2e, lime: 0xb3e04a, peach: 0xf0a06a, mint: 0x46c489,
  rug: 0x2d3a4f, tile: 0x1b2236, cardA: 0x1f2740, cardB: 0x2a3556
};
const CAM_DEFAULT: V3 = [0, 0.6, 9.4];
const ORIGIN: V3 = [0, 0, 0];

function clamp01(v: number): number { return Math.min(1, Math.max(0, v)); }
function easeOut(u: number): number { return 1 - Math.pow(1 - u, 3); }

/** Assembles parts: each starts scattered and moves to its home position as p goes 0 → 1. */
class Parts {
  private readonly items: { obj: THREE.Object3D; home: THREE.Vector3; away: THREE.Vector3; rank: number; base: THREE.Vector3 }[] = [];
  add<T extends THREE.Object3D>(obj: T): T {
    const i = this.items.length;
    const seed = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    const f = seed - Math.floor(seed);
    const dir = new THREE.Vector3(Math.sin(f * 6.283), 0.7 + f * 0.6, Math.cos(f * 6.283)).normalize().multiplyScalar(1.0);
    const home = obj.position.clone();
    this.items.push({ obj, home, away: home.clone().add(dir), rank: i, base: obj.scale.clone() });
    return obj;
  }
  set(p: number): void {
    for (const it of this.items) {
      const k = clamp01(p * 1.45 - it.rank * 0.012);
      const e = easeOut(k);
      it.obj.position.lerpVectors(it.away, it.home, e);
      it.obj.scale.copy(it.base).multiplyScalar(0.55 + 0.45 * e);
    }
  }
}

function std(color: number, roughness: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
}
function phys(color: number, roughness: number, extra: THREE.MeshPhysicalMaterialParameters = {}): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.3, ...extra });
}
function glow(color: number, intensity: number): THREE.MeshStandardMaterial {
  return std(color, 0.35, { emissive: color, emissiveIntensity: intensity });
}
function shadowed<T extends THREE.Mesh>(m: T): T { m.castShadow = true; m.receiveShadow = true; return m; }

/** Rounded box: softer, more finished than a plain cube. */
function rbox(w: number, h: number, d: number, r: number): RoundedBoxGeometry {
  return new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2, h / 2, d / 2));
}

/** Place a mesh at (x,y,z), add it to the group, and register it as an assembling part. */
function put(g: THREE.Group, parts: Parts, m: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh {
  m.position.set(x, y, z);
  shadowed(m);
  g.add(m);
  parts.add(m);
  return m;
}

/** Wood planks, drawn once and shared by every floor. */
let woodMap: THREE.CanvasTexture | null = null;
function woodMat(): THREE.MeshStandardMaterial {
  if (typeof document !== 'undefined' && !woodMap) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    if (ctx) {
      for (let i = 0; i < 8; i++) {
        const shade = 0.92 + ((i * 37) % 13) / 100;
        ctx.fillStyle = `rgb(${Math.round(176 * shade)},${Math.round(130 * shade)},${Math.round(92 * shade)})`;
        ctx.fillRect(0, i * 64, 512, 64);
        ctx.fillStyle = 'rgba(60,36,20,0.35)';
        ctx.fillRect(0, i * 64, 512, 2);
        ctx.fillRect(((i * 97) % 400) + 40, i * 64, 2, 64);
      }
    }
    woodMap = new THREE.CanvasTexture(c);
    woodMap.colorSpace = THREE.SRGBColorSpace;
    woodMap.wrapS = woodMap.wrapT = THREE.RepeatWrapping;
    woodMap.repeat.set(2, 2);
  }
  return std(C.wood, 0.55, { map: woodMap ?? null });
}

/* 2. How it works: a floor plan. The route is drawn step by step, four markers light as it passes. */
function buildDoor(): Spec {
  const g = new THREE.Group();
  const parts = new Parts();
  const anim: Anim[] = [];
  g.rotation.x = -1.0;
  const wallM = std(C.wall, 0.95);
  const WH = 0.16, T = 0.1;

  put(g, parts, new THREE.Mesh(rbox(4.6, 0.08, 3.4, 0.02), woodMat()), 0, -0.04, 0);
  put(g, parts, new THREE.Mesh(new THREE.BoxGeometry(4.6, WH, T), wallM), 0, WH / 2, -1.7);
  put(g, parts, new THREE.Mesh(new THREE.BoxGeometry(T, WH, 3.4), wallM), -2.3, WH / 2, 0);
  put(g, parts, new THREE.Mesh(new THREE.BoxGeometry(T, WH, 3.4), wallM), 2.3, WH / 2, 0);
  put(g, parts, new THREE.Mesh(new THREE.BoxGeometry(1.6, WH, T), wallM), -1.5, WH / 2, 1.7);
  put(g, parts, new THREE.Mesh(new THREE.BoxGeometry(1.6, WH, T), wallM), 1.5, WH / 2, 1.7);
  put(g, parts, new THREE.Mesh(new THREE.BoxGeometry(T, WH, 1.5), wallM), -0.5, WH / 2, -0.95);
  put(g, parts, new THREE.Mesh(new THREE.BoxGeometry(T, WH, 0.9), wallM), -0.5, WH / 2, 1.25);

  const routePts = [new THREE.Vector3(-1.6, 0.1, -1.0), new THREE.Vector3(-1.0, 0.1, 0.5), new THREE.Vector3(-0.2, 0.1, 0.55), new THREE.Vector3(0.8, 0.1, 1.1), new THREE.Vector3(1.0, 0.1, 2.4)];
  const curve = new THREE.CatmullRomCurve3(routePts);
  const routeGeo = new THREE.TubeGeometry(curve, 120, 0.03, 8, false);
  const indexCount = routeGeo.index?.count ?? 0;
  routeGeo.setDrawRange(0, 0);
  const routeMat = glow(C.peach, 1.0);
  put(g, parts, new THREE.Mesh(routeGeo, routeMat), 0, 0, 0);

  const markers: THREE.MeshStandardMaterial[] = [];
  [0.25, 0.5, 0.75, 1].forEach((f) => {
    const mat = std(C.tile, 0.4, { emissive: C.mint, emissiveIntensity: 0 });
    const p = curve.getPoint(f);
    put(g, parts, new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), mat), p.x, 0.1, p.z);
    markers.push(mat);
  });

  anim.push((t) => {
    const p = (t * 0.1) % 1;
    const n = Math.max(3, Math.floor(p * indexCount / 3) * 3);
    routeGeo.setDrawRange(0, n);
    [0.25, 0.5, 0.75, 1].forEach((f, i) => {
      const mat = markers[i];
      if (mat) mat.emissiveIntensity = p >= f ? 1.6 : 0;
    });
  });
  return { group: g, anim, assemble: (p) => parts.set(p), fit: 1.05, offset: [2.2, 0.1, 0], camPos: [0, 6.2, 4.6], camLook: [0, 0, 0] };
}

/* 3. Room: a furnished room, shadows on, with the exit door lit. */
function buildRoom(): Spec {
  const g = new THREE.Group();
  const parts = new Parts();
  const anim: Anim[] = [];
  const wallM = std(C.wall, 0.95);

  put(g, parts, new THREE.Mesh(new THREE.PlaneGeometry(7, 6), woodMat()), 0, 0, 0).rotation.x = -Math.PI / 2;
  put(g, parts, new THREE.Mesh(new THREE.BoxGeometry(7, 2.7, 0.12), wallM), 0, 1.35, -3);
  put(g, parts, new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.7, 6), wallM), -3.5, 1.35, 0);
  // window and frame on the back wall
  put(g, parts, new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), new THREE.MeshPhysicalMaterial({ color: C.glass, roughness: 0.05, transparent: true, opacity: 0.45 })), 1.8, 1.5, -2.93);
  // rug
  put(g, parts, new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.02, 48), std(C.rug, 0.95)), 0.4, 0.01, 0.2);
  // sofa with cushions, coffee table, and a floor lamp
  put(g, parts, shadowed(new THREE.Mesh(rbox(1.9, 0.36, 0.85, 0.12), std(C.fabric, 0.85))), 1.4, 0.2, -1.9);
  put(g, parts, shadowed(new THREE.Mesh(rbox(1.9, 0.55, 0.24, 0.12), std(C.fabric, 0.85))), 1.4, 0.55, -2.25);
  put(g, parts, shadowed(new THREE.Mesh(rbox(0.82, 0.16, 0.62, 0.06), std(C.cushion, 0.9))), 0.95, 0.44, -1.75);
  put(g, parts, shadowed(new THREE.Mesh(rbox(0.82, 0.16, 0.62, 0.06), std(C.cushion, 0.9))), 1.85, 0.44, -1.75);
  put(g, parts, shadowed(new THREE.Mesh(rbox(1.1, 0.06, 0.62, 0.02), woodMat())), 0.4, 0.5, 0.3);
  const legs: [number, number][] = [[-0.1, 0.0], [0.9, 0.0], [-0.1, 0.6], [0.9, 0.6]];
  for (const [x, z] of legs) {
    put(g, parts, shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.46, 12), std(C.woodDark, 0.5))), x, 0.23, z);
  }
  put(g, parts, shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 24), std(C.metal, 0.4))), -2.2, 0.01, 1.4);
  put(g, parts, shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 10), std(C.metal, 0.4))), -2.2, 0.76, 1.4);
  const shade = put(g, parts, new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.34, 24, 1, true), std(0xfff1d6, 0.6, { emissive: 0xffd9a0, emissiveIntensity: 0.7, side: THREE.DoubleSide, transparent: true, opacity: 0.92 })), -2.2, 1.6, 1.4);
  // wardrobe with handles, bed, and the exit door
  put(g, parts, shadowed(new THREE.Mesh(rbox(1.0, 2.2, 0.55, 0.03), std(C.woodDark, 0.6))), 2.7, 1.1, -2.55);
  put(g, parts, new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.03), std(0xb8c2d0, 0.3, { metalness: 0.6 })), 2.45, 1.1, -2.2);
  put(g, parts, new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.03), std(0xb8c2d0, 0.3, { metalness: 0.6 })), 2.95, 1.1, -2.2);
  const doorGlow = glow(C.lime, 1.3);
  put(g, parts, new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.1, 0.06), doorGlow), -0.8, 1.05, -2.94);
  put(g, parts, new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.12), std(C.woodDark, 0.6)), -0.8, 2.15, -2.92);

  const lamp = new THREE.PointLight(0xffd9a0, 2.5, 6, 1.6);
  lamp.position.set(-2.2, 1.6, 1.4);
  g.add(lamp);
  const exitLight = new THREE.PointLight(C.lime, 1.4, 4, 1.6);
  exitLight.position.set(-0.8, 1.0, -2.4);
  g.add(exitLight);

  anim.push((t) => {
    doorGlow.emissiveIntensity = 1.1 + Math.sin(t * 2.2) * 0.25;
    exitLight.intensity = 1.2 + Math.sin(t * 2.2) * 0.3;
    shade.material instanceof THREE.MeshStandardMaterial && (shade.material.emissiveIntensity = 0.7 + Math.sin(t * 1.3) * 0.05);
  });
  return { group: g, anim, assemble: (p) => parts.set(p), fit: 0.66, offset: [1.3, -0.4, 0], camPos: [1.5, 4.4, 6.6], camLook: [0, 1.1, -1] };
}

/* 4. Benefits: four tiles in a 2x2 grid, matching the cards. Each tile has its own icon. */
function buildCubes(): Spec {
  const g = new THREE.Group();
  const parts = new Parts();
  const anim: Anim[] = [];
  const icons: THREE.Object3D[] = [];
  const tileMat = phys(C.tile, 0.3, { clearcoat: 1, clearcoatRoughness: 0.2 });
  const tiles: [number, number][] = [[-0.95, 0.6], [0.95, 0.6], [-0.95, -0.6], [0.95, -0.6]];
  tiles.forEach(([x, y], i) => {
    const holder = new THREE.Group();
    holder.position.set(x, y, 0);
    holder.add(shadowed(new THREE.Mesh(rbox(1.7, 1.0, 0.1, 0.12), tileMat)));
    const icon = new THREE.Group();
    icon.position.set(-0.5, 0, 0.14);
    if (i === 0) {
      icon.add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 16, 48), glow(C.lime, 1.0)));
    } else if (i === 1) {
      icon.add(shadowed(new THREE.Mesh(rbox(0.34, 0.34, 0.34, 0.06), glow(C.peach, 0.8))));
    } else if (i === 2) {
      [[-0.1, 0], [0.1, 0.06], [0.0, -0.1]].forEach(([dx, dy]) => {
        icon.add(shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), glow(C.mint, 0.8))).translateX(dx ?? 0).translateY(dy ?? 0));
      });
    } else {
      icon.add(shadowed(new THREE.Mesh(rbox(0.3, 0.24, 0.1, 0.03), std(C.metal, 0.4, { metalness: 0.5 }))).translateY(-0.04));
      const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.028, 12, 32, Math.PI), std(C.metal, 0.4, { metalness: 0.5 }));
      shackle.position.set(0, 0.1, 0);
      icon.add(shackle);
    }
    holder.add(icon);
    icons.push(icon);
    g.add(holder);
    parts.add(holder);
  });
  anim.push((t) => {
    icons.forEach((ic, i) => { ic.rotation.y = Math.sin(t * 0.6 + i) * 0.5; });
  });
  return { group: g, anim, assemble: (p) => parts.set(p), fit: 1, offset: [2.3, 0, 0], camPos: CAM_DEFAULT, camLook: ORIGIN };
}

/* 5. Problems: a corridor with a blocked route (amber), a warning, and a detour (lime). */
function buildKnot(): Spec {
  const g = new THREE.Group();
  const parts = new Parts();
  const anim: Anim[] = [];
  const wallM = std(C.wall, 0.95);
  put(g, parts, new THREE.Mesh(rbox(6.2, 0.1, 3.0, 0.02), woodMat()), 0, -0.05, 0);
  put(g, parts, new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.0, 0.14), wallM), 0, 0.5, -1.3);
  put(g, parts, new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.0, 0.14), wallM), 0, 0.5, 1.3);
  put(g, parts, new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 3.0), wallM), 3.05, 0.5, 0);
  // the blocking sofa in the corridor
  const block = put(g, parts, shadowed(new THREE.Mesh(rbox(1.3, 0.55, 0.75, 0.12), std(0x6e5246, 0.85))), -0.2, 0.28, 0.25);
  const warnMat = glow(C.peach, 1.2);
  const warn = put(g, parts, new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 4), warnMat), -0.2, 0.9, 0.25);
  // the direct route, dimmed, and the detour around the sofa
  const direct = new THREE.LineBasicMaterial({ color: C.peach, transparent: true, opacity: 0.35 });
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-2.7, 0.08, 0.25), new THREE.Vector3(2.6, 0.08, 0.25)]), direct));
  const detourCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.7, 0.08, 0.25), new THREE.Vector3(-1.4, 0.08, -0.6), new THREE.Vector3(0.4, 0.08, -0.62),
    new THREE.Vector3(1.6, 0.08, -0.1), new THREE.Vector3(2.6, 0.08, 0.25)
  ]);
  const detourMat = glow(C.lime, 1.0);
  put(g, parts, new THREE.Mesh(new THREE.TubeGeometry(detourCurve, 120, 0.03, 8, false), detourMat), 0, 0, 0);
  const exit = put(g, parts, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.6), glow(C.lime, 1.2)), 2.9, 0.4, 0.25);
  anim.push((t) => {
    warn.position.y = 0.9 + Math.sin(t * 2.4) * 0.03;
    warnMat.emissiveIntensity = 0.8 + 0.5 * Math.sin(t * 2.4);
    detourMat.emissiveIntensity = 0.8 + 0.4 * Math.sin(t * 1.4);
    direct.opacity = 0.2 + 0.2 * Math.sin(t * 2.4);
    block.rotation.y = Math.sin(t * 0.3) * 0.02;
    exit.scale.y = 1 + Math.sin(t * 1.6) * 0.03;
  });
  return { group: g, anim, assemble: (p) => parts.set(p), fit: 0.95, offset: [-2.3, 0, 0], camPos: [0, 4.2, 7.2], camLook: [0, 0.2, 0] };
}

/* 6. FAQ: four question cards, stacked. The active card opens and shows its answer glow. */
function buildRings(): Spec {
  const g = new THREE.Group();
  const anim: Anim[] = [];
  const rowH = 0.42, gap = 0.1, rowW = 3.4;
  const cardMat = phys(C.cardA, 0.4);
  const rows: { holder: THREE.Group; card: THREE.Mesh; bar: THREE.MeshStandardMaterial; answer: THREE.Mesh }[] = [];
  for (let i = 0; i < 4; i++) {
    const holder = new THREE.Group();
    const card = new THREE.Mesh(rbox(rowW, 1, 0.08, 0.08), cardMat);
    card.geometry.translate(0, -0.5, 0);
    shadowed(card);
    holder.add(card);
    const bar = std(C.wall, 0.4);
    const barM = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.03), bar);
    barM.position.set(-rowW / 2 + 0.25, -rowH / 2, 0.05);
    holder.add(barM);
    const answer = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), glow(C.mint, 0));
    answer.position.set(rowW / 2 - 0.3, -rowH / 2, 0.06);
    holder.add(answer);
    g.add(holder);
    rows.push({ holder, card, bar: bar, answer });
  }
  anim.push((t) => {
    const active = Math.floor(t / 2.4) % 4;
    const phase = (t % 2.4) / 2.4;
    const open = Math.sin(Math.PI * Math.min(1, phase * 1.6));
    let y = 0.85;
    rows.forEach((r, i) => {
      const isActive = i === active;
      const grow = isActive ? 1 + 0.9 * Math.max(0, open) : 1;
      r.holder.position.y = y;
      r.card.scale.y = rowH * grow;
      r.answer.material instanceof THREE.MeshStandardMaterial && (r.answer.material.emissiveIntensity = isActive ? Math.max(0, open) * 1.6 : 0);
      r.bar.color.setHex(isActive ? C.lime : C.wall);
      y -= rowH * grow + gap;
    });
  });
  // rows reflow every frame, so the FAQ assembles by scale rather than by part position
  return { group: g, anim, assemble: (p) => g.scale.setScalar(Math.max(0.001, easeOut(p))), fit: 1, offset: [2.2, 0.2, 0], camPos: CAM_DEFAULT, camLook: ORIGIN };
}

/* 7. Roadmap: three platforms (Now, Next, Later), a route stepping between them, a pulse reaching each. */
function buildPath(): Spec {
  const g = new THREE.Group();
  const parts = new Parts();
  const anim: Anim[] = [];
  g.rotation.x = -0.2;
  const xs = [-2.4, 0, 2.4], ys = [-0.5, 0, 0.5];
  const platforms: THREE.MeshStandardMaterial[] = [];
  xs.forEach((x, i) => {
    const m = std(C.tile, 0.45, { emissive: C.mint, emissiveIntensity: 0 });
    platforms.push(m);
    put(g, parts, shadowed(new THREE.Mesh(rbox(1.7, 0.2, 1.3, 0.08), m)), x, (ys[i] ?? 0) - 0.1, 0);
    put(g, parts, shadowed(new THREE.Mesh(rbox(0.6, 0.5, 0.6, 0.08), std(C.wall, 0.6))), x, (ys[i] ?? 0) + 0.35, 0);
  });
  const pts = xs.map((x, i) => new THREE.Vector3(x, (ys[i] ?? 0) + 0.7, 0));
  const curve = new THREE.CatmullRomCurve3(pts);
  const routeMat = glow(C.peach, 0.9);
  put(g, parts, new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.03, 8, false), routeMat), 0, 0, 0);
  const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), glow(0xffffff, 2));
  g.add(pulse);
  anim.push((t) => {
    const p = (t * 0.16) % 1;
    pulse.position.copy(curve.getPointAt(p));
    platforms.forEach((m, i) => {
      const f = (i + 0.5) / 3;
      m.emissiveIntensity = p >= f - 0.02 ? 0.6 : 0.05;
    });
    routeMat.emissiveIntensity = 0.8 + 0.3 * Math.sin(t * 2);
  });
  return { group: g, anim, assemble: (p) => parts.set(p), fit: 0.9, offset: [0, 1.0, 0], camPos: [0, 1.6, 9], camLook: ORIGIN };
}

/* 8. Footer: a small neighbourhood with a meeting point, on a ground plate. */
function buildBlocks(): Spec {
  const g = new THREE.Group();
  const parts = new Parts();
  const anim: Anim[] = [];
  put(g, parts, shadowed(new THREE.Mesh(rbox(7.2, 0.14, 3.6, 0.04), std(C.floor, 0.9))), 0, -0.07, 0);
  [-2.0, 0, 2.0].forEach((x, i) => {
    put(g, parts, shadowed(new THREE.Mesh(rbox(0.9, 0.7, 0.8, 0.05), std(i === 1 ? C.wall : C.cushion, 0.8))), x, 0.35, -0.3);
    const roof = put(g, parts, shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.42, 4), std(C.terra, 0.7))), x, 0.91, -0.3);
    roof.rotation.y = Math.PI / 4;
  });
  const beaconMat = glow(C.lime, 1.3);
  put(g, parts, new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 10), std(C.metal, 0.4)), 0, 0.65, 1.0);
  const beacon = put(g, parts, new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), beaconMat), 0, 1.35, 1.0);
  const ringMat = new THREE.MeshBasicMaterial({ color: C.lime, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const ring = put(g, parts, new THREE.Mesh(new THREE.RingGeometry(0.3, 0.34, 48), ringMat), 0, 0.01, 1.0);
  ring.rotation.x = -Math.PI / 2;
  const route = new THREE.CatmullRomCurve3([new THREE.Vector3(-2.0, 0.03, 0.9), new THREE.Vector3(-0.8, 0.03, 1.4), new THREE.Vector3(0, 0.03, 1.0)]);
  put(g, parts, new THREE.Mesh(new THREE.TubeGeometry(route, 40, 0.02, 8, false), glow(C.mint, 0.6)), 0, 0, 0);
  anim.push((t) => {
    const s = 1 + 0.6 * ((t * 0.5) % 1);
    ring.scale.set(s, s, 1);
    ringMat.opacity = 0.5 * (1 - ((t * 0.5) % 1));
    beacon.position.y = 1.35 + Math.sin(t * 1.5) * 0.02;
    beaconMat.emissiveIntensity = 1.1 + 0.3 * Math.sin(t * 1.5);
  });
  return { group: g, anim, assemble: (p) => parts.set(p), fit: 0.9, offset: [0, -1.0, 0], camPos: [0, 3.4, 8.6], camLook: [0, -0.3, 0] };
}

/** Builds every section model. */
export function buildModels(): Record<ModelKey, Spec> {
  return {
    guide: buildGuide(),
    door: buildDoor(),
    room: buildRoom(),
    cubes: buildCubes(),
    knot: buildKnot(),
    rings: buildRings(),
    path: buildPath(),
    blocks: buildBlocks()
  };
}

/* Hero: a furnished room with a guided way out. A glowing route runs across the floor from the bed to the
   exit door. Arrows along it light up in turn towards the door, the exit is lit, and a meeting point waits
   outside. */
export function buildGuide(): Spec {
  const g = new THREE.Group();
  const anim: Anim[] = [];
  const wallM = std(C.wall, 0.95);
  const fabricM = std(C.fabric, 0.85);
  const fabricLt = std(C.fabricLt, 0.9);
  const cushionM = std(C.cushion, 0.9);
  const woodDark = std(C.woodDark, 0.6);
  const linen = std(C.linen, 0.9);
  const T = 0.14, H = 2.6;
  const WX = 3.0, WZ = 2.3;       // room half sizes
  const DOOR_X = 1.8;             // exit door position on the front wall

  const add = <M extends THREE.Object3D>(o: M, x: number, y: number, z: number): M => {
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  const block = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh =>
    add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)), x, y, z);
  const soft = (w: number, h: number, d: number, r: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh =>
    add(shadowed(new THREE.Mesh(rbox(w, h, d, r), m)), x, y, z);

  // floor and paving outside the exit
  soft(6.4, 0.16, 4.8, 0.02, woodMat(), 0, -0.08, 0);
  block(2.4, 0.05, 2.2, std(0xcfc6b6, 0.9), DOOR_X, 0.02, 3.3);

  // walls: back, left and right; the front wall has an opening for the exit door
  block(2 * WX, H, T, wallM, 0, H / 2, -WZ + T / 2);
  block(T, H, 2 * WZ, wallM, -WX + T / 2, H / 2, 0);
  block(T, H, 2 * WZ, wallM, WX - T / 2, H / 2, 0);
  const openL = DOOR_X - 0.45, openR = DOOR_X + 0.45;
  // front wall is cut down to a low ledge so the room is visible; the door keeps its full height
  const FH = 0.9;
  block(openL + WX, FH, T, wallM, (openL - WX) / 2, FH / 2, WZ - T / 2);
  block(WX - openR, FH, T, wallM, (WX + openR) / 2, FH / 2, WZ - T / 2);

  // exit door: a leaf on a hinge, opened outward, with a lit exit sign above
  const hinge = new THREE.Group();
  hinge.rotation.y = -1.0;
  const leaf = shadowed(new THREE.Mesh(rbox(0.9, 2.1, 0.06, 0.01), woodDark));
  leaf.position.set(0.45, 1.05, 0);
  hinge.add(leaf);
  add(hinge, openL, 0, WZ);
  const exitSign = add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.05), glow(C.lime, 1.4))), DOOR_X, 2.25, WZ + 0.03);

  // bedroom corner: bed with headboard, pillow and blanket
  soft(1.6, 0.35, 2.1, 0.06, woodDark, -1.9, 0.17, -1.4);
  soft(1.5, 0.2, 2.0, 0.08, linen, -1.9, 0.45, -1.4);
  soft(1.6, 0.8, 0.12, 0.05, woodDark, -1.9, 0.5, -2.35);
  soft(0.6, 0.16, 0.4, 0.06, std(0xffffff, 0.9), -2.3, 0.62, -2.0);
  soft(1.55, 0.06, 1.2, 0.03, fabricLt, -1.9, 0.57, -0.8);

  // sofa against the right wall, with cushions
  soft(0.9, 0.4, 1.9, 0.1, fabricM, 2.4, 0.2, -0.6);
  soft(0.22, 0.6, 1.9, 0.1, fabricM, 2.7, 0.5, -0.6);
  soft(0.7, 0.14, 0.6, 0.05, cushionM, 2.35, 0.47, -1.1);
  soft(0.7, 0.14, 0.6, 0.05, cushionM, 2.35, 0.47, -0.1);

  // rug, coffee table, plant
  add(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.02, 40), std(C.rug, 0.95))), 0.6, 0.01, 0.5);
  soft(1.0, 0.06, 0.6, 0.02, woodMat(), 0.4, 0.42, -0.9);
  add(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.36, 18), std(C.terra, 0.8))), -2.5, 0.18, 1.6);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leafMesh = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), std(C.plant, 0.7)));
    leafMesh.scale.set(0.7, 1.4, 0.4);
    add(leafMesh, -2.5 + Math.cos(a) * 0.15, 0.62 + (i % 3) * 0.12, 1.6 + Math.sin(a) * 0.15);
  }

  // guided route across the floor: from the bed, through the room, out of the exit door
  const route = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.2, 0.1, -0.9),
    new THREE.Vector3(-0.4, 0.1, -0.2),
    new THREE.Vector3(0.6, 0.1, 0.6),
    new THREE.Vector3(1.4, 0.1, 1.7),
    new THREE.Vector3(DOOR_X, 0.1, WZ + 0.2),
    new THREE.Vector3(DOOR_X, 0.1, 3.4)
  ]);
  const routeMat = glow(C.peach, 1.0);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(route, 200, 0.05, 10, false), routeMat));

  // arrows along the route; each lights in turn so the eye is pulled towards the door
  const ARROWS = 7;
  const arrowMats: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < ARROWS; i++) {
    const u = 0.1 + (i / (ARROWS - 1)) * 0.72;
    const p = route.getPointAt(u);
    const tan = route.getTangentAt(u);
    const m = std(C.peach, 0.35, { emissive: C.peach, emissiveIntensity: 0.2 });
    arrowMats.push(m);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 3), m);
    cone.rotation.x = Math.PI / 2;
    const arrow = new THREE.Group();
    arrow.add(cone);
    arrow.position.set(p.x, 0.12, p.z);
    arrow.rotation.y = Math.atan2(tan.x, tan.z);
    g.add(arrow);
  }

  // meeting point outside the door
  block(1.0, 0.02, 1.0, std(C.tile, 0.9), DOOR_X, 0.01, 4.0);
  block(0.04, 0.6, 0.04, std(C.metal, 0.5), DOOR_X, 0.31, 4.0);
  const marker = add(shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), glow(C.mint, 1.6))), DOOR_X, 0.66, 4.0);

  anim.push((t) => {
    arrowMats.forEach((m, i) => {
      // a soft wave travels from the bed towards the door
      const wave = Math.max(0, Math.sin(t * 2.2 - i * 0.7));
      m.emissiveIntensity = 0.2 + 1.4 * wave * wave * wave;
    });
    routeMat.emissiveIntensity = 0.8 + 0.2 * Math.sin(t * 1.6);
    exitSign.scale.x = 1 + 0.03 * Math.sin(t * 2.4);
    marker.scale.setScalar(1 + 0.06 * Math.sin(t * 1.8));
  });

  return {
    group: g,
    anim,
    assemble: () => {},
    fit: 1.1,
    offset: [0, 0, 0],
    camPos: [0.4, 9.2, 12.5],
    camLook: [0.2, 0.6, 0.4]
  };
}
