import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRAINING_SCENES, LIVING_ROOM, BEDROOM } from '../../src/training/model/scenarios';
import { validateScene } from '../../src/training/model/validate';
import { analyzeScene } from '../../src/training/safety/analysis';
import { BODY_RADIUS } from '../../src/training/model/constants';
import { distanceToRect, rectOf } from '../../src/training/model/geometry';

test('every training scene passes validation', () => {
  for (const scene of TRAINING_SCENES) {
    assert.deepEqual(validateScene(scene), [], `${scene.id} has layout issues`);
  }
});

test('every simulated object is labelled simulated with no fabricated confidence', () => {
  for (const scene of TRAINING_SCENES) {
    assert.equal(scene.source, 'simulated');
    for (const o of scene.objects) {
      assert.equal(o.source, 'simulated', `${o.id} must be tagged simulated`);
      assert.equal(o.confidence, null, `${o.id} must not claim a detection confidence`);
    }
    assert.match(scene.disclosure, /SIMULATED/);
  }
});

test('realistic furniture dimensions are used (no sub-10 cm furniture, no oversized beds)', () => {
  for (const o of [...LIVING_ROOM.objects, ...BEDROOM.objects]) {
    if (o.kind === 'fallenObject') continue;
    assert.ok(o.width >= 0.3 && o.width <= 2.5, `${o.label} width ${o.width}`);
    assert.ok(o.depth >= 0.2 && o.depth <= 2.5, `${o.label} depth ${o.depth}`);
  }
  const bed = BEDROOM.objects.find((o) => o.kind === 'bed')!;
  assert.ok(bed.width >= 1.2 && bed.width <= 1.6 && bed.depth >= 1.9 && bed.depth <= 2.1, 'double bed should be about 1.5 x 2.0 m');
});

test('no scene blocks every exit', () => {
  for (const scene of TRAINING_SCENES) {
    const analysis = analyzeScene(scene);
    assert.ok(analysis.reachableExitIds.length >= 1, `${scene.id} must keep an exit reachable`);
  }
});

test('the living room front door is blocked only by a narrow corridor; the patio stays clear', () => {
  const analysis = analyzeScene(LIVING_ROOM);
  const patio = analysis.routes.find((r) => r.exitId === 'patio-door')!;
  const front = analysis.routes.find((r) => r.exitId === 'front-door')!;
  assert.equal(patio.reachable, true);
  assert.equal(front.reachable, true);
  assert.equal(patio.status, 'clearInScene');
  assert.equal(analysis.primary?.exitId, 'patio-door', 'the clearer route should be ranked first');
  assert.equal(front.status, 'hazardous', 'the route hugs the fallen bookshelf and should be flagged');
});

test('bedroom balcony route goes through the narrow gap and is not labelled clear', () => {
  const analysis = analyzeScene(BEDROOM);
  const balcony = analysis.routes.find((r) => r.exitId === 'balcony-door')!;
  assert.equal(balcony.reachable, true);
  assert.notEqual(balcony.status, 'clearInScene');
});

test('routes never come closer than the body radius to a blocking object', () => {
  for (const scene of TRAINING_SCENES) {
    const analysis = analyzeScene(scene);
    const blocking = scene.objects.filter((o) => o.blocking).map(rectOf);
    for (const route of analysis.routes.filter((r) => r.reachable)) {
      for (let i = 0; i < route.points.length - 1; i++) {
        const a = route.points[i]!, b = route.points[i + 1]!;
        for (let t = 0; t <= 1; t += 0.05) {
          const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
          for (const rect of blocking) {
            assert.ok(distanceToRect(p, rect) >= BODY_RADIUS - 0.06, `${scene.id} ${route.exitId} passes through ${rect.id}`);
          }
        }
      }
    }
  }
});

test('a route is never labelled clear when it passes a trip hazard', () => {
  for (const scene of TRAINING_SCENES) {
    for (const route of analyzeScene(scene).routes) {
      if (route.hazardIds.length > 0) assert.equal(route.status, 'hazardous');
      if (route.status === 'clearInScene') assert.equal(route.hazardIds.length, 0);
    }
  }
});

test('ranking puts the clearest reachable route first and blocked routes last', () => {
  for (const scene of TRAINING_SCENES) {
    const analysis = analyzeScene(scene);
    const ranks = analysis.routes.filter((r) => r.reachable).map((r) => r.rank);
    assert.deepEqual(ranks, ranks.map((_, i) => i + 1));
    const last = analysis.routes[analysis.routes.length - 1]!;
    if (analysis.routes.some((r) => !r.reachable)) assert.equal(last.reachable, false);
  }
});

test('danger zones include the trip hazard and the narrow gaps', () => {
  const zones = analyzeScene(LIVING_ROOM).dangerZones;
  assert.ok(zones.some((z) => z.kind === 'tripHazard'));
  assert.ok(zones.some((z) => z.kind === 'narrowPassage'));
});
