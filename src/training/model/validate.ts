import { analyzeScene } from '../safety/analysis';
import { BODY_RADIUS } from './constants';
import { distanceToRect, overlaps, rectOf, wallDistance } from './geometry';
import type { TrainingScene } from './types';

/**
 * Checks a training scene before it is used. Returns a list of problems; an empty
 * list means the layout is valid. Rules: objects stay inside the room, blocking
 * objects do not overlap, the start and exits are walkable, and at least one exit
 * remains reachable.
 */
export function validateScene(scene: TrainingScene): string[] {
  const issues: string[] = [];
  const { width, length } = scene.bounds;
  const hw = width / 2, hl = length / 2;

  const ids = new Set<string>();
  for (const o of scene.objects) {
    if (ids.has(o.id)) issues.push(`Duplicate object id: ${o.id}`);
    ids.add(o.id);
    const r = rectOf(o);
    if (r.minX < -hw || r.maxX > hw || r.minZ < -hl || r.maxZ > hl) {
      issues.push(`${o.label} extends outside the room walls.`);
    }
    if (o.width <= 0 || o.depth <= 0 || o.height <= 0) issues.push(`${o.label} has a non-positive dimension.`);
  }

  const blocking = scene.objects.filter((o) => o.blocking);
  for (let i = 0; i < blocking.length; i++) {
    for (let j = i + 1; j < blocking.length; j++) {
      if (overlaps(rectOf(blocking[i]!), rectOf(blocking[j]!))) {
        issues.push(`${blocking[i]!.label} overlaps ${blocking[j]!.label}.`);
      }
    }
  }

  if (wallDistance(scene.start, scene.bounds) < BODY_RADIUS) issues.push('Start point is too close to a wall.');
  const startBlocked = blocking.some((o) => distanceToRect(scene.start, rectOf(o)) < BODY_RADIUS);
  if (startBlocked) issues.push('Start point overlaps an obstacle.');

  const exitIds = new Set<string>();
  for (const exit of scene.exits) {
    if (exitIds.has(exit.id)) issues.push(`Duplicate exit id: ${exit.id}`);
    exitIds.add(exit.id);
    if (wallDistance(exit.approach, scene.bounds) < BODY_RADIUS) issues.push(`${exit.label} approach is too close to its wall.`);
  }

  const analysis = analyzeScene(scene);
  if (analysis.reachableExitIds.length === 0) {
    issues.push('No exit is reachable from the start. A training scene must keep at least one exit open.');
  }
  return issues;
}
