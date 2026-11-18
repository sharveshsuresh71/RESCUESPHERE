/** Plan coordinates in metres. x runs west→east, z runs south→north, the room centre is (0, 0). */
export interface Vec2 {
  x: number;
  z: number;
}

/**
 * Where a piece of scene information came from.
 * - 'device': reported by the WebXR session on the user's own device.
 * - 'simulated': hand-authored training data. It is NOT a real room.
 */
export type DataSource = 'device' | 'simulated';

export type ObjectKind =
  | 'table'
  | 'chair'
  | 'sofa'
  | 'armchair'
  | 'cabinet'
  | 'bed'
  | 'shelf'
  | 'fallenObject'
  | 'debris'
  | 'blockedDoorway';

/**
 * An axis-aligned object footprint. Furniture is kept axis-aligned so collision
 * boundaries stay exact and easy to verify.
 * `blocking` objects cannot be walked through. Non-blocking objects (for example a
 * fallen lamp) are trip hazards that can be passed carefully.
 */
export interface SceneObject {
  id: string;
  kind: ObjectKind;
  label: string;
  source: DataSource;
  center: Vec2;
  width: number;
  depth: number;
  height: number;
  blocking: boolean;
  /** Detection confidence 0–1, or null when the data source does not provide one. */
  confidence: number | null;
}

export type Wall = 'north' | 'south' | 'east' | 'west';

export interface ExitPoint {
  id: string;
  label: string;
  wall: Wall;
  /** Centre of the doorway, on the wall. */
  center: Vec2;
  /** The walkable point directly inside the doorway that routes end at. */
  approach: Vec2;
  width: number;
}

export interface TrainingScene {
  id: string;
  name: string;
  source: DataSource;
  /** Shown to the user next to the scene so it is never mistaken for a real room. */
  disclosure: string;
  bounds: { width: number; length: number };
  start: Vec2;
  exits: ExitPoint[];
  objects: SceneObject[];
}
