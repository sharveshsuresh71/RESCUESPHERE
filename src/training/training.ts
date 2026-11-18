import { TRAINING_SCENES } from './model/scenarios';
import type { TrainingScene } from './model/types';
import { validateScene } from './model/validate';
import { EvacuationSession, type EndReason, type SessionEvent, type SessionSummary } from './session/EvacuationSession';
import { TrainingView } from './render/TrainingView';
import { drawHud } from './render/hud';
import { drawEnvironmentMap } from './render/envMap';
import {
  probeCapabilities,
  DeviceEnvironmentMap,
  surfaceFromWorldPoints,
  transformPoint,
  type DeviceCapabilities
} from './environment/deviceEnvironment';

const SCAN_SECONDS = 15;
const STATUS_TEXT = {
  clearInScene: 'Clear in scene data',
  narrowPassage: 'Narrow passage',
  hazardous: 'Hazard nearby · go slowly',
  blocked: 'Blocked'
} as const;

const el = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
};

let scene: TrainingScene = TRAINING_SCENES[0]!;
let session: EvacuationSession | null = null;
let view: TrainingView | null = null;
let capabilities: DeviceCapabilities | null = null;
const deviceMap = new DeviceEnvironmentMap();
let xrSession: XRSession | null = null;
let scanTimer: number | null = null;
let keyState = { forward: 0, right: 0 };
let lastSummary: SessionSummary | null = null;
let lastMapDraw = 0;

function setNotice(message: string): void {
  el('tr-notice').textContent = message;
}

/** Loads a scene: validates it, then builds a fresh session and 3D view for it. */
function loadScene(next: TrainingScene): void {
  const issues = validateScene(next);
  if (issues.length > 0) {
    setNotice(`Layout check failed for ${next.name}: ${issues.join(' ')}`);
    return;
  }
  if (xrSession) {
    setNotice('Exit VR before changing the training room.');
    return;
  }
  if (session && session.state === 'active') session.end('userExit');
  view?.dispose();
  scene = next;
  lastSummary = null;
  session = new EvacuationSession(scene);
  view = new TrainingView(el('tr-view'), scene, { onExitPressed: () => endTraining('userExit') });
  view.attach(session);
  session.subscribe(onSessionEvent);
  setNotice(`Loaded ${scene.name}. ${scene.disclosure}`);
  refreshAll();
}

function startTraining(): void {
  if (!session || session.state !== 'ready') return;
  session.start();
  setNotice('Training started. Walk with W A S D or the arrow keys. Press EXIT or Esc to end safely.');
}

/** Ends the training session safely: stops movement, leaves any VR session, and shows a summary. */
function endTraining(reason: EndReason): void {
  if (!session || session.state === 'ended') return;
  lastSummary = session.end(reason);
  if (xrSession) {
    const toEnd = xrSession;
    xrSession = null;
    void toEnd.end().catch(() => undefined);
    view?.setFrameHook(null);
  }
  setNotice(reason === 'vrSessionEnded' ? 'VR session ended. Training stopped safely.' : 'Training ended. Your summary is below.');
  refreshAll();
}

/** Plan and state changes rebuild the panels. Walking only refreshes the HUD and a throttled map. */
function onSessionEvent(kind: SessionEvent): void {
  if (kind !== 'position') {
    refreshAll();
    return;
  }
  renderHud();
  const now = performance.now();
  if (now - lastMapDraw > 250) {
    lastMapDraw = now;
    renderEnvMap();
  }
}

function refreshAll(): void {
  if (!session) return;
  renderState();
  renderRoutes();
  renderZones();
  renderWarnings();
  renderExitToggles();
  renderHud();
  renderEnvMap();
  renderSummary();
}

function renderState(): void {
  const s = session!;
  el('tr-state').textContent = s.state === 'ready' ? 'Ready' : s.state === 'active' ? 'Training active' : 'Ended';
  el<HTMLButtonElement>('tr-start').disabled = s.state !== 'ready';
  el<HTMLButtonElement>('tr-exit').disabled = s.state === 'ended';
  el('tr-scene-name').textContent = scene.name;
  el('tr-disclosure').textContent = scene.disclosure;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-scene]')) {
    button.classList.toggle('active', button.dataset.scene === scene.id);
  }
}

