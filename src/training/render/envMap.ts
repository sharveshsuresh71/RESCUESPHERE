import type { DeviceEnvironmentSnapshot } from './envMapTypes';
import type { SceneAnalysis } from '../safety/analysis';
import type { SceneObject, TrainingScene, Vec2 } from '../model/types';

export interface EnvMapInput {
  scene: TrainingScene;
  objects: readonly SceneObject[];
  analysis: SceneAnalysis;
  position: Vec2;
  device: DeviceEnvironmentSnapshot | null;
}

const PX_PER_METER = 90;

/**
 * Top-down environment map. Device-detected surfaces are drawn in green and labelled
 * as real. Simulated objects are drawn in cyan/amber and labelled as simulated. The
 * two are never mixed.
 */
export function drawEnvironmentMap(canvas: HTMLCanvasElement, input: EnvMapInput): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { scene, objects, analysis, position, device } = input;
  const margin = 40;
  const roomW = scene.bounds.width, roomL = scene.bounds.length;
  const pxW = roomW * PX_PER_METER, pxL = roomL * PX_PER_METER;
  canvas.width = Math.round(pxW + margin * 2);
  canvas.height = Math.round(pxL + margin * 2 + 60);

  const toPx = (p: Vec2) => ({ x: margin + (p.x + roomW / 2) * PX_PER_METER, y: margin + (roomL / 2 - p.z) * PX_PER_METER });

  ctx.fillStyle = '#0c0f26';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#dfe5f5';
  ctx.lineWidth = 4;
  ctx.strokeRect(margin, margin, pxW, pxL);

  for (const zone of analysis.dangerZones) {
    const c = toPx(zone.center);
    ctx.beginPath();
    ctx.arc(c.x, c.y, zone.radius * PX_PER_METER, 0, Math.PI * 2);
    ctx.fillStyle = zone.kind === 'tripHazard' ? 'rgba(255,184,77,0.18)' : zone.kind === 'blockedDoorway' ? 'rgba(255,93,108,0.25)' : 'rgba(255,220,90,0.14)';
    ctx.fill();
  }

  if (device) {
    for (const s of device.surfaces) {
      const c = toPx({ x: s.center.x, z: s.center.z });
      ctx.strokeStyle = 'rgba(110,255,160,0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x - (s.width * PX_PER_METER) / 2, c.y - (s.depth * PX_PER_METER) / 2, s.width * PX_PER_METER, s.depth * PX_PER_METER);
    }
    for (const p of device.hitPoints) {
      const c = toPx({ x: p.x, z: p.z });
      ctx.fillStyle = 'rgba(110,255,160,0.7)';
      ctx.fillRect(c.x - 1.5, c.y - 1.5, 3, 3);
    }
  }

  for (const o of objects) {
    const c = toPx(o.center);
    const w = o.width * PX_PER_METER, d = o.depth * PX_PER_METER;
    ctx.fillStyle = o.blocking ? 'rgba(92,242,255,0.28)' : 'rgba(255,184,77,0.35)';
    ctx.fillRect(c.x - w / 2, c.y - d / 2, w, d);
    ctx.strokeStyle = o.blocking ? '#5cf2ff' : '#ffb84d';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(c.x - w / 2, c.y - d / 2, w, d);
  }

  for (const route of analysis.routes.filter((r) => r.reachable)) {
    ctx.beginPath();
    route.points.forEach((p, i) => {
      const c = toPx(p);
      if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y);
    });
    ctx.strokeStyle = route.rank === 1 ? '#5cf2ff' : 'rgba(165,139,255,0.6)';
    ctx.lineWidth = route.rank === 1 ? 4 : 2;
    ctx.stroke();
  }

  for (const exit of scene.exits) {
    const c = toPx(exit.center);
    ctx.beginPath();
    ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = analysis.reachableExitIds.includes(exit.id) ? '#29d8ff' : '#ff5d6c';
    ctx.fill();
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillStyle = '#e8ecff';
    ctx.fillText(exit.label, c.x + 12, c.y - 10);
  }

  const p = toPx(position);
  ctx.beginPath();
  ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillStyle = '#ffb84d';
  ctx.fillText('SIMULATED OBJECTS (training data, not detected)', margin, canvas.height - 36);
  ctx.fillStyle = device && device.surfaces.length > 0 ? '#6effa0' : '#9aa3c7';
  ctx.fillText(
    device
      ? `REAL DEVICE DATA: ${device.surfaces.length} surface(s), ${device.hitPoints.length} hit point(s). Furniture: not available.`
      : 'REAL DEVICE DATA: not scanned. Furniture detection is not available on this device.',
    margin,
    canvas.height - 14
  );
}
