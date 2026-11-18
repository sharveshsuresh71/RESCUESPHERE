import { BODY_RADIUS, EPS, HAZARD_RANGE, NARROW_CLEARANCE, NARROW_GAP } from '../model/constants';
import { distanceToRect, gapBetween, rectOf, wallRects, type Rect } from '../model/geometry';
import type { ExitPoint, SceneObject, TrainingScene, Vec2 } from '../model/types';
import { buildGrid, type SafetyGrid } from './grid';
import { findCellPath } from './pathfinder';

/**
 * How a route is described. "clearInScene" only means no known obstacle or hazard
 * was found on this route in the scene data. It is never a claim that the route is
 * safe in the real world.
 */
export type RouteStatus = 'clearInScene' | 'narrowPassage' | 'hazardous' | 'blocked';

export interface RouteAssessment {
  exitId: string;
  exitLabel: string;
  status: RouteStatus;
  /** 1 = clearest reachable route. null when the route is blocked. */
  rank: number | null;
  reachable: boolean;
  points: Vec2[];
  lengthMeters: number;
  /** Smallest clearance along the route, in metres. null when blocked. */
  minClearance: number | null;
  /** Non-blocking objects the route passes within HAZARD_RANGE of. */
  hazardIds: string[];
  explanation: string;
}

export interface DangerZone {
  id: string;
  kind: 'narrowPassage' | 'tripHazard' | 'blockedDoorway';
  center: Vec2;
  radius: number;
  label: string;
}

export interface SceneAnalysis {
  grid: SafetyGrid;
  routes: RouteAssessment[];
  primary: RouteAssessment | null;
  dangerZones: DangerZone[];
  reachableExitIds: string[];
}

/** Gaps narrower than this are flush placements (for example furniture pushed against a wall), not passages. */
const MIN_REPORTED_GAP = 0.2;

const SEVERITY: Record<RouteStatus, number> = { clearInScene: 0, narrowPassage: 1, hazardous: 2, blocked: 3 };

/**
 * Runs the full safety assessment for a scene with the given objects. Pass the
 * current objects (including any blockers added during a session) to see how the
 * routes change.
 */
export function analyzeScene(scene: TrainingScene, objects: SceneObject[] = scene.objects): SceneAnalysis {
  const grid = buildGrid(scene, objects);
  const startCell = grid.toCell(scene.start);
  const hazardObjects = objects.filter((o) => !o.blocking);

  const routes: RouteAssessment[] = scene.exits.map((exit) => assessExit(scene, exit, grid, startCell, hazardObjects));

  const reachable = routes.filter((r) => r.reachable).sort((a, b) => {
    const severity = SEVERITY[a.status] - SEVERITY[b.status];
    return severity !== 0 ? severity : a.lengthMeters - b.lengthMeters;
  });
  reachable.forEach((route, index) => { route.rank = index + 1; });

  const ordered = [...reachable, ...routes.filter((r) => !r.reachable)];
  const dangerZones = buildDangerZones(scene, objects, routes);

  return {
    grid,
    routes: ordered,
    primary: reachable[0] ?? null,
    dangerZones,
    reachableExitIds: reachable.map((r) => r.exitId)
  };
}

function assessExit(
  scene: TrainingScene,
  exit: ExitPoint,
  grid: SafetyGrid,
  startCell: { col: number; row: number },
  hazardObjects: SceneObject[]
): RouteAssessment {
  const goalCell = grid.toCell(exit.approach);
  const path = findCellPath(grid, startCell.col, startCell.row, goalCell.col, goalCell.row);

  if (!path) {
    return {
      exitId: exit.id,
      exitLabel: exit.label,
      status: 'blocked',
      rank: null,
      reachable: false,
      points: [],
      lengthMeters: 0,
      minClearance: null,
      hazardIds: [],
      explanation: `No walkable route to ${exit.label} with a ${BODY_RADIUS * 2} m clearance. The doorway is blocked in this scene.`
    };
  }

  const cells = path.map((i) => grid.toWorld(i % grid.cols, Math.floor(i / grid.cols)));
  const points = simplify([scene.start, ...cells.slice(1), exit.center]);
  const lengthMeters = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i]!.x, p.z - points[i]!.z), 0);

  let minClearance = Infinity;
  for (const i of path) minClearance = Math.min(minClearance, grid.clearance[i]!);

  const hazardIds = hazardObjects
    .filter((o) => {
      const rect = rectOf(o);
      return path.some((i) => distanceToRect(grid.toWorld(i % grid.cols, Math.floor(i / grid.cols)), rect) < HAZARD_RANGE);
    })
    .map((o) => o.id);

  const narrowCount = path.filter((i) => grid.narrow[i]).length;

  let status: RouteStatus = 'clearInScene';
  if (hazardIds.length > 0 || minClearance < BODY_RADIUS + 0.05 - EPS) status = 'hazardous';
  else if (minClearance < NARROW_CLEARANCE - EPS || narrowCount > 0) status = 'narrowPassage';

  const explanation = describe(status, exit.label, minClearance, hazardIds.length, narrowCount);

  return {
    exitId: exit.id,
    exitLabel: exit.label,
    status,
    rank: null,
    reachable: true,
    points,
    lengthMeters,
    minClearance,
    hazardIds,
    explanation
  };
}

