import * as THREE from 'three';
import type { RoomPlan, RoomObject } from '../core/types';

export type ViewPreset = 'iso' | 'top' | 'front' | 'fit';

const BACKGROUND = 0x0c0f26;
const WALL_COLOR = 0xdfe5f5;
const WALL_HEIGHT = 2.4;
const WALL_THICKNESS = 0.1;
const EXIT_PRIMARY = 0x29d8ff;
const EXIT_ALTERNATIVE = 0x7c5cf0;
const OBSTACLE = 0xf0a84a;
const ROUTE_A = 0x5cf2ff;
const ROUTE_B = 0xa58bff;

interface Animated { update: (t: number) => void }

function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

/** Procedural wood-plank texture so the floor reads as real flooring, not a flat colour. */
function makeWoodTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  if (g) {
    const planks = 8;
    const ph = 512 / planks;
    for (let i = 0; i < planks; i++) {
      const s = 0.9 + Math.random() * 0.16;
      g.fillStyle = `rgb(${Math.round(154 * s)},${Math.round(118 * s)},${Math.round(86 * s)})`;
      g.fillRect(0, i * ph, 512, ph);
      for (let k = 0; k < 6; k++) {
        g.fillStyle = `rgba(60,36,18,${0.05 + Math.random() * 0.07})`;
        g.fillRect(0, i * ph + Math.random() * ph, 512, 1 + Math.random() * 2);
      }
      g.fillStyle = 'rgba(40,24,12,0.45)';
      g.fillRect(0, i * ph, 512, 2);
      g.fillRect(Math.random() * 512, i * ph, 2, ph);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export class RoomScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly roomGroup = new THREE.Group();
  private readonly routeGroup = new THREE.Group();
  /** Holds the room and routes. In an immersive session it is moved in front of the viewer. */
  private readonly world = new THREE.Group();
  private readonly clock = new THREE.Clock();
  private readonly animated: Animated[] = [];
  private readonly target = new THREE.Vector3(0, 0.6, 0);
  private readonly key: THREE.DirectionalLight;
  private readonly floorTexture: THREE.CanvasTexture;
  private orbit = { theta: 0.78, phi: 0.95, r: 9 };
  private goal = { theta: 0.78, phi: 0.95, r: 9 };
  private roomSize = { w: 0, l: 0 };
  private framed = false;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color(BACKGROUND);
    this.scene.fog = new THREE.Fog(BACKGROUND, 14, 34);

    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1b1f4f, 0.75));

    this.key = new THREE.DirectionalLight(0xffffff, 1.6);
    this.key.position.set(4, 9, 6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    const sc = this.key.shadow.camera;
    sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 36;
    this.key.shadow.bias = -0.0005;

    const rim = new THREE.DirectionalLight(0x8ea0ff, 0.6);
    rim.position.set(-6, 4, -7);

    this.floorTexture = makeWoodTexture();
    this.world.add(this.roomGroup, this.routeGroup);
    this.scene.add(this.key, rim, this.world);
    this.createGrid();
    this.enableOrbit();
    this.renderer.setAnimationLoop(this.update);
  }

  /** Rebuilds the room from the plan. Routes, exits and obstacles are animated each frame. */
  updateRoom(plan: RoomPlan): void {
    this.clearGroup(this.roomGroup);
    this.clearGroup(this.routeGroup);
    this.animated.length = 0;

    const width = plan.roomDimensions.widthMeters ?? 4;
    const length = plan.roomDimensions.lengthMeters ?? 5;
    if (!this.framed || width !== this.roomSize.w || length !== this.roomSize.l) {
      this.roomSize = { w: width, l: length };
      this.framed = true;
      this.frame();
    }

    this.buildFloorAndWalls(width, length);

    for (const object of plan.roomObjects) this.addRoomObject(object, width, length);
    for (const exit of plan.exits) this.addExitBeacon(exit.position.x, exit.position.z, exit.type === 'primary' ? EXIT_PRIMARY : EXIT_ALTERNATIVE);
    for (const obstacle of plan.obstacles) this.addObstacle(obstacle.position.x, obstacle.position.z);

    plan.routes.forEach((route, index) => {
      const exit = plan.exits.find((candidate) => candidate.id === route.exitId);
      if (!exit || route.routePoints.length < 2) return;
      this.addRoute(route.routePoints, route.label === 'Route A' ? ROUTE_A : ROUTE_B, index);
      if (index === 0) this.addYouMarker(route.startPoint.x, route.startPoint.z);
    });
  }

  setPassthroughMode(enabled: boolean): void {
    this.scene.background = enabled ? null : new THREE.Color(BACKGROUND);
    this.scene.fog = enabled ? null : new THREE.Fog(BACKGROUND, 14, 34);
  }

  /**
   * In an immersive session the viewer's pose comes from the headset, so the
   * room is moved about 2.5 m in front of the floor origin (1 unit = 1 m).
   * Passing false restores the desktop placement.
   */
  setImmersiveLayout(immersive: boolean): void {
    this.world.position.set(0, 0, immersive ? -2.5 : 0);
  }

  /** Smoothly moves the camera to a preset: 3D, top-down, side, or fitted to the room. */
  setView(view: ViewPreset): void {
    if (view === 'fit') this.frame();
    if (view === 'iso' || view === 'fit') { this.goal.theta = 0.78; this.goal.phi = 0.95; }
    if (view === 'top') { this.goal.theta = 0; this.goal.phi = 0.04; }
    if (view === 'front') { this.goal.theta = 0; this.goal.phi = 1.35; }
  }

  private frame(): void {
    const span = Math.max(this.roomSize.w, this.roomSize.l, 3);
    this.goal.r = clamp(span * 1.5 + 3.6, 4, 16);
    this.target.set(0, 0.6, 0);
  }

  private buildFloorAndWalls(width: number, length: number): void {
    this.floorTexture.repeat.set(width / 1.6, length / 1.6);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, length),
      new THREE.MeshStandardMaterial({ map: this.floorTexture, roughness: 0.72, metalness: 0.02 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.roomGroup.add(floor);

    const wallMaterial = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.92 });
    const transparentWall = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.92, transparent: true, opacity: 0.3 });
    const addWall = (w: number, d: number, x: number, z: number, material: THREE.Material) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_HEIGHT, d), material);
      wall.position.set(x, WALL_HEIGHT / 2, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.roomGroup.add(wall);
    };
    addWall(width + WALL_THICKNESS, WALL_THICKNESS, 0, -length / 2, wallMaterial);
    addWall(WALL_THICKNESS, length, -width / 2, 0, wallMaterial);
    addWall(width + WALL_THICKNESS, WALL_THICKNESS, 0, length / 2, transparentWall);
    addWall(WALL_THICKNESS, length, width / 2, 0, transparentWall);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.02, length),
      new THREE.MeshStandardMaterial({ color: 0x0a0d22, roughness: 1 })
    );
    base.position.y = -0.011;
    base.receiveShadow = true;
    this.roomGroup.add(base);
  }

  private addRoomObject(object: RoomObject, width: number, length: number): void {
    const isFurniture = object.kind === 'furniture' || object.kind === 'custom';
    if (isFurniture) {
      const furniture = this.createFurniture(object.label, object.widthMeters ?? 0.8, object.depthMeters ?? 0.6);
      furniture.position.set(object.position.x, 0, object.position.z);
      furniture.rotation.y = THREE.MathUtils.degToRad(object.rotationDegrees ?? 0);
      this.roomGroup.add(furniture);
      return;
    }

    // Doors and windows sit flat against the nearest wall.
    const alongX = Math.abs(object.position.z) > Math.abs(object.position.x);
    const onWallZ = alongX ? (object.position.z > 0 ? length / 2 : -length / 2) : object.position.z;
    const onWallX = alongX ? object.position.x : (object.position.x > 0 ? width / 2 : -width / 2);
    const isDoor = object.kind === 'door';
    const panel = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 0.6 });
    const leaf = new THREE.MeshStandardMaterial({ color: isDoor ? 0xb88a5c : 0x9fc8ff, roughness: isDoor ? 0.6 : 0.2, emissive: isDoor ? 0x000000 : 0x2a4a8a, emissiveIntensity: isDoor ? 0 : 0.5, transparent: !isDoor, opacity: isDoor ? 1 : 0.6 });
    const h = isDoor ? 2.05 : 1.1;
    const y = isDoor ? h / 2 : 1.4;
    const w = isDoor ? 0.9 : 1.0;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.06), frameMat);
    const leafMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), leaf);
    frame.position.y = y; leafMesh.position.y = y;
    frame.castShadow = true;
    panel.add(frame, leafMesh);
    panel.position.set(onWallX, 0, onWallZ);
    panel.rotation.y = alongX ? 0 : Math.PI / 2;
    panel.position.x = alongX ? object.position.x : onWallX;
    panel.position.z = alongX ? onWallZ : object.position.z;
    this.roomGroup.add(panel);
  }

  private createFurniture(label: string, width: number, depth: number): THREE.Group {
    const group = new THREE.Group();
    const key = label.toLowerCase();
    const material = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.78 });
    const addBox = (w: number, h: number, d: number, y: number, color: number, x = 0, z = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
      mesh.position.set(x, y + h / 2, z);
      group.add(mesh);
    };
    const legColor = 0x46566a;
    if (key.includes('bed')) {
      addBox(width, 0.22, depth, 0.28, 0x4d86b8);
      addBox(width * 0.34, 0.12, depth * 0.28, 0.5, 0xd9e8f4, 0, -depth * 0.29);
      addBox(width, 0.28, 0.1, 0.22, 0x34495e, 0, -depth / 2 + 0.05);
    } else if (key.includes('sofa')) {
      addBox(width, 0.28, depth * 0.72, 0.2, 0x287f83);
      addBox(width, 0.48, depth * 0.2, 0.48, 0x1e626b, 0, -depth * 0.39);
      addBox(width * 0.16, 0.42, depth * 0.72, 0.28, 0x1e626b, -width * 0.42);
      addBox(width * 0.16, 0.42, depth * 0.72, 0.28, 0x1e626b, width * 0.42);
    } else if (key.includes('chair')) {
      addBox(width * 0.9, 0.12, depth * 0.9, 0.46, 0xd49a53);
      addBox(width * 0.9, 0.52, 0.1, 0.58, 0x9c6a38, 0, -depth * 0.4);
      for (const x of [-1, 1]) for (const z of [-1, 1]) addBox(0.07, 0.46, 0.07, 0, legColor, x * width * 0.36, z * depth * 0.36);
    } else if (key.includes('table') || key.includes('desk')) {
      addBox(width, 0.12, depth, 0.72, 0xc28b52);
      for (const x of [-1, 1]) for (const z of [-1, 1]) addBox(0.07, 0.72, 0.07, 0, legColor, x * (width / 2 - 0.08), z * (depth / 2 - 0.08));
    } else if (key.includes('wardrobe') || key.includes('fridge') || key.includes('cabinet') || key.includes('book')) {
      const color = key.includes('fridge') ? 0xb8c7d5 : key.includes('book') ? 0x8b6548 : 0x9b7654;
      addBox(width, key.includes('fridge') ? 1.75 : key.includes('book') ? 1.55 : 1.8, depth, 0, color);
      if (key.includes('book')) {
        for (let y = 0.35; y < 1.5; y += 0.38) addBox(width * 0.94, 0.045, depth * 0.94, y, 0xe0b878);
      }
    } else {
      addBox(width, 0.75, depth, 0, 0x6b7f93);
      addBox(width * 0.9, 0.05, depth * 0.9, 0.75, 0x8fa3b8);
    }
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; }
    });
    return group;
  }

  private addExitBeacon(x: number, z: number, color: number): void {
    const beacon = new THREE.Group();
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 1.6, 24, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })
    );
    column.position.y = 0.8;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.38, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 32), new THREE.MeshBasicMaterial({ color }));
    core.position.y = 0.03;
    beacon.add(column, ring, core);
    beacon.position.set(x, 0, z);
    this.roomGroup.add(beacon);
    this.animated.push({ update: (t) => {
      const s = 1 + 0.2 * Math.sin(t * 2.6);
      ring.scale.set(s, s, 1);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 - 0.45 * (s - 1) / 0.2;
      column.rotation.y = t * 0.4;
    } });
  }

  private addObstacle(x: number, z: number): void {
    const group = new THREE.Group();
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16),
      new THREE.MeshStandardMaterial({ color: OBSTACLE, emissive: OBSTACLE, emissiveIntensity: 0.6, roughness: 0.3 })
    );
    gem.position.y = 0.7;
    gem.castShadow = true;
    const warn = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.28, 32),
      new THREE.MeshBasicMaterial({ color: OBSTACLE, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    warn.rotation.x = -Math.PI / 2;
    warn.position.y = 0.02;
    group.add(gem, warn);
    group.position.set(x, 0, z);
    this.roomGroup.add(group);
    this.animated.push({ update: (t) => {
      gem.rotation.y = t * 1.2;
      gem.position.y = 0.7 + 0.06 * Math.sin(t * 2 + x);
    } });
  }

  private addRoute(points: Array<{ x: number; z: number }>, color: number, index: number): void {
    const vectors = points.map((p) => new THREE.Vector3(p.x, 0.06, p.z));
    const curve = new THREE.CatmullRomCurve3(vectors, false, 'centripetal');
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 120, 0.04, 10, false),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.0, roughness: 0.4 })
    );
    this.routeGroup.add(tube);

    // Light pulses travel along the route toward the exit.
    for (let k = 0; k < 2; k++) {
      const pulse = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      this.routeGroup.add(pulse);
      const offset = index * 0.5 + k * 0.5;
      this.animated.push({ update: (t) => {
        curve.getPointAt((t * 0.12 + offset) % 1, pulse.position);
      } });
    }
  }

  private addYouMarker(x: number, z: number): void {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x8ea0ff, emissiveIntensity: 0.8 })
    );
    dot.position.set(x, 0.14, z);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.26, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.03, z);
    this.routeGroup.add(dot, ring);
    this.animated.push({ update: (t) => {
      const s = 1 + 0.3 * Math.sin(t * 2.4);
      ring.scale.set(s, s, 1);
    } });
  }

  private createGrid(): void {
    const grid = new THREE.GridHelper(20, 40, 0x8ea0ff, 0x1d2360);
    grid.position.y = -0.003;
    this.scene.add(grid);
  }

  private enableOrbit(): void {
    const canvas = this.renderer.domElement;
    let dragging = false, previousX = 0, previousY = 0;
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true; previousX = e.clientX; previousY = e.clientY; canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.goal.theta -= (e.clientX - previousX) * 0.005;
      this.goal.phi = clamp(this.goal.phi + (e.clientY - previousY) * 0.004, 0.05, 1.5);
      previousX = e.clientX; previousY = e.clientY;
    });
    const end = () => { dragging = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => {
      this.goal.r = clamp(this.goal.r + e.deltaY * 0.006, 3, 18);
    }, { passive: true });
  }

  private update = (): void => {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    const k = 1 - Math.exp(-6 * dt);
    this.orbit.theta += (this.goal.theta - this.orbit.theta) * k;
    this.orbit.phi += (this.goal.phi - this.orbit.phi) * k;
    this.orbit.r += (this.goal.r - this.orbit.r) * k;

    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h && this.camera.aspect !== w / h) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    const { theta, phi, r } = this.orbit;
    this.camera.position.set(
      this.target.x + r * Math.sin(phi) * Math.sin(theta),
      this.target.y + r * Math.cos(phi),
      this.target.z + r * Math.sin(phi) * Math.cos(theta)
    );
    this.camera.lookAt(this.target);

    for (const item of this.animated) item.update(t);
    this.renderer.render(this.scene, this.camera);
  };

  private clearGroup(group: THREE.Group): void {
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    group.clear();
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.clearGroup(this.roomGroup);
    this.clearGroup(this.routeGroup);
    this.floorTexture.dispose();
  }
}
