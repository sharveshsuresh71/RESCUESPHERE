import type { RoomObject, Vec2 } from '../core/types';
export interface Collision { first: string; second: string; distance: number }
/** Approximate 2D footprint overlap warning for user-placed furniture markers. */
export function detectFurnitureCollisions(objects: RoomObject[]): Collision[] {
  const furniture = objects.filter(o => o.kind === 'furniture' || o.kind === 'custom');
  const collisions: Collision[] = [];
  for (let i = 0; i < furniture.length; i++) for (let j = i + 1; j < furniture.length; j++) {
    const a = furniture[i]!, b = furniture[j]!;
    const delta = distance(a.position, b.position);
    const min = Math.hypot(((a.widthMeters ?? .8) + (b.widthMeters ?? .8)) / 2, ((a.depthMeters ?? .6) + (b.depthMeters ?? .6)) / 2) * .55;
    if (delta < min) collisions.push({ first: a.label, second: b.label, distance: delta });
  }
  return collisions;
}
function distance(a: Vec2, b: Vec2): number { return Math.hypot(a.x-b.x, a.z-b.z); }