function renderRoutes(): void {
  const list = el('tr-routes');
  list.replaceChildren();
  for (const route of session!.routes) {
    const li = document.createElement('li');
    li.className = `route status-${route.status}`;
    const header = document.createElement('strong');
    header.textContent = route.reachable && route.rank ? `#${route.rank} ${route.exitLabel}` : `${route.exitLabel}`;
    const status = document.createElement('span');
    status.className = 'route-status';
    status.textContent = STATUS_TEXT[route.status];
    const detail = document.createElement('p');
    detail.textContent = route.explanation;
    li.append(header, status, detail);
    if (route.reachable) {
      const meta = document.createElement('small');
      meta.textContent = `${route.lengthMeters.toFixed(1)} m · closest clearance ${route.minClearance?.toFixed(2) ?? '–'} m`;
      li.append(meta);
    }
    list.append(li);
  }
  el('tr-route-note').textContent = session!.analysis.primary
    ? `Ranked by scene data only. This is not a guarantee of real-world safety.`
    : 'No route is currently reachable in this simulation.';
}

function renderZones(): void {
  const list = el('tr-zones');
  list.replaceChildren();
  for (const zone of session!.analysis.dangerZones.slice(0, 10)) {
    const li = document.createElement('li');
    li.className = `zone zone-${zone.kind}`;
    li.textContent = zone.label;
    list.append(li);
  }
  if (session!.analysis.dangerZones.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No danger zones found in this scene.';
    list.append(li);
  }
}

function renderWarnings(): void {
  const list = el('tr-warnings');
  list.replaceChildren();
  const warnings = session!.guidance().warnings;
  if (warnings.length === 0) {
    const li = document.createElement('li');
    li.className = 'warning severity-info';
    li.textContent = 'No warnings. Every exit state matches the scene data.';
    list.append(li);
  }
  for (const w of warnings) {
    const li = document.createElement('li');
    li.className = `warning severity-${w.severity}`;
    li.textContent = w.message;
    list.append(li);
  }
}

