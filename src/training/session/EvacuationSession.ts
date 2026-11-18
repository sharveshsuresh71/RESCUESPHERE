import { moveWithCollision } from '../physics/movement';
import { analyzeScene, type RouteAssessment, type SceneAnalysis } from '../safety/analysis';
import type { ExitPoint, SceneObject, TrainingScene, Vec2 } from '../model/types';

export type SessionState = 'ready' | 'active' | 'ended';
export type EndReason = 'userExit' | 'reachedExit' | 'vrSessionEnded';

export interface SessionWarning {
  id: string;
  severity: 'info' | 'caution' | 'critical';
  message: string;
}

export interface Arrow {
  position: Vec2;
  /** Direction of travel in radians, measured from +z toward +x. */
  heading: number;
}

export interface Guidance {
  headline: string;
  instruction: string;
  target: Vec2 | null;
  distanceMeters: number | null;
  arrows: Arrow[];
  primaryExitId: string | null;
  reachedExitId: string | null;
  warnings: SessionWarning[];
}

export interface SessionSummary {
  sceneId: string;
  reason: EndReason;
  reachedExitId: string | null;
  primaryExitIdAtEnd: string | null;
  warningsAtEnd: SessionWarning[];
}

/** 'plan': routes, objects or exits changed. 'position': the walker moved. 'state': the session started or ended. */
export type SessionEvent = 'plan' | 'position' | 'state';
type Listener = (kind: SessionEvent) => void;

const BLOCKER_PREFIX = 'blocker-';
const ARRIVAL_DISTANCE = 0.5;
const ARROW_SPACING = 0.9;
const WAYPOINT_REACHED = 0.2;
const MAX_ARROWS = 12;

/**
 * One evacuation training run in a simulated scene. It keeps the walker's position,
 * re-plans whenever a doorway is blocked or cleared, and produces guidance and
 * warnings. It does not claim any route guarantees real-world safety.
 */
export class EvacuationSession {
  private readonly scene: TrainingScene;
  private objects: SceneObject[];
  private analysisCache: SceneAnalysis;
  private _state: SessionState = 'ready';
  private _position: Vec2;
  private warnings: SessionWarning[] = [];
  private previousPrimaryId: string | null = null;
  private previousReachable = new Set<string>();
  private readonly listeners: Listener[] = [];
  private endedSummary: SessionSummary | null = null;

  constructor(scene: TrainingScene) {
    this.scene = scene;
    this.objects = [...scene.objects];
    this._position = { ...scene.start };
    this.analysisCache = analyzeScene(scene, this.objects);
    this.refreshWarnings(true);
  }

  get state(): SessionState { return this._state; }
  get position(): Vec2 { return this._position; }
  get analysis(): SceneAnalysis { return this.analysisCache; }
  get routes(): RouteAssessment[] { return this.analysisCache.routes; }
  get sceneObjects(): readonly SceneObject[] { return this.objects; }
  get summary(): SessionSummary | null { return this.endedSummary; }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  start(): void {
    if (this._state !== 'ready') return;
    this._state = 'active';
    this.emit('state');
  }

  /** Walks towards a target, stopping at furniture and walls. Returns the new position. */
  moveTo(target: Vec2): Vec2 {
    if (this._state !== 'active') return this._position;
    const next = moveWithCollision(this.scene, this.objects, this._position, target);
    if (next.x === this._position.x && next.z === this._position.z) return this._position;
    this._position = next;
    this.emit('position');
    return this._position;
  }

  /** Blocks or clears an exit's doorway. Re-plans the routes and updates warnings. */
  setExitBlocked(exitId: string, blocked: boolean): void {
    if (this._state === 'ended') return;
    const exit = this.scene.exits.find((e) => e.id === exitId);
    if (!exit) throw new Error(`Unknown exit: ${exitId}`);
    const blockerId = `${BLOCKER_PREFIX}${exitId}`;
    const present = this.objects.some((o) => o.id === blockerId);
    if (blocked && !present) this.objects.push(blockerFor(exit));
    if (!blocked && present) this.objects = this.objects.filter((o) => o.id !== blockerId);
    this.replan();
  }

  isExitBlocked(exitId: string): boolean {
    return this.objects.some((o) => o.id === `${BLOCKER_PREFIX}${exitId}`);
  }

  /** Current guidance for the walker: next target, distance, arrows and warnings. */
  guidance(): Guidance {
    const primary = this.analysisCache.primary;
    const reached = this.reachedExitId();
    const base = { primaryExitId: primary?.exitId ?? null, reachedExitId: reached, warnings: this.warnings };

    if (reached) {
      const exit = this.scene.exits.find((e) => e.id === reached)!;
      return {
        ...base,
        headline: `You have reached ${exit.label}`,
        instruction: 'Simulation complete. Press EXIT to end the training session.',
        target: null,
        distanceMeters: null,
        arrows: []
      };
    }
    if (!primary) {
      return {
        ...base,
        headline: 'No exit is reachable in this scene',
        instruction: 'Every exit is blocked in this simulation. Press EXIT to end. In a real emergency, follow official guidance and call your local emergency number.',
        target: null,
        distanceMeters: null,
        arrows: []
      };
    }

    const { target, remaining, arrows } = followRoute(primary.points, this._position);
    return {
      ...base,
      headline: `Walk to ${primary.exitLabel}`,
      instruction: primary.explanation,
      target,
      distanceMeters: remaining,
      arrows
    };
  }

