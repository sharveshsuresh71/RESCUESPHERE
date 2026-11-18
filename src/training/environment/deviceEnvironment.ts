/**
 * Real-environment layer. Everything here comes from WebXR data the device actually
 * provides (planes, hit-test results). WebXR has no furniture or obstacle API, and
 * this build ships no computer-vision model, so no real furniture is ever reported.
 */

export type FeatureStatus = 'supported' | 'unsupported' | 'unknown';

export interface DeviceCapabilities {
  webxr: boolean;
  immersiveVR: FeatureStatus;
  immersiveAR: FeatureStatus;
  /** Features the session actually enabled. null until a session has been started. */
  enabledFeatures: string[] | null;
  notes: string[];
}

export const OBJECT_DETECTION_UNAVAILABLE =
  'Real furniture and obstacle detection is not available: WebXR does not expose furniture data and no computer-vision model is included. Only the simulated training room contains objects.';

interface XRSystemLike {
  isSessionSupported(mode: string): Promise<boolean>;
}

/** Checks which immersive modes this browser can start. It does not start a session. */
export async function probeCapabilities(nav: { xr?: XRSystemLike } = globalThis.navigator as unknown as { xr?: XRSystemLike }): Promise<DeviceCapabilities> {
  const notes: string[] = [];
  if (!nav.xr) {
    notes.push('WebXR is not available in this browser. Desktop training mode is still available.');
    return { webxr: false, immersiveVR: 'unsupported', immersiveAR: 'unsupported', enabledFeatures: null, notes };
  }
  const check = async (mode: string): Promise<FeatureStatus> => {
    try {
      return (await nav.xr!.isSessionSupported(mode)) ? 'supported' : 'unsupported';
    } catch {
      return 'unknown';
    }
  };
  const [immersiveVR, immersiveAR] = await Promise.all([check('immersive-vr'), check('immersive-ar')]);
  if (immersiveAR !== 'supported') notes.push('Real room scanning needs immersive-ar, which this device or browser does not report.');
  if (immersiveVR !== 'supported') notes.push('Immersive VR is not available here. Desktop training mode is still available.');
  return { webxr: true, immersiveVR, immersiveAR, enabledFeatures: null, notes };
}

/** Column-major 4×4 matrix (as WebXR and three.js use) applied to a point. */
export function transformPoint(m: ArrayLike<number>, x: number, y: number, z: number): { x: number; y: number; z: number } {
  return {
    x: m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    y: m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    z: m[2]! * x + m[6]! * y + m[10]! * z + m[14]!
  };
}

export interface DeviceSurface {
  id: string;
  orientation: 'horizontal' | 'vertical';
  center: { x: number; y: number; z: number };
  width: number;
  depth: number;
  source: 'device';
  /** WebXR planes do not report a confidence value, so none is invented. */
  confidence: null;
}

/** Builds a surface from plane polygon points that are already in world (reference-space) coordinates. */
export function surfaceFromWorldPoints(
  id: string,
  orientation: 'horizontal' | 'vertical',
  points: Array<{ x: number; y: number; z: number }>
): DeviceSurface | null {
  if (points.length < 3) return null;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y), zs = points.map((p) => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  return {
    id,
    orientation,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
    width: maxX - minX,
    depth: maxZ - minZ,
    source: 'device',
    confidence: null
  };
}

/** Keeps the latest reading for each plane and tracks how many hit-test points were seen. */
export class DeviceEnvironmentMap {
  private readonly surfaces = new Map<string, DeviceSurface>();
  private hits: Array<{ x: number; y: number; z: number }> = [];
  private hitLimit = 400;

  upsertSurface(surface: DeviceSurface): void {
    this.surfaces.set(surface.id, surface);
  }

  addHitPoint(point: { x: number; y: number; z: number }): void {
    this.hits.push(point);
    if (this.hits.length > this.hitLimit) this.hits.splice(0, this.hits.length - this.hitLimit);
  }

  snapshot(): {
    source: 'device';
    surfaces: DeviceSurface[];
    hitPoints: Array<{ x: number; y: number; z: number }>;
    objects: [];
    objectDetection: { available: false; reason: string };
  } {
    return {
      source: 'device',
      surfaces: [...this.surfaces.values()],
      hitPoints: [...this.hits],
      objects: [],
      objectDetection: { available: false, reason: OBJECT_DETECTION_UNAVAILABLE }
    };
  }
}
