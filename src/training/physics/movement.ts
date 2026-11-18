import { BODY_RADIUS } from '../model/constants';
import { distanceToRect, rectOf } from '../model/geometry';
import type { SceneObject, TrainingScene, Vec2 } from '../model/types';

/**
 * Moves the walker from `from` towards `to` without entering any blocking object or
 * walking through a wall. If the full move collides, each axis is tried separately so
 * the walker slides along obstacles instead of stopping dead.
 */
export function moveWithCollision(
  scene: TrainingScene,
  objects: SceneObject[],
  from: Vec2,
  to: Vec2,
  radius = BODY_RADIUS
): Vec2 {
  const solids = objects.filter((o) => o.blocking).map(rectOf);
  const free = (p: Vec2) => isFree(p, solids, scene, radius);

  if (free(to)) return to;
  const slideX = { x: to.x, z: from.z };
  if (free(slideX)) return slideX;
  const slideZ = { x: from.x, z: to.z };
  if (free(slideZ)) return slideZ;
  return from;
}

/** True when a walker of the given radius standing at p overlaps nothing and stays inside the room. */
export function isFree(p: Vec2, solids: ReturnType<typeof rectOf>[], scene: TrainingScene, radius = BODY_RADIUS): boolean {
  const hw = scene.bounds.width / 2 - radius;
  const hl = scene.bounds.length / 2 - radius;
  if (p.x < -hw || p.x > hw || p.z < -hl || p.z > hl) return false;
  return solids.every((rect) => distanceToRect(p, rect) >= radius);
}
