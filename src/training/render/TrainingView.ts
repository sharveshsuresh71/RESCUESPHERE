import * as THREE from 'three';
import type { EvacuationSession, Guidance, SessionEvent } from '../session/EvacuationSession';
import type { RouteAssessment, DangerZone } from '../safety/analysis';
import type { ExitPoint, SceneObject, TrainingScene, Vec2 } from '../model/types';
import { drawHud, HUD_HEIGHT, HUD_WIDTH, type HudModel } from './hud';

const BACKGROUND = 0x0c0f26;
const WALL_HEIGHT = 2.4;
const WALK_SPEED = 1.3; // metres per second
const GUIDANCE_REFRESH_METRES = 0.15;
const STATUS_COLOR: Record<RouteAssessment['status'], number> = {
  clearInScene: 0x5cf2ff,
  narrowPassage: 0xffd25c,
  hazardous: 0xff9a4d,
  blocked: 0xff5d6c
};
const ZONE_COLOR: Record<DangerZone['kind'], number> = {
  narrowPassage: 0xffd25c,
  tripHazard: 0xff9a4d,
  blockedDoorway: 0xff5d6c
};

export interface TrainingViewCallbacks {
  onExitPressed(): void;
}

/**
 * Three.js view of a training session. Room content is rebuilt from the session when
 * the plan changes. Simulated objects are drawn with cyan (blocking) or amber
 * (trip hazard) outlines and are never shown as real detections.
 */
