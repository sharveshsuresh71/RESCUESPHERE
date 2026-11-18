import type { SessionWarning } from '../session/EvacuationSession';

export interface HudModel {
  /** Always shown so the training data is never mistaken for a real room. */
  badge: string;
  headline: string;
  instruction: string;
  distanceMeters: number | null;
  warnings: SessionWarning[];
  /** Shown instead of guidance once the session has ended. */
  endedNotice?: string;
}

export const HUD_WIDTH = 1024;
export const HUD_HEIGHT = 512;

const SEVERITY_COLOR: Record<SessionWarning['severity'], string> = {
  critical: '#ff5d6c',
  caution: '#ffb84d',
  info: '#8ea0ff'
};

/** Word-wraps text to a maximum pixel width using the context's current font. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws the guidance HUD onto a canvas. The same canvas is shown on desktop and used as a 3D panel in VR. */
export function drawHud(canvas: HTMLCanvasElement, model: HudModel): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;

  ctx.fillStyle = 'rgba(8, 10, 30, 0.92)';
  roundRect(ctx, 0, 0, w, h, 28);
  ctx.fill();
  ctx.strokeStyle = 'rgba(92, 242, 255, 0.55)';
  ctx.lineWidth = 4;
  roundRect(ctx, 2, 2, w - 4, h - 4, 26);
  ctx.stroke();

  ctx.font = '600 26px system-ui, sans-serif';
  ctx.fillStyle = '#ffb84d';
  ctx.fillText(model.badge, 40, 56);

  if (model.endedNotice) {
    ctx.font = '600 44px system-ui, sans-serif';
    ctx.fillStyle = '#e8ecff';
    ctx.fillText(model.endedNotice, 40, 160);
    return;
  }

  ctx.font = '700 56px system-ui, sans-serif';
  ctx.fillStyle = '#5cf2ff';
  ctx.fillText(model.headline, 40, 130);

  ctx.font = '400 30px system-ui, sans-serif';
  ctx.fillStyle = '#e8ecff';
  const lines = wrapText(ctx, model.instruction, w - 80).slice(0, 3);
  lines.forEach((line, i) => ctx.fillText(line, 40, 180 + i * 40));

  if (model.distanceMeters !== null) {
    ctx.font = '600 32px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${model.distanceMeters.toFixed(1)} m to go`, 40, 340);
  }

  let y = 392;
  ctx.font = '600 26px system-ui, sans-serif';
  for (const warning of model.warnings.slice(0, 2)) {
    ctx.fillStyle = SEVERITY_COLOR[warning.severity];
    const wrapped = wrapText(ctx, warning.message, w - 80).slice(0, 1);
    for (const line of wrapped) {
      ctx.fillText(`▲ ${line}`, 40, y);
      y += 34;
    }
  }
  ctx.font = '400 22px system-ui, sans-serif';
  ctx.fillStyle = '#9aa3c7';
  ctx.fillText('Simulation only · not a guarantee of real-world safety', 40, h - 28);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
