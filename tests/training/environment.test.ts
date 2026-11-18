import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probeCapabilities, transformPoint, surfaceFromWorldPoints, DeviceEnvironmentMap, OBJECT_DETECTION_UNAVAILABLE } from '../../src/training/environment/deviceEnvironment';

test('probe reports WebXR absent honestly when navigator.xr is missing', async () => {
  const caps = await probeCapabilities({});
  assert.equal(caps.webxr, false);
  assert.equal(caps.immersiveVR, 'unsupported');
  assert.equal(caps.immersiveAR, 'unsupported');
  assert.equal(caps.enabledFeatures, null);
});

test('probe reads supported modes and marks a throwing check as unknown', async () => {
  const xr = {
    isSessionSupported: async (mode: string) => {
      if (mode === 'immersive-vr') return true;
      throw new Error('boom');
    }
  };
  const caps = await probeCapabilities({ xr });
  assert.equal(caps.webxr, true);
  assert.equal(caps.immersiveVR, 'supported');
  assert.equal(caps.immersiveAR, 'unknown');
});

test('transformPoint applies a column-major translation', () => {
  const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, 4, 1];
  assert.deepEqual(transformPoint(m, 1, 0, 0), { x: 3, y: 3, z: 4 });
});

test('surfaceFromWorldPoints measures the bounds and never reports a confidence', () => {
  const s = surfaceFromWorldPoints('p1', 'horizontal', [
    { x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, { x: 3, y: 0, z: 2 }, { x: 0, y: 0, z: 2 }
  ]);
  assert.ok(s);
  assert.equal(s!.width, 3);
  assert.equal(s!.depth, 2);
  assert.equal(s!.source, 'device');
  assert.equal(s!.confidence, null);
  assert.equal(surfaceFromWorldPoints('bad', 'horizontal', [{ x: 0, y: 0, z: 0 }]), null);
});

test('environment map never fabricates objects and states that detection is unavailable', () => {
  const map = new DeviceEnvironmentMap();
  map.upsertSurface(surfaceFromWorldPoints('floor', 'horizontal', [
    { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }
  ])!);
  map.upsertSurface(surfaceFromWorldPoints('floor', 'horizontal', [
    { x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }
  ])!);
  const snap = map.snapshot();
  assert.equal(snap.surfaces.length, 1, 'same plane id updates rather than duplicates');
  assert.equal(snap.surfaces[0]!.width, 5);
  assert.deepEqual(snap.objects, []);
  assert.equal(snap.objectDetection.available, false);
  assert.equal(snap.objectDetection.reason, OBJECT_DETECTION_UNAVAILABLE);
});