export class TrainingView {
  readonly renderer: THREE.WebGLRenderer;
  private readonly threeScene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 100);
  /** Moves the viewer through the room. Desktop and VR both use it. */
  private readonly rig = new THREE.Group();
  private readonly contentGroup = new THREE.Group();
  private readonly routeGroup = new THREE.Group();
  private readonly arrowGroup = new THREE.Group();
  private readonly playerGroup = new THREE.Group();
  private readonly hudCanvas = document.createElement('canvas');
  private readonly hudTexture: THREE.CanvasTexture;
  private readonly hudMesh: THREE.Mesh;
  private readonly exitButton: THREE.Mesh;
  private readonly raycaster = new THREE.Raycaster();
  private readonly clock = new THREE.Clock();
  private readonly room: TrainingScene;
  private readonly callbacks: TrainingViewCallbacks;
  private session: EvacuationSession | null = null;
  private orbit = { theta: 0.6, phi: 0.95, r: 4.8 };
  private keys = { forward: 0, right: 0 };
  private disposed = false;
  private frameHook: ((frame: XRFrame) => void) | null = null;
  private lastGuidancePosition: Vec2 | null = null;

  constructor(container: HTMLElement, room: TrainingScene, callbacks: TrainingViewCallbacks) {
    this.room = room;
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');
    container.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', 'Evacuation training view. Simulated room.');

    this.threeScene.background = new THREE.Color(BACKGROUND);
    this.threeScene.fog = new THREE.Fog(BACKGROUND, 12, 30);
    this.threeScene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1b1f4f, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 8, 5);
    this.threeScene.add(key);

    this.threeScene.add(this.rig);
    this.rig.add(this.camera);
    this.threeScene.add(this.contentGroup, this.routeGroup, this.arrowGroup, this.playerGroup);
    this.buildRoomShell();
    this.buildPlayerMarker();

    // Head-locked guidance panel: only shown inside an immersive session, where the DOM overlay is not visible.
    this.hudCanvas.width = HUD_WIDTH;
    this.hudCanvas.height = HUD_HEIGHT;
    this.hudTexture = new THREE.CanvasTexture(this.hudCanvas);
    this.hudTexture.colorSpace = THREE.SRGBColorSpace;
    this.hudMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.4),
      new THREE.MeshBasicMaterial({ map: this.hudTexture, transparent: true })
    );
    this.hudMesh.position.set(0, -0.12, -1.0);
    this.hudMesh.visible = false;
    this.camera.add(this.hudMesh);

    this.exitButton = this.buildExitButton();
    this.threeScene.add(this.exitButton);

    this.setupControllers();
    this.setupDesktopInput();
    window.addEventListener('resize', this.handleResize);
    this.renderer.setAnimationLoop(this.frame);
  }

  get presenting(): boolean { return this.renderer.xr.isPresenting; }

  /** Binds a session. The view rebuilds its content whenever the session reports a change. */
  attach(session: EvacuationSession): void {
    this.session = session;
    this.syncContent();
    session.subscribe((kind: SessionEvent) => {
      if (kind === 'position') this.onPositionChanged();
      else this.syncContent();
    });
  }

  /** Called with each XR frame while an immersive session runs (used by the real-environment scan). */
  setFrameHook(hook: ((frame: XRFrame) => void) | null): void {
    this.frameHook = hook;
  }

  /**
   * Scan mode hides the simulated room and clears the background, so the real room
   * shows through in an AR session. Simulated content is never drawn over the real room.
   */
  setScanMode(on: boolean): void {
    this.threeScene.background = on ? null : new THREE.Color(BACKGROUND);
    this.threeScene.fog = on ? null : new THREE.Fog(BACKGROUND, 12, 30);
    for (const group of [this.contentGroup, this.routeGroup, this.arrowGroup, this.playerGroup]) group.visible = !on;
    this.exitButton.visible = !on;
  }

  setDesktopKeys(forward: number, right: number): void {
    this.keys = { forward, right };
  }

  /** Quick view presets for the desktop camera. */
  setView(view: 'iso' | 'top' | 'front'): void {
    if (view === 'iso') { this.orbit.theta = 0.6; this.orbit.phi = 0.95; }
    if (view === 'top') { this.orbit.theta = 0; this.orbit.phi = 0.04; }
    if (view === 'front') { this.orbit.theta = 0; this.orbit.phi = 1.35; }
  }

  /** Converts a screen point into a press on the 3D EXIT button, for desktop clicks. */
  pickAt(clientX: number, clientY: number): boolean {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.exitButton, false).length > 0;
    if (hit) this.callbacks.onExitPressed();
    return hit;
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.handleResize);
    disposeGroup(this.contentGroup);
    disposeGroup(this.routeGroup);
    disposeGroup(this.arrowGroup);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly handleResize = (): void => {
    const parent = this.renderer.domElement.parentElement;
    const w = parent?.clientWidth || window.innerWidth;
    const h = parent?.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private readonly frame = (_time?: number, xrFrame?: XRFrame): void => {
    if (this.disposed) return;
    if (xrFrame && this.frameHook) this.frameHook(xrFrame);
    const dt = Math.min(0.05, this.clock.getDelta());
    const session = this.session;

    if (session && session.state === 'active') {
      const input = this.collectMoveInput();
      if (input.x !== 0 || input.z !== 0) {
        const p = session.position;
        const step = WALK_SPEED * dt;
        session.moveTo({ x: p.x + input.x * step, z: p.z + input.z * step });
      }
    }

    const p = session?.position ?? this.room.start;
    this.rig.position.set(p.x, 0, p.z);
    this.playerGroup.position.set(p.x, 0, p.z);

    if (!this.presenting) {
      const { theta, phi, r } = this.orbit;
      const target = new THREE.Vector3(p.x, 0.5, p.z);
      this.camera.position.set(
        target.x + r * Math.sin(phi) * Math.sin(theta),
        target.y + r * Math.cos(phi),
        target.z + r * Math.sin(phi) * Math.cos(theta)
      );
      this.camera.lookAt(target);
    }
    this.hudMesh.visible = this.presenting;

    this.renderer.render(this.threeScene, this.camera);
  };

  /**
   * Desktop keys and the left VR thumbstick, converted to a plan-space direction.
   * `forward` is away from the viewer and `right` is to the viewer's right, measured
   * from the viewing yaw. The viewing direction is (-sin yaw, -cos yaw) in plan (x, z).
   */
  private collectMoveInput(): Vec2 {
    let forward = 0, right = 0, yaw = this.orbit.theta;
    if (!this.presenting) {
      forward = this.keys.forward;
      right = this.keys.right;
    } else {
      const xrSession = this.renderer.xr.getSession();
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      yaw = Math.atan2(-dir.x, -dir.z);
      if (xrSession) {
        for (const source of xrSession.inputSources) {
          if (source.handedness !== 'left' || !source.gamepad) continue;
          const axes = source.gamepad.axes;
          const ax = axes.length >= 4 ? axes[2] ?? 0 : axes[0] ?? 0;
          const ay = axes.length >= 4 ? axes[3] ?? 0 : axes[1] ?? 0;
          const dead = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
          forward = -dead(ay);
          right = dead(ax);
        }
      }
    }
    const x = -forward * Math.sin(yaw) + right * Math.cos(yaw);
    const z = -forward * Math.cos(yaw) - right * Math.sin(yaw);
    const length = Math.hypot(x, z);
    return length > 1 ? { x: x / length, z: z / length } : { x, z };
  }

  /** Rebuilds the objects, danger zones and routes from the session. Guidance arrows update separately. */
  private syncContent(): void {
    const session = this.session;
    if (!session) return;
    disposeGroup(this.contentGroup);
    disposeGroup(this.routeGroup);

    for (const object of session.sceneObjects) this.contentGroup.add(this.createObjectMesh(object));
    for (const zone of session.analysis.dangerZones) this.contentGroup.add(this.createZoneMesh(zone));
    for (const exit of this.room.exits) this.contentGroup.add(this.createExitBeacon(exit, session.analysis.reachableExitIds.includes(exit.id)));

    for (const route of session.routes.filter((r) => r.reachable)) {
      const points = route.points.map((p) => new THREE.Vector3(p.x, 0.05, p.z));
      if (points.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 80, route.rank === 1 ? 0.035 : 0.022, 8, false),
        new THREE.MeshBasicMaterial({ color: STATUS_COLOR[route.status], transparent: true, opacity: route.rank === 1 ? 0.9 : 0.35 })
      );
      this.routeGroup.add(tube);
    }
    this.lastGuidancePosition = { ...session.position };
    this.syncGuidance(session.guidance());
    this.syncHud(session.guidance());
  }

  /** Arrows and the guidance panel only need refreshing once the walker has moved a noticeable distance. */
  private onPositionChanged(): void {
    const session = this.session;
    if (!session) return;
    const p = session.position;
    const last = this.lastGuidancePosition;
    if (last && Math.hypot(p.x - last.x, p.z - last.z) < GUIDANCE_REFRESH_METRES) return;
    this.lastGuidancePosition = { ...p };
    this.syncGuidance(session.guidance());
    this.syncHud(session.guidance());
  }

  /** Arrows along the primary route, coloured by that route's status. */
  private syncGuidance(g: Guidance): void {
    disposeGroup(this.arrowGroup);
    const primary = this.session?.analysis.primary;
    if (!primary) return;
    const color = STATUS_COLOR[primary.status];
    for (const arrow of g.arrows) {
      // Cone tip points along +z in its holder; the holder is turned to the arrow's heading.
      const holder = new THREE.Group();
      holder.position.set(arrow.position.x, 0.08, arrow.position.z);
      holder.rotation.y = arrow.heading;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 12), new THREE.MeshBasicMaterial({ color }));
      cone.rotation.x = Math.PI / 2;
      holder.add(cone);
      this.arrowGroup.add(holder);
    }
    if (g.target) {
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.18, 0.24, 32),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(g.target.x, 0.04, g.target.z);
      this.arrowGroup.add(marker);
    }
  }

  private syncHud(g: Guidance): void {
    const model: HudModel = {
      badge: `SIMULATED TRAINING · ${this.room.name.toUpperCase()}`,
      headline: g.headline,
      instruction: g.instruction,
      distanceMeters: g.distanceMeters,
      warnings: g.warnings,
      endedNotice: this.session?.state === 'ended' ? 'Session ended. Thank you for training.' : undefined
    };
    drawHud(this.hudCanvas, model);
    this.hudTexture.needsUpdate = true;
  }

  private buildRoomShell(): void {
    const { width, length } = this.room.bounds;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, length),
      new THREE.MeshStandardMaterial({ color: 0x9d7b57, roughness: 0.8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.threeScene.add(floor);
    this.threeScene.add(new THREE.GridHelper(Math.max(width, length) + 4, Math.round(Math.max(width, length) + 4), 0x8ea0ff, 0x1d2360));

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xdfe5f5, roughness: 0.9, transparent: true, opacity: 0.35 });
    const addWall = (w: number, d: number, x: number, z: number) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_HEIGHT, d), wallMat);
      wall.position.set(x, WALL_HEIGHT / 2, z);
      this.threeScene.add(wall);
    };
    addWall(width + 0.1, 0.1, 0, -length / 2);
    addWall(width + 0.1, 0.1, 0, length / 2);
    addWall(0.1, length, -width / 2, 0);
    addWall(0.1, length, width / 2, 0);

  }

  private buildPlayerMarker(): void {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x8ea0ff, emissiveIntensity: 0.8 }));
    dot.position.y = 0.14;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    this.playerGroup.add(dot, ring);
  }

  private buildExitButton(): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#c4233a';
      ctx.fillRect(0, 0, 512, 160);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 84px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('EXIT TRAINING', 256, 84);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const button = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.19, 0.03),
      new THREE.MeshBasicMaterial({ map: texture })
    );
    // Placed in front of the start point, at chest height, facing the walker.
    const start = this.room.start;
    const toCentre = Math.hypot(start.x, start.z) || 1;
    const offset = 0.9;
    button.position.set(start.x - (start.x / toCentre) * offset, 1.25, start.z - (start.z / toCentre) * offset);
    button.lookAt(start.x, 1.25, start.z);
    button.userData.isExitButton = true;
    return button;
  }

  private setupControllers(): void {
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1.5)]),
        new THREE.LineBasicMaterial({ color: 0x8ea0ff })
      );
      controller.add(line);
      this.threeScene.add(controller);
      // 'select' is dispatched by three.js for XR controllers; typed as a plain EventTarget here.
      (controller as unknown as EventTarget).addEventListener('select', () => {
        this.raycaster.setFromXRController(controller);
        if (this.raycaster.intersectObject(this.exitButton, false).length > 0) this.callbacks.onExitPressed();
      });
    }
  }

  private setupDesktopInput(): void {
    const canvas = this.renderer.domElement;
    let dragging = false, lastX = 0, lastY = 0, moved = 0;
    canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; moved = 0; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      this.orbit.theta -= dx * 0.005;
      this.orbit.phi = Math.min(1.5, Math.max(0.05, this.orbit.phi + dy * 0.004));
      lastX = e.clientX; lastY = e.clientY;
    });
    const end = (e: PointerEvent) => {
      if (dragging && moved < 6) this.pickAt(e.clientX, e.clientY);
      dragging = false;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', () => { dragging = false; });
    canvas.addEventListener('wheel', (e) => { this.orbit.r = Math.min(12, Math.max(2, this.orbit.r + e.deltaY * 0.006)); }, { passive: true });
  }

  private createObjectMesh(o: SceneObject): THREE.Group {
    const group = new THREE.Group();
    const color = o.blocking ? 0x6b7fa8 : 0xc08a3a;
    const height = Math.max(o.height, 0.05);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(o.width, height, o.depth),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8, transparent: true, opacity: o.blocking ? 0.9 : 0.75 })
    );
    mesh.position.set(o.center.x, height / 2, o.center.z);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(o.width, height, o.depth)),
      new THREE.LineBasicMaterial({ color: o.blocking ? 0x5cf2ff : 0xffb84d })
    );
    edges.position.copy(mesh.position);
    group.add(mesh, edges);
    group.userData = { simulated: o.source === 'simulated', objectId: o.id };
    return group;
  }

  private createZoneMesh(zone: DangerZone): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(zone.radius, 40),
      new THREE.MeshBasicMaterial({ color: ZONE_COLOR[zone.kind], transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(zone.center.x, 0.01, zone.center.z);
    return mesh;
  }

  private createExitBeacon(exit: ExitPoint, reachable: boolean): THREE.Group {
    const group = new THREE.Group();
    const color = reachable ? 0x29d8ff : 0xff5d6c;
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 1.6, 24, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })
    );
    column.position.set(exit.center.x, 0.8, exit.center.z);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.38, 40),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(exit.center.x, 0.02, exit.center.z);
    group.add(column, ring);
    return group;
  }
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Line) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((m) => m.dispose());
    }
  });
  group.clear();
}