function renderExitToggles(): void {
  const host = el('tr-exit-toggles');
  host.replaceChildren();
  for (const exit of scene.exits) {
    const blocked = session!.isExitBlocked(exit.id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = blocked ? 'secondary' : 'danger';
    button.textContent = blocked ? `Clear ${exit.label}` : `Block ${exit.label}`;
    button.disabled = session!.state === 'ended';
    button.addEventListener('click', () => session!.setExitBlocked(exit.id, !blocked));
    host.append(button);
  }
}

function renderHud(): void {
  const g = session!.guidance();
  drawHud(el<HTMLCanvasElement>('tr-hud'), {
    badge: `SIMULATED TRAINING · ${scene.name.toUpperCase()}`,
    headline: g.headline,
    instruction: g.instruction,
    distanceMeters: g.distanceMeters,
    warnings: g.warnings,
    endedNotice: session!.state === 'ended' ? 'Session ended. Thank you for training.' : undefined
  });
}

function renderEnvMap(): void {
  lastMapDraw = performance.now();
  drawEnvironmentMap(el<HTMLCanvasElement>('tr-envmap'), {
    scene,
    objects: session!.sceneObjects,
    analysis: session!.analysis,
    position: session!.position,
    device: deviceMap.snapshot()
  });
  const snap = deviceMap.snapshot();
  el('tr-device-status').textContent = snap.surfaces.length > 0
    ? `Real data: ${snap.surfaces.length} surface(s) from this device. ${snap.objectDetection.reason}`
    : `No real room data yet. ${snap.objectDetection.reason}`;
}

function renderSummary(): void {
  const box = el('tr-summary');
  if (!lastSummary) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const reached = lastSummary.reachedExitId ? scene.exits.find((e) => e.id === lastSummary!.reachedExitId)?.label : null;
  el('tr-summary-text').textContent = reached
    ? `You reached ${reached} in this simulation. Ended by: ${reasonText(lastSummary.reason)}.`
    : `You did not reach an exit in this simulation. Ended by: ${reasonText(lastSummary.reason)}.`;
}

function reasonText(reason: EndReason): string {
  return reason === 'userExit' ? 'the EXIT button' : reason === 'vrSessionEnded' ? 'the VR session ending' : 'reaching an exit';
}

function renderCapabilities(): void {
  const host = el('tr-capabilities');
  if (!capabilities) {
    host.textContent = 'Checking device…';
    return;
  }
  const c = capabilities;
  const rows = [
    `WebXR: ${c.webxr ? 'available' : 'not available'}`,
    `Immersive VR: ${c.immersiveVR}`,
    `Immersive AR (room scan): ${c.immersiveAR}`,
    'Furniture detection: not available (no WebXR furniture data, no vision model in this build)',
    ...c.notes
  ];
  host.replaceChildren(...rows.map((text) => {
    const p = document.createElement('p');
    p.textContent = text;
    return p;
  }));
}

/** Immersive VR. requestSession is the first call so it stays inside the click gesture. */
async function enterVR(): Promise<void> {
  if (xrSession) return setNotice('A VR session is already running.');
  if (!navigator.xr || !view) return setNotice('WebXR is not available here. Desktop training works in any modern browser.');
  if (capabilities?.immersiveVR !== 'supported') return setNotice('Immersive VR is not available on this device or browser. Use desktop training.');
  if (!session) return;
  try {
    const started = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
    });
    xrSession = started;
    view.setScanMode(false);
    await view.renderer.xr.setSession(started);
    if (session.state === 'ready') startTraining();
    started.addEventListener('end', () => {
      if (xrSession !== started) return;
      xrSession = null;
      view?.setFrameHook(null);
      if (session && session.state === 'active') endTraining('vrSessionEnded');
      else setNotice('VR session ended. Desktop view restored.');
    }, { once: true });
    setNotice('VR active. Left stick walks. Point a controller at the red EXIT panel and press the trigger to end safely.');
  } catch (error) {
    xrSession = null;
    setNotice(`Could not start VR: ${error instanceof Error ? error.message : 'device or permission error'}.`);
  }
}

/** Hit-test source for the viewer. Returns null when the device does not offer hit testing. */
async function createHitSource(session: XRSession): Promise<XRHitTestSource | null> {
  try {
    const viewer = await session.requestReferenceSpace('viewer');
    return (await session.requestHitTestSource?.({ space: viewer })) ?? null;
  } catch {
    return null;
  }
}

/**
 * Real-environment scan. It only records what WebXR reports: plane polygons and
 * hit-test points. It never claims furniture. It runs for SCAN_SECONDS and then ends.
 */