  /** Ends the session. Safe to call more than once; later calls return the first summary. */
  end(reason: EndReason): SessionSummary {
    if (this.endedSummary) return this.endedSummary;
    this._state = 'ended';
    this.endedSummary = {
      sceneId: this.scene.id,
      reason,
      reachedExitId: this.reachedExitId(),
      primaryExitIdAtEnd: this.analysisCache.primary?.exitId ?? null,
      warningsAtEnd: [...this.warnings]
    };
    this.emit('state');
    return this.endedSummary;
  }

  private reachedExitId(): string | null {
    for (const exit of this.scene.exits) {
      if (!this.analysisCache.reachableExitIds.includes(exit.id)) continue;
      if (distance(this._position, exit.approach) <= ARRIVAL_DISTANCE) return exit.id;
    }
    return null;
  }

  private replan(): void {
    this.analysisCache = analyzeScene(this.scene, this.objects);
    this.refreshWarnings(false);
    this.emit('plan');
  }

  private refreshWarnings(initial: boolean): void {
    const warnings: SessionWarning[] = [];
    const { primary, routes } = this.analysisCache;
    const reachable = new Set(this.analysisCache.reachableExitIds);

    for (const exit of this.scene.exits) {
      if (!reachable.has(exit.id) && this.previousReachable.has(exit.id) && !initial) {
        warnings.push({ id: `blocked-${exit.id}`, severity: 'critical', message: `${exit.label} is now blocked. Routes have been recalculated.` });
      }
    }

    if (!primary) {
      warnings.push({ id: 'none-reachable', severity: 'critical', message: 'No exit is reachable in this scene.' });
    } else {
      if (!initial && primary.exitId !== this.previousPrimaryId) {
        warnings.push({ id: 'route-changed', severity: 'caution', message: `New clearest route: ${primary.exitLabel}.` });
      }
      if (primary.status === 'hazardous') {
        warnings.push({ id: 'primary-hazard', severity: 'caution', message: primary.explanation });
      } else if (primary.status === 'narrowPassage') {
        warnings.push({ id: 'primary-narrow', severity: 'info', message: primary.explanation });
      }
    }

    for (const route of routes) {
      if (route.status === 'blocked' && route.exitId !== primary?.exitId && reachable.size > 0) {
        warnings.push({ id: `unavailable-${route.exitId}`, severity: 'info', message: `${route.exitLabel} is not available.` });
      }
    }

    this.warnings = warnings;
    this.previousPrimaryId = primary?.exitId ?? null;
    this.previousReachable = reachable;
  }

  private emit(kind: SessionEvent): void {
    for (const listener of [...this.listeners]) listener(kind);
  }
}

function blockerFor(exit: ExitPoint): SceneObject {
  const alongX = exit.wall === 'north' || exit.wall === 'south';
  return {
    id: `${BLOCKER_PREFIX}${exit.id}`,
    kind: 'blockedDoorway',
    label: `Blocked: ${exit.label}`,
    source: 'simulated',
    center: { ...exit.approach },
    width: alongX ? exit.width + 0.6 : 0.3,
    depth: alongX ? 0.3 : exit.width + 0.6,
    height: 1.0,
    blocking: true,
    confidence: null
  };
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Finds the walker's progress along the route and the next waypoint, plus arrows ahead. */
function followRoute(points: Vec2[], position: Vec2): { target: Vec2; remaining: number; arrows: Arrow[] } {
  if (points.length < 2) {
    const last = points[points.length - 1] ?? position;
    return { target: last, remaining: distance(position, last), arrows: [] };
  }

  let bestSeg = 0;
  let bestDist = Infinity;
  for (let k = 0; k < points.length - 1; k++) {
    const d = distanceToSegment(position, points[k]!, points[k + 1]!);
    if (d < bestDist) { bestDist = d; bestSeg = k; }
  }

  // Skip waypoints the walker is already standing on, so the target always moves forward.
  let targetIndex = bestSeg + 1;
  while (targetIndex < points.length - 1 && distance(position, points[targetIndex]!) < WAYPOINT_REACHED) targetIndex++;
  const target = points[targetIndex]!;
  let remaining = distance(position, target);
  for (let k = targetIndex; k < points.length - 1; k++) remaining += distance(points[k]!, points[k + 1]!);

  const arrows: Arrow[] = [];
  let carry = 0;
  for (let k = Math.max(bestSeg, targetIndex - 1); k < points.length - 1 && arrows.length < MAX_ARROWS; k++) {
    const a = k === bestSeg ? position : points[k]!;
    const b = points[k + 1]!;
    const segLen = distance(a, b);
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    let along = ARROW_SPACING - carry;
    while (along <= segLen && arrows.length < MAX_ARROWS) {
      const f = along / segLen;
      arrows.push({ position: { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }, heading });
      along += ARROW_SPACING;
    }
    carry = segLen - (along - ARROW_SPACING);
  }
  return { target, remaining, arrows };
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const vx = b.x - a.x, vz = b.z - a.z;
  const len2 = vx * vx + vz * vz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2));
  return distance(p, { x: a.x + vx * t, z: a.z + vz * t });
}
