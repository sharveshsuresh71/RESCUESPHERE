import * as THREE from 'three';
import { RoomScene } from '../spatial/RoomScene';
import type { ViewPreset } from '../spatial/RoomScene';
import type { RoomPlan } from '../core/types';

interface HandLike { get(name: string): unknown }
interface JointPoseLike { transform: { position: { x: number; y: number; z: number } } }
interface XRFrameLike { getJointPose(joint: unknown, space: unknown): JointPoseLike | null }
interface XRInputLike { hand?: HandLike | null }
interface DetectedPlaneLike { orientation?: string; polygon?: Array<{ x: number; z: number }>; planeSpace: unknown }
interface PlaneFrameLike extends XRFrameLike { detectedPlanes?: Set<DetectedPlaneLike> }
export interface RoomScanResult { widthMeters: number; lengthMeters: number; confidence: 'estimated'; planeCount: number }

export class XRManager {
  private renderer?: THREE.WebGLRenderer;
  private scene?: RoomScene;
  private session?: XRSession | null;

  initialize(root: HTMLElement): void {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', 'RescueSphere interactive 3D room preview');
    root.append(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    this.renderer = renderer;
    this.scene = new RoomScene(renderer);
    this.createStatus();
    this.createEnterButton();
    this.createVRButton();
    const enterButton = document.getElementById('enter-xr');
    if (enterButton) root.append(enterButton);
    this.handleResize(renderer);
  }

  updateRoom(plan: RoomPlan): void { this.scene?.updateRoom(plan); }

  setView(view: ViewPreset): void { this.scene?.setView(view); }

  /**
   * Uses WebXR plane detection on a compatible immersive-AR headset.
   * It estimates the bounds of the largest detected horizontal plane; it is
   * not a certified architectural measurement or a substitute for checking
   * the room dimensions manually.
   */
  async scanRoom(onStatus: (message: string) => void): Promise<RoomScanResult> {
    if (!navigator.xr || !this.renderer) {
      throw new Error('WebXR is unavailable. Open the HTTPS app in a compatible Meta Quest browser to scan a room.');
    }
    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    if (!supported) {
      throw new Error('Immersive AR is not supported on this device/browser. Use a compatible Meta Quest headset and browser.');
    }

    onStatus('Starting room scan… allow camera and spatial-sensing permissions.');
    const session = await navigator.xr.requestSession('immersive-ar', {
      optionalFeatures: ['local-floor', 'plane-detection', 'hand-tracking']
    });
    this.session = session;
    await this.renderer.xr.setSession(session);
    this.scene?.setPassthroughMode(true);

    return new Promise<RoomScanResult>((resolve, reject) => {
      let finished = false;
      let best: { width: number; length: number; planeCount: number; area: number } | null = null;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        session.removeEventListener('end', onEnd);
        if (this.session === session) this.session = null;
        this.scene?.setPassthroughMode(false);
        void session.end().catch(() => undefined);
        if (error) reject(error);
        else if (best) resolve({ widthMeters: best.width, lengthMeters: best.length, confidence: 'estimated', planeCount: best.planeCount });
        else reject(new Error('No usable horizontal floor plane was detected. Slowly look around the floor and try again, or enter room dimensions manually.'));
      };
      const onEnd = () => {
        if (!finished) {
          finished = true;
          this.session = null;
          this.scene?.setPassthroughMode(false);
          if (best) resolve({ widthMeters: best.width, lengthMeters: best.length, confidence: 'estimated', planeCount: best.planeCount });
          else reject(new Error('The scan ended before a floor plane was detected.'));
        }
      };
      session.addEventListener('end', onEnd, { once: true });
      const startedAt = performance.now();
      const inspect = (_time: DOMHighResTimeStamp, frame: XRFrame) => {
        if (finished) return;
        const referenceSpace = this.renderer?.xr.getReferenceSpace();
        const planeFrame = frame as unknown as PlaneFrameLike;
        const planes = planeFrame.detectedPlanes;
        let floorCount = 0;
        if (referenceSpace && planes) {
          for (const plane of planes) {
            if (plane.orientation !== 'horizontal' || !plane.polygon || plane.polygon.length < 3) continue;
            const pose = frame.getPose(plane.planeSpace as XRSpace, referenceSpace);
            if (!pose) continue;
            const transform = new THREE.Matrix4().fromArray(Array.from(pose.transform.matrix));
            const points = plane.polygon.map(point => new THREE.Vector3(point.x, 0, point.z).applyMatrix4(transform));
            const xs = points.map(point => point.x), zs = points.map(point => point.z);
            const width = Math.max(...xs) - Math.min(...xs);
            const length = Math.max(...zs) - Math.min(...zs);
            const area = width * length;
            if (width >= 1 && length >= 1 && width <= 20 && length <= 20 && area > (best?.area ?? 0)) {
              best = { width, length, planeCount: planes.size, area };
            }
            floorCount++;
          }
        }
        const elapsed = Math.round((performance.now() - startedAt) / 1000);
        onStatus(`Scanning floor… ${elapsed}/15 seconds · ${floorCount} horizontal plane(s) detected. Slowly pan around the floor and room edges.`);
        if (elapsed >= 15) finish();
        else session.requestAnimationFrame(inspect);
      };
      session.requestAnimationFrame(inspect);
    });
  }

  private createStatus(): void {
    const status = document.createElement('div'); status.className = 'xr-status'; status.id = 'xr-status';
    status.textContent = 'Desktop 3D mode · drag to orbit · scroll to zoom'; document.body.append(status);
  }

