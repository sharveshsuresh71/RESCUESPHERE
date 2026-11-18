import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIVING_ROOM, BEDROOM } from '../../src/training/model/scenarios';
import { EvacuationSession } from '../../src/training/session/EvacuationSession';
import { moveWithCollision } from '../../src/training/physics/movement';
import { BODY_RADIUS } from '../../src/training/model/constants';
import { rectOf, distanceToRect } from '../../src/training/model/geometry';

test('session starts ready, becomes active, and reports the primary route with guidance arrows', () => {
  const session = new EvacuationSession(LIVING_ROOM);
  assert.equal(session.state, 'ready');
  session.start();
  assert.equal(session.state, 'active');
  const g = session.guidance();
  assert.equal(g.primaryExitId, 'patio-door');
  assert.match(g.headline, /Patio door/);
  assert.ok(g.target !== null);
  assert.ok(g.arrows.length > 0, 'arrows should guide the walker');
  assert.ok((g.distanceMeters ?? 0) > 0);
});

test('blocking the primary exit recalculates the route and warns that it is blocked', () => {
  const session = new EvacuationSession(LIVING_ROOM);
  session.start();
  session.setExitBlocked('patio-door', true);
  const g = session.guidance();
  assert.equal(g.primaryExitId, 'front-door', 'route should move to the other exit');
  assert.ok(g.warnings.some((w) => w.severity === 'critical' && /Patio door is now blocked/.test(w.message)));
  assert.ok(g.warnings.some((w) => /New clearest route: Front door/.test(w.message)));
});

test('clearing a blocker restores the original route', () => {
  const session = new EvacuationSession(LIVING_ROOM);
  session.start();
  session.setExitBlocked('patio-door', true);
  session.setExitBlocked('patio-door', false);
  assert.equal(session.guidance().primaryExitId, 'patio-door');
  assert.equal(session.isExitBlocked('patio-door'), false);
});

test('blocking every exit gives a clear no-exit state with an explicit warning', () => {
  const session = new EvacuationSession(LIVING_ROOM);
  session.start();
  session.setExitBlocked('patio-door', true);
  session.setExitBlocked('front-door', true);
  const g = session.guidance();
  assert.equal(g.primaryExitId, null);
  assert.match(g.headline, /No exit is reachable/);
  assert.ok(g.warnings.some((w) => w.id === 'none-reachable'));
});

test('walker cannot walk through furniture; movement slides along it', () => {
  const session = new EvacuationSession(LIVING_ROOM);
  session.start();
  const sofa = LIVING_ROOM.objects.find((o) => o.id === 'sofa')!;
  const from = { x: -1.5, z: 0.4 };
  const into = { x: -1.5, z: 1.5 };
  const pos = moveWithCollision(LIVING_ROOM, LIVING_ROOM.objects, from, into);
  assert.ok(distanceToRect(pos, rectOf(sofa)) >= BODY_RADIUS - 1e-9, 'walker must stop at the sofa boundary');
  assert.notDeepEqual(pos, into);
});

test('walker cannot leave the room through a wall', () => {
  const pos = moveWithCollision(BEDROOM, BEDROOM.objects, { x: 0, z: 0 }, { x: 0, z: 10 });
  assert.ok(pos.z <= BEDROOM.bounds.length / 2 - BODY_RADIUS + 1e-9);
});

test('moveTo ignores input before the session is active', () => {
  const session = new EvacuationSession(BEDROOM);
  const before = { ...session.position };
  session.moveTo({ x: 0.5, z: 0.5 });
  assert.deepEqual(session.position, before);
});

test('reaching an exit is detected and reported', () => {
  const session = new EvacuationSession(BEDROOM);
  session.start();
  const door = BEDROOM.exits.find((e) => e.id === 'balcony-door')!;
  session.moveTo(door.approach);
  assert.equal(session.guidance().reachedExitId, 'balcony-door');
});

test('ending the session is clean and idempotent, and stops further movement', () => {
  const session = new EvacuationSession(LIVING_ROOM);
  session.start();
  const first = session.end('userExit');
  const second = session.end('vrSessionEnded');
  assert.equal(session.state, 'ended');
  assert.equal(first, second, 'summary is fixed at the first end');
  assert.equal(first.reason, 'userExit');
  const at = { ...session.position };
  session.moveTo({ x: 0, z: 0 });
  assert.deepEqual(session.position, at);
});

test('subscribers are notified when the plan changes and can unsubscribe', () => {
  const session = new EvacuationSession(LIVING_ROOM);
  session.start();
  let calls = 0;
  const off = session.subscribe(() => { calls++; });
  session.setExitBlocked('patio-door', true);
  assert.ok(calls >= 1);
  off();
  const after = calls;
  session.setExitBlocked('patio-door', false);
  assert.equal(calls, after);
});

/** Walks the way a user would: steer toward the current guidance target in small steps. */
function walkToExit(scene: typeof LIVING_ROOM, maxSteps = 4000): { reached: string | null; steps: number; session: EvacuationSession } {
  const session = new EvacuationSession(scene);
  session.start();
  for (let step = 0; step < maxSteps; step++) {
    const g = session.guidance();
    if (g.reachedExitId) return { reached: g.reachedExitId, steps: step, session };
    if (!g.target) break;
    const p = session.position;
    const dx = g.target.x - p.x, dz = g.target.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const stepLen = Math.min(0.05, d);
    session.moveTo({ x: p.x + (dx / d) * stepLen, z: p.z + (dz / d) * stepLen });
  }
  return { reached: session.guidance().reachedExitId, steps: maxSteps, session };
}

test('following the guidance arrows through collision physics reaches the primary exit (living room)', () => {
  const { reached, session } = walkToExit(LIVING_ROOM);
  assert.equal(reached, session.analysis.primary?.exitId);
});

test('following the guidance arrows reaches the primary exit (bedroom)', () => {
  const { reached, session } = walkToExit(BEDROOM);
  assert.equal(reached, session.analysis.primary?.exitId);
});

test('walking the guided route never passes through blocking furniture', () => {
  const session = new EvacuationSession(LIVING_ROOM);
  session.start();
  const { rectOf: toRect } = { rectOf };
  const blocking = LIVING_ROOM.objects.filter((o) => o.blocking).map(toRect);
  for (let step = 0; step < 4000; step++) {
    const g = session.guidance();
    if (g.reachedExitId || !g.target) break;
    const p = session.position;
    const dx = g.target.x - p.x, dz = g.target.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const stepLen = Math.min(0.05, d);
    session.moveTo({ x: p.x + (dx / d) * stepLen, z: p.z + (dz / d) * stepLen });
    for (const rect of blocking) {
      assert.ok(distanceToRect(session.position, rect) >= BODY_RADIUS - 1e-9, `walker entered ${rect.id}`);
    }
  }
});
