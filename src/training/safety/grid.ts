import { CELL, BODY_RADIUS, NARROW_CLEARANCE, HAZARD_RANGE, EPS } from '../model/constants';
import { distanceToRect, rectOf, wallDistance } from '../model/geometry';
import type { SceneObject, TrainingScene, Vec2 } from '../model/types';

/**
 * Planner grid for one scene. Each cell stores its clearance: the distance from the
 * cell centre to the nearest blocking object or wall. Cells closer than BODY_RADIUS
 * to anything blocking are not walkable.
 */
export interface SafetyGrid {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  readonly bounds: { width: number; length: number };
  readonly clearance: Float32Array;
  readonly walkable: Uint8Array;
  readonly narrow: Uint8Array;
  readonly hazard: Uint8Array;
  index(col: number, row: number): number;
  toCell(p: Vec2): { col: number; row: number };
  toWorld(col: number, row: number): Vec2;
}

export function buildGrid(scene: TrainingScene, objects: SceneObject[]): SafetyGrid {
  const { width, length } = scene.bounds;
  const cols = Math.max(2, Math.round(width / CELL));
  const rows = Math.max(2, Math.round(length / CELL));
  const count = cols * rows;

  const blockingRects = objects.filter((o) => o.blocking).map(rectOf);
  const hazardRects = objects.filter((o) => !o.blocking).map(rectOf);

  const clearance = new Float32Array(count);
  const walkable = new Uint8Array(count);
  const narrow = new Uint8Array(count);
  const hazard = new Uint8Array(count);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const p = {
        x: -width / 2 + (col + 0.5) * CELL,
        z: -length / 2 + (row + 0.5) * CELL
      };
      let d = wallDistance(p, scene.bounds);
      for (const r of blockingRects) d = Math.min(d, distanceToRect(p, r));
      clearance[i] = d;
      walkable[i] = d >= BODY_RADIUS - EPS ? 1 : 0;
      narrow[i] = walkable[i] && d < NARROW_CLEARANCE - EPS ? 1 : 0;
      hazard[i] = hazardRects.some((r) => distanceToRect(p, r) < HAZARD_RANGE) ? 1 : 0;
    }
  }

  return {
    cell: CELL,
    cols,
    rows,
    bounds: scene.bounds,
    clearance,
    walkable,
    narrow,
    hazard,
    index: (col, row) => row * cols + col,
    toCell: (p) => ({
      col: Math.min(cols - 1, Math.max(0, Math.round((p.x + width / 2) / CELL - 0.5))),
      row: Math.min(rows - 1, Math.max(0, Math.round((p.z + length / 2) / CELL - 0.5)))
    }),
    toWorld: (col, row) => ({
      x: -width / 2 + (col + 0.5) * CELL,
      z: -length / 2 + (row + 0.5) * CELL
    })
  };
}
