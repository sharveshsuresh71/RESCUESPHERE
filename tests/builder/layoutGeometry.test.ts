import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calibrateScale,
  distanceToNearestWall,
  footprintOf,
  makeExit,
  makeFurniture,
  measureMetres,
  planPixelToMetres,
  snapToNearestWall,
  validateLayout
} from '../../src/builder/layoutGeometry';

const ROOM = { widthMeters: 4, lengthMeters: 5 };

test('calibration converts a known length into pixels per metre', () => {
  const scale = calibrateScale({ x: 0, y: 0 }, { x: 300, y: 400 }, 2.5);
  // Distance is 500 px over 2.5 m, so 200 px per metre.
  assert.equal(scale.pixelsPerMetre, 200);
  assert.equal(measureMetres({ x: 10, y: 10 }, { x: 110, y: 10 }, scale), 0.5);
});

test('calibration rejects invalid lengths and points that are too close', () => {
  assert.throws(() => calibrateScale({ x: 0, y: 0 }, { x: 100, y: 0 }, 0), RangeError);
  assert.throws(() => calibrateScale({ x: 0, y: 0 }, { x: 100, y: 0 }, Number.NaN), RangeError);
  assert.throws(() => calibrateScale({ x: 0, y: 0 }, { x: 3, y: 4 }, 1), RangeError);
});

test('plan pixels map to metres from the room centre, x right and z down', () => {
  const frame = { originX: 200, originY: 150, pixelsPerMetre: 60 };
  assert.deepEqual(planPixelToMetres({ x: 200, y: 150 }, frame), { x: 0, z: 0 });
  assert.deepEqual(planPixelToMetres({ x: 260, y: 90 }, frame), { x: 1, z: -1 });
});

test('a point is snapped to the closest wall', () => {
  const near = snapToNearestWall({ x: 1.8, z: 0 }, ROOM);
  assert.equal(near.wall, 'east');
  assert.deepEqual(near.position, { x: 2, z: 0 });

  const north = snapToNearestWall({ x: 0, z: -2.3 }, ROOM);
  assert.equal(north.wall, 'north');
  assert.deepEqual(north.position, { x: 0, z: -2.5 });
});

test('points outside the room are clamped before snapping', () => {
  const snap = snapToNearestWall({ x: 9, z: 0 }, ROOM);
  assert.equal(snap.wall, 'east');
  assert.deepEqual(snap.position, { x: 2, z: 0 });
});

test('distance to the nearest wall is measured from the room edge', () => {
  assert.equal(distanceToNearestWall({ x: 0, z: 0 }, ROOM), 2);
  assert.ok(Math.abs(distanceToNearestWall({ x: 1.9, z: 0 }, ROOM) - 0.1) < 1e-9);
});

test('rotation of a quarter turn swaps width and depth in the footprint', () => {
  const fp = footprintOf({ position: { x: 0, z: 0 }, widthMeters: 2, depthMeters: 1, rotationDegrees: 90 });
  assert.equal(fp.halfWidth, 0.5);
  assert.equal(fp.halfDepth, 1);
});

test('a layout with an exit and one clear object passes validation', () => {
  const sofa = makeFurniture('Sofa', { x: 0, z: 1.5 }, 2, 0.9, 'entered');
  const exit = makeExit('Front door', { x: 0, z: 2.5 }, 'primary');
  assert.deepEqual(validateLayout(ROOM, [sofa], [exit]), []);
});

test('objects outside the room are reported', () => {
  const bed = makeFurniture('Bed', { x: 1.5, z: 0 }, 2, 1.6, 'photo');
  const exit = makeExit('Door', { x: 0, z: 2.5 }, 'primary');
  assert.deepEqual(validateLayout(ROOM, [bed], [exit]), ['Bed extends outside the room.']);
});

test('overlapping objects are reported, but touching ones are not', () => {
  const a = makeFurniture('Table', { x: 0, z: 0 }, 1.2, 0.8, 'entered');
  const b = makeFurniture('Chair', { x: 0.5, z: 0 }, 0.5, 0.5, 'entered');
  const exit = makeExit('Door', { x: 0, z: 2.5 }, 'primary');
  assert.deepEqual(validateLayout(ROOM, [a, b], [exit]), ['Table overlaps Chair.']);

  // Stool's edge sits exactly on the table's edge: that is allowed.
  const touching = makeFurniture('Stool', { x: 0, z: 0.65 }, 0.5, 0.5, 'entered');
  assert.deepEqual(validateLayout(ROOM, [a, touching], [exit]), []);
});

test('an exit away from every wall is reported', () => {
  const floating = makeExit('Window', { x: 0, z: 0 }, 'alternative');
  assert.deepEqual(validateLayout(ROOM, [], [floating]), [
    'Window is not on a wall.',
    'Mark at least one exit before saving.'
  ]);
});

test('a layout with no exit cannot be saved', () => {
  assert.deepEqual(validateLayout(ROOM, [], []), ['Mark at least one exit before saving.']);
});
