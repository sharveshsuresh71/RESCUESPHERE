import type { DeviceSurface } from '../environment/deviceEnvironment';

/** The subset of the device snapshot that the map draws. */
export interface DeviceEnvironmentSnapshot {
  surfaces: DeviceSurface[];
  hitPoints: Array<{ x: number; y: number; z: number }>;
}