async function scanRealRoom(): Promise<void> {
  if (xrSession) return setNotice('Exit the current VR session first.');
  if (!navigator.xr || !view) return setNotice('WebXR is not available here.');
  if (capabilities?.immersiveAR !== 'supported') return setNotice('Room scanning needs an AR-capable headset or browser. The simulated room still works.');
  try {
    const started = await navigator.xr.requestSession('immersive-ar', {
      optionalFeatures: ['plane-detection', 'hit-test', 'local-floor']
    });
    xrSession = started;
    view.setScanMode(true);
    await view.renderer.xr.setSession(started);
    const enabled = Array.from((started as unknown as { enabledFeatures?: string[] }).enabledFeatures ?? []);
    if (capabilities) capabilities = { ...capabilities, enabledFeatures: enabled };
    renderCapabilities();

    const referenceSpace = view.renderer.xr.getReferenceSpace();
    let hitSource: XRHitTestSource | null = null;
    void createHitSource(started).then((source) => { hitSource = source; });

    view.setFrameHook((frame) => {
      if (!referenceSpace) return;
      const planes = (frame as unknown as { detectedPlanes?: Set<{ orientation?: string; polygon?: Array<{ x: number; y: number; z: number }>; planeSpace: XRSpace; lastChangedTime?: number }> }).detectedPlanes;
      planes?.forEach((plane, index) => {
        if (!plane.polygon || plane.polygon.length < 3) return;
        const pose = frame.getPose(plane.planeSpace, referenceSpace);
        if (!pose) return;
        const world = plane.polygon.map((p) => transformPoint(pose.transform.matrix, p.x, p.y, p.z));
        const surface = surfaceFromWorldPoints(`plane-${index}`, plane.orientation === 'vertical' ? 'vertical' : 'horizontal', world);
        if (surface) deviceMap.upsertSurface(surface);
      });
      if (hitSource) {
        for (const result of frame.getHitTestResults(hitSource)) {
          const pose = result.getPose(referenceSpace);
          if (pose) deviceMap.addHitPoint({ x: pose.transform.position.x, y: pose.transform.position.y, z: pose.transform.position.z });
        }
      }
    });

    let remaining = SCAN_SECONDS;
    setNotice(`Scanning floor and walls… ${remaining}s. Slowly look around the room.`);
    scanTimer = window.setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setNotice(`Scanning floor and walls… ${remaining}s. Slowly look around the room.`);
        renderEnvMap();
        return;
      }
      if (scanTimer !== null) window.clearInterval(scanTimer);
      scanTimer = null;
      view?.setFrameHook(null);
      view?.setScanMode(false);
      if (xrSession === started) xrSession = null;
      void started.end().catch(() => undefined);
      const surfaces = deviceMap.snapshot().surfaces.length;
      setNotice(surfaces > 0
        ? `Scan finished: ${surfaces} real surface(s) recorded. Furniture is not detected, so training stays in the simulated room.`
        : 'Scan finished with no usable surfaces. Furniture is not detected. The simulated room still works.');
      renderEnvMap();
    }, 1000);
    started.addEventListener('end', () => {
      if (scanTimer !== null) { window.clearInterval(scanTimer); scanTimer = null; }
      view?.setFrameHook(null);
      view?.setScanMode(false);
      if (xrSession === started) xrSession = null;
    }, { once: true });
  } catch (error) {
    xrSession = null;
    view?.setScanMode(false);
    setNotice(`Could not start the room scan: ${error instanceof Error ? error.message : 'device or permission error'}.`);
  }
}

function onKey(e: KeyboardEvent, down: boolean): void {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
  const k = e.key.toLowerCase();
  if (down && (k === 'escape')) { endTraining('userExit'); return; }
  const map: Record<string, [keyof typeof keyState, number]> = {
    w: ['forward', 1], arrowup: ['forward', 1], s: ['forward', -1], arrowdown: ['forward', -1],
    d: ['right', 1], arrowright: ['right', 1], a: ['right', -1], arrowleft: ['right', -1]
  };
  const hit = map[k];
  if (!hit) return;
  keyState = { ...keyState, [hit[0]]: down ? hit[1] : 0 };
  view?.setDesktopKeys(keyState.forward, keyState.right);
  if (down) e.preventDefault();
}

function init(): void {
  el<HTMLElement>('tr-scene-buttons').replaceChildren(...TRAINING_SCENES.map((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.scene = s.id;
    b.textContent = s.name;
    b.addEventListener('click', () => loadScene(s));
    return b;
  }));

  el('tr-start').addEventListener('click', startTraining);
  el('tr-exit').addEventListener('click', () => endTraining('userExit'));
  el('tr-reset').addEventListener('click', () => loadScene(scene));
  el('tr-enter-vr').addEventListener('click', () => { void enterVR(); });
  el('tr-scan').addEventListener('click', () => { void scanRealRoom(); });
  el('tr-view-iso').addEventListener('click', () => view?.setView('iso'));
  el('tr-view-top').addEventListener('click', () => view?.setView('top'));
  el('tr-view-front').addEventListener('click', () => view?.setView('front'));

  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));

  loadScene(scene);

  void probeCapabilities().then((caps) => {
    capabilities = caps;
    renderCapabilities();
    el<HTMLButtonElement>('tr-enter-vr').disabled = caps.immersiveVR !== 'supported';
    el<HTMLButtonElement>('tr-scan').disabled = caps.immersiveAR !== 'supported';
    renderEnvMap();
  });
  renderCapabilities();
}

init();
