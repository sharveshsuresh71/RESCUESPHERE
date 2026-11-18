import type { ExitMarker, RoomObject, Vec2 } from '../core/types';

/**
 * Pure geometry for the photo-assisted room builder. No DOM access, so it can be
 * tested in Node. Plan coordinates follow the planner: metres from the room centre,
 * x to the right, z down. Points coming from a click are in pixels.
 */

export interface PixelPoint {
  x: number;
  y: number;
}

/** Converts photo pixels to metres. Only valid for the plane the scale was measured on. */
export interface PhotoScale {
  pixelsPerMetre: number;
}

/** Maps plan-canvas pixels to plan metres. The origin is the room centre on the canvas. */
export interface PlanFrame {
  originX: number;
  originY: number;
  pixelsPerMetre: number;
}

export interface RoomSize {
  widthMeters: number;
  lengthMeters: number;
}

export type WallSide = 'north' | 'south' | 'east' | 'west';

export interface WallSnap {
  position: Vec2;
  wall: WallSide;
}

/** An exit must sit within this distance of a wall to count as being on it. */
export const WALL_TOLERANCE_METRES = 0.3;

/** Calibration points closer than this are too imprecise to trust. */
const MIN_CALIBRATION_PIXELS = 20;

/** Size used for a furniture item whose size is missing or invalid. */
export const DEFAULT_FOOTPRINT_METRES = 0.5;

/** Typical sizes, used as starting values the user can change. */
export const FURNITURE_PRESETS: ReadonlyArray<{ label: string; widthMeters: number; depthMeters: number }> = [
  { label: 'Chair', widthMeters: 0.5, depthMeters: 0.5 },
  { label: 'Table', widthMeters: 1.2, depthMeters: 0.8 },
  { label: 'Sofa', widthMeters: 2.0, depthMeters: 0.9 },
  { label: 'Bed', widthMeters: 2.0, depthMeters: 1.6 },
  { label: 'Cabinet', widthMeters: 1.0, depthMeters: 0.5 }
];

export function pixelDistance(a: PixelPoint, b: PixelPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Builds a scale from two clicked points whose real distance the user knows,
 * such as the width of a door or the room's width.
 */
export function calibrateScale(a: PixelPoint, b: PixelPoint, knownMetres: number): PhotoScale {
  if (!Number.isFinite(knownMetres) || knownMetres <= 0) {
    throw new RangeError('The known length must be a positive number of metres.');
  }
  const pixels = pixelDistance(a, b);
  if (pixels < MIN_CALIBRATION_PIXELS) {
    throw new RangeError('The two calibration points are too close. Click the ends of a longer known length.');
  }
  return { pixelsPerMetre: pixels / knownMetres };
}

/**
 * Length in metres between two clicked points on a calibrated photo. The photo is a
 * perspective view, so this is an estimate, not a survey measurement.
 */
export function measureMetres(a: PixelPoint, b: PixelPoint, scale: PhotoScale): number {
  return pixelDistance(a, b) / scale.pixelsPerMetre;
}

export function planPixelToMetres(p: PixelPoint, frame: PlanFrame): Vec2 {
  return {
    x: (p.x - frame.originX) / frame.pixelsPerMetre,
    z: (p.y - frame.originY) / frame.pixelsPerMetre
  };
}

/** Clamps a point into the room, then moves it onto the nearest wall. */
export function snapToNearestWall(p: Vec2, room: RoomSize): WallSnap {
  const hw = room.widthMeters / 2;
  const hl = room.lengthMeters / 2;
  const x = Math.max(-hw, Math.min(hw, p.x));
  const z = Math.max(-hl, Math.min(hl, p.z));

  const candidates: Array<{ distance: number; snap: WallSnap }> = [
    { distance: z + hl, snap: { position: { x, z: -hl }, wall: 'north' } },
    { distance: hl - z, snap: { position: { x, z: hl }, wall: 'south' } },
    { distance: hw - x, snap: { position: { x: hw, z }, wall: 'east' } },
    { distance: x + hw, snap: { position: { x: -hw, z }, wall: 'west' } }
  ];
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]!.snap;
}

