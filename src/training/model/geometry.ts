import type { SceneObject, TrainingScene, Vec2 } from './types';

/** Axis-aligned rectangle in plan coordinates. */
export interface Rect {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  blocking: boolean;
}

export function rectOf(object: SceneObject): Rect {
  const hx = object.width / 2;
  const hz = object.depth / 2;
  return {
    id: object.id,
    minX: object.center.x - hx,
    maxX: object.center.x + hx,
    minZ: object.center.z - hz,
    maxZ: object.center.z + hz,
    blocking: object.blocking
  };
}

/** The four walls as thick blocking rectangles, so gaps between objects and walls can be measured. */
export function wallRects(scene: TrainingScene): Rect[] {
  const hw = scene.bounds.width / 2;
  const hl = scene.bounds.length / 2;
  const t = 1.0;
  return [
    { id: 'wall-north', minX: -hw - t, maxX: hw + t, minZ: hl, maxZ: hl + t, blocking: true },
    { id: 'wall-south', minX: -hw - t, maxX: hw + t, minZ: -hl - t, maxZ: -hl, blocking: true },
    { id: 'wall-east', minX: hw, maxX: hw + t, minZ: -hl - t, maxZ: hl + t, blocking: true },
    { id: 'wall-west', minX: -hw - t, maxX: -hw, minZ: -hl - t, maxZ: hl + t, blocking: true }
  ];
}

/** Shortest distance from a point to a rectangle (0 when inside). */
export function distanceToRect(p: Vec2, r: Rect): number {
  const dx = Math.max(r.minX - p.x, 0, p.x - r.maxX);
  const dz = Math.max(r.minZ - p.z, 0, p.z - r.maxZ);
  return Math.hypot(dx, dz);
}

/** Shortest distance between two rectangles (0 when they touch or overlap). */
export function gapBetween(a: Rect, b: Rect): number {
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX, 0);
  const dz = Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ, 0);
  return Math.hypot(dx, dz);
}

/** Distance from a point to the inside of the room walls. */
export function wallDistance(p: Vec2, bounds: { width: number; length: number }): number {
  return Math.min(
    p.x + bounds.width / 2,
    bounds.width / 2 - p.x,
    p.z + bounds.length / 2,
    bounds.length / 2 - p.z
  );
}

/** Strict overlap test: rectangles that only touch are not overlapping. */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
}