  /**
   * "Enter VR" button. It stays disabled until navigator.xr reports that
   * immersive-vr is supported, so it never claims a session it cannot start.
   */
  private createVRButton(): void {
    const button = document.createElement('button');
    button.className = 'primary';
    button.id = 'enter-vr';
    button.textContent = 'Enter VR';
    button.disabled = true;
    Object.assign(button.style, { position: 'fixed', right: '16px', bottom: '64px', zIndex: '30' });
    button.addEventListener('click', () => { void this.startVR(button); });
    document.body.append(button);
    void this.checkVRSupport(button);
  }

  private async checkVRSupport(button: HTMLButtonElement): Promise<void> {
    let supported = false;
    try {
      supported = !!navigator.xr && await navigator.xr.isSessionSupported('immersive-vr');
    } catch {
      supported = false;
    }
    if (supported) {
      button.disabled = false;
      this.updateStatus('Immersive VR available · press Enter VR · desktop 3D mode remains available');
    } else {
      button.disabled = true;
      this.updateStatus('Immersive VR is not available in this browser. Enable the Immersive Web Emulator or use a WebXR-capable headset; desktop 3D mode still works.');
    }
  }

  private async startVR(button: HTMLButtonElement): Promise<void> {
    if (this.session) { this.updateStatus('An XR session is already running. Exit it first.'); return; }
    if (!navigator.xr || !this.renderer) { this.updateStatus('WebXR is unavailable here. Desktop 3D mode remains available.'); return; }
    button.disabled = true;
    try {
      // requestSession must run synchronously inside the click gesture, so it is the first await here.
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
      });
      this.session = session;
      await this.renderer.xr.setSession(session);
      this.scene?.setPassthroughMode(false);
      this.scene?.setImmersiveLayout(true);
      this.updateStatus('Immersive VR active · end the session from your headset or the emulator to return.');
      session.addEventListener('end', () => {
        if (this.session === session) this.session = null;
        this.scene?.setImmersiveLayout(false);
        button.disabled = false;
        this.updateStatus('VR session ended · desktop 3D mode available');
      }, { once: true });
    } catch (error) {
      this.session = null;
      button.disabled = false;
      this.updateStatus(`Could not start VR: ${error instanceof Error ? error.message : 'permission or device error'}. Desktop 3D mode remains available.`);
    }
  }

  private createEnterButton(): void {
    const button = document.createElement('button'); button.className = 'primary'; button.id = 'enter-xr';
    button.textContent = 'Enter Mixed Reality'; button.style.position = 'fixed'; button.style.right = '16px'; button.style.bottom = '16px'; button.style.zIndex = '30';
    button.addEventListener('click', async () => {
      if (this.session) { this.updateStatus('An XR session is already running. Exit it first.'); return; }
      if (!navigator.xr || !this.renderer) { this.updateStatus('WebXR is unavailable here. Use a WebXR-capable browser and compatible headset; desktop mode remains available.'); return; }
      let mode: XRSessionMode | null = null;
      try { if (await navigator.xr.isSessionSupported('immersive-ar')) mode = 'immersive-ar'; else if (await navigator.xr.isSessionSupported('immersive-vr')) mode = 'immersive-vr'; } catch { mode = null; }
      if (!mode) { this.updateStatus('No supported immersive session detected. Open the HTTPS site in the Meta Quest browser to test XR.'); return; }
      try {
        this.session = await navigator.xr.requestSession(mode, { optionalFeatures: ['hand-tracking', 'local-floor', 'bounded-floor'] });
        await this.renderer.xr.setSession(this.session);
        const ar = mode === 'immersive-ar'; this.scene?.setPassthroughMode(ar);
        this.updateStatus(ar ? 'Mixed Reality active · checking hand tracking…' : 'Immersive VR active · checking hand tracking…');
        this.monitorHands(this.session);
        this.session.addEventListener('end', () => { this.session = null; this.scene?.setPassthroughMode(false); this.updateStatus('XR session ended · desktop 3D mode available'); });
      } catch (error) { this.updateStatus(`Could not start XR session: ${error instanceof Error ? error.message : 'permission or device error'}`); }
    });
    document.body.append(button);
  }

  private monitorHands(session: XRSession): void {
    const inspect = (_time: DOMHighResTimeStamp, frame: XRFrame) => {
      if (this.session !== session) return;
      const referenceSpace = this.renderer?.xr.getReferenceSpace();
      let hands = 0, pinches = 0;
      if (referenceSpace) {
        const xrFrame = frame as unknown as XRFrameLike;
        for (const source of session.inputSources as unknown as XRInputLike[]) {
          if (!source.hand) continue;
          hands++;
          const thumb = source.hand.get('thumb-tip'); const index = source.hand.get('index-finger-tip');
          if (!thumb || !index) continue;
          const a = xrFrame.getJointPose(thumb, referenceSpace)?.transform.position;
          const b = xrFrame.getJointPose(index, referenceSpace)?.transform.position;
          if (a && b && Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z) < 0.025) pinches++;
        }
      }
      if (hands) this.updateStatus(`XR active · ${hands} hand(s) tracked · ${pinches ? 'pinch detected' : 'hands visible'}`);
      else this.updateStatus('XR active · no hand joints detected (check hand tracking permission/settings)');
      session.requestAnimationFrame(inspect);
    };
    session.requestAnimationFrame(inspect);
  }

  private updateStatus(message: string): void { const status = document.getElementById('xr-status'); if (status) status.textContent = message; }
  private handleResize(renderer: THREE.WebGLRenderer): void {
    window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); });
  }
}