/** Distance from a point to the nearest room wall. */
export function distanceToNearestWall(p: Vec2, room: RoomSize): number {
  const hw = room.widthMeters / 2;
  const hl = room.lengthMeters / 2;
  return Math.min(hw - p.x, p.x + hw, hl - p.z, p.z + hl);
}

export interface Footprint {
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
}

/** Axis-aligned footprint. A 90° or 270° rotation swaps width and depth. */
export function footprintOf(o: Pick<RoomObject, 'position' | 'widthMeters' | 'depthMeters' | 'rotationDegrees'>): Footprint {
  const width = o.widthMeters && o.widthMeters > 0 ? o.widthMeters : DEFAULT_FOOTPRINT_METRES;
  const depth = o.depthMeters && o.depthMeters > 0 ? o.depthMeters : DEFAULT_FOOTPRINT_METRES;
  const quarterTurn = o.rotationDegrees === 90 || o.rotationDegrees === 270;
  return {
    x: o.position.x,
    z: o.position.z,
    halfWidth: (quarterTurn ? depth : width) / 2,
    halfDepth: (quarterTurn ? width : depth) / 2
  };
}

const OVERLAP_TOLERANCE = 0.01;

function footprintsOverlap(a: Footprint, b: Footprint): boolean {
  return (
    Math.abs(a.x - b.x) < a.halfWidth + b.halfWidth - OVERLAP_TOLERANCE &&
    Math.abs(a.z - b.z) < a.halfDepth + b.halfDepth - OVERLAP_TOLERANCE
  );
}

/**
 * Checks a builder layout. Returns plain-language problems; an empty list means the
 * layout can be saved. Rules: everything stays inside the room, objects do not
 * overlap, every exit is on a wall, and at least one exit is marked.
 */
export function validateLayout(room: RoomSize, objects: RoomObject[], exits: ExitMarker[]): string[] {
  const issues: string[] = [];
  const hw = room.widthMeters / 2;
  const hl = room.lengthMeters / 2;

  const footprints = objects.map((o) => ({ label: o.label, fp: footprintOf(o) }));
  for (const { label, fp } of footprints) {
    if (fp.x - fp.halfWidth < -hw || fp.x + fp.halfWidth > hw || fp.z - fp.halfDepth < -hl || fp.z + fp.halfDepth > hl) {
      issues.push(`${label} extends outside the room.`);
    }
  }

  for (let i = 0; i < footprints.length; i++) {
    for (let j = i + 1; j < footprints.length; j++) {
      if (footprintsOverlap(footprints[i]!.fp, footprints[j]!.fp)) {
        issues.push(`${footprints[i]!.label} overlaps ${footprints[j]!.label}.`);
      }
    }
  }

  let exitsOnWall = 0;
  for (const exit of exits) {
    if (distanceToNearestWall(exit.position, room) > WALL_TOLERANCE_METRES) {
      issues.push(`${exit.label} is not on a wall.`);
    } else {
      exitsOnWall++;
    }
  }

  if (exitsOnWall === 0) {
    issues.push('Mark at least one exit before saving.');
  }

  return issues;
}

export function makeFurniture(
  label: string,
  position: Vec2,
  widthMeters: number,
  depthMeters: number,
  sizeSource: 'photo' | 'entered'
): RoomObject {
  return {
    id: crypto.randomUUID(),
    kind: 'furniture',
    label,
    position,
    userConfirmed: true,
    widthMeters,
    depthMeters,
    rotationDegrees: 0,
    sizeSource
  };
}

export function makeExit(label: string, position: Vec2, type: ExitMarker['type']): ExitMarker {
  return { id: crypto.randomUUID(), label, position, type, userConfirmed: true };
}