function describe(status: RouteStatus, label: string, minClearance: number, hazards: number, narrowCount: number): string {
  if (status === 'hazardous') {
    return `${label}: passes ${hazards > 0 ? `${hazards} trip hazard(s)` : 'very close to an obstacle'} (closest clearance ${minClearance.toFixed(2)} m). Go slowly.`;
  }
  if (status === 'narrowPassage') {
    return `${label}: includes a narrow passage (closest clearance ${minClearance.toFixed(2)} m, ${narrowCount} tight cell(s)). Keep to the arrows.`;
  }
  return `${label}: no known obstacle or hazard on this route in the scene data (closest clearance ${minClearance.toFixed(2)} m). This is not a guarantee of safety.`;
}

/** Removes points that lie on a straight line between their neighbours, keeping every turn. */
function simplify(points: Vec2[]): Vec2[] {
  if (points.length < 3) return points;
  const out: Vec2[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1]!, b = points[i]!, c = points[i + 1]!;
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (Math.abs(cross) > 1e-6) out.push(b);
  }
  out.push(points[points.length - 1]!);
  return out;
}

/**
 * Danger zones: tight gaps between obstacles or walls, trip hazards, and blocked
 * doorways. Each zone is derived from the scene data, not guessed.
 */
function buildDangerZones(scene: TrainingScene, objects: SceneObject[], routes: RouteAssessment[]): DangerZone[] {
  const zones: DangerZone[] = [];
  const solids: Rect[] = [...objects.filter((o) => o.blocking).map(rectOf), ...wallRects(scene)];

  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i]!, b = solids[j]!;
      if (a.id.startsWith('wall-') && b.id.startsWith('wall-')) continue;
      const gap = gapBetween(a, b);
      if (gap < MIN_REPORTED_GAP || gap >= NARROW_GAP) continue;
      const mid = midpointBetween(a, b);
      zones.push({
        id: `gap-${a.id}-${b.id}`,
        kind: 'narrowPassage',
        center: mid,
        radius: Math.max(0.4, gap / 2 + 0.2),
        label: `Narrow gap ${gap.toFixed(2)} m${gap < BODY_RADIUS * 2 ? ' (too narrow to pass)' : ''}`
      });
    }
  }

  for (const o of objects.filter((o) => !o.blocking)) {
    zones.push({
      id: `hazard-${o.id}`,
      kind: 'tripHazard',
      center: o.center,
      radius: Math.max(o.width, o.depth) / 2 + 0.3,
      label: `Trip hazard: ${o.label}`
    });
  }

  for (const route of routes) {
    if (route.status !== 'blocked') continue;
    const exit = scene.exits.find((e) => e.id === route.exitId);
    if (!exit) continue;
    zones.push({
      id: `blocked-${exit.id}`,
      kind: 'blockedDoorway',
      center: exit.approach,
      radius: 0.6,
      label: `${exit.label} blocked`
    });
  }
  return zones;
}

function midpointBetween(a: Rect, b: Rect): Vec2 {
  const cx = (Math.max(a.minX, a.maxX) + Math.min(b.minX, b.maxX)) / 2;
  const cz = (Math.max(a.minZ, a.maxZ) + Math.min(b.minZ, b.maxZ)) / 2;
  return { x: cx, z: cz };
}
