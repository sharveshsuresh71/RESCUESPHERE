import type { ExitMarker, RoomObject, RoomPlan } from '../core/types';
import { createDefaultPlan } from '../data/defaultPlan';
import { LocalStorageManager } from '../data/LocalStorageManager';
import {
  DEFAULT_FOOTPRINT_METRES,
  FURNITURE_PRESETS,
  calibrateScale,
  footprintOf,
  makeExit,
  makeFurniture,
  measureMetres,
  planPixelToMetres,
  snapToNearestWall,
  validateLayout,
  type PhotoScale,
  type PixelPoint,
  type PlanFrame,
  type RoomSize
} from './layoutGeometry';

/**
 * Photo-assisted room builder. The photo is a reference: it gives sizes once the
 * user sets a scale. Furniture and exits are placed by clicking a top-down plan.
 * Nothing is detected automatically, and every saved item is one the user placed.
 */

const PLAN_WIDTH = 480;
const PLAN_HEIGHT = 400;
const PLAN_MARGIN_METRES = 0.6;

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

const photoCanvas = $<HTMLCanvasElement>('photo-canvas');
const planCanvas = $<HTMLCanvasElement>('plan-canvas');
const video = $<HTMLVideoElement>('frame-video');
const frameSlider = $<HTMLInputElement>('frame-slider');
const videoControls = $<HTMLDivElement>('video-controls');
const fileInput = $<HTMLInputElement>('file-input');
const knownLengthInput = $<HTMLInputElement>('known-length');
const scaleStatus = $<HTMLParagraphElement>('scale-status');
const measureReadout = $<HTMLParagraphElement>('measure-readout');
const photoHint = $<HTMLParagraphElement>('photo-hint');
const calibrateButton = $<HTMLButtonElement>('calibrate-btn');
const measureButton = $<HTMLButtonElement>('measure-btn');
const applyScaleButton = $<HTMLButtonElement>('apply-scale-btn');
const useWidthButton = $<HTMLButtonElement>('use-width-btn');
const useDepthButton = $<HTMLButtonElement>('use-depth-btn');
const roomWidthInput = $<HTMLInputElement>('room-width');
const roomLengthInput = $<HTMLInputElement>('room-length');
const toolSelect = $<HTMLSelectElement>('plan-tool');
const presetSelect = $<HTMLSelectElement>('preset-select');
const furnitureLabelInput = $<HTMLInputElement>('furniture-label');
const furnitureWidthInput = $<HTMLInputElement>('furniture-width');
const furnitureDepthInput = $<HTMLInputElement>('furniture-depth');
const exitLabelInput = $<HTMLInputElement>('exit-label');
const exitTypeSelect = $<HTMLSelectElement>('exit-type');
const itemsList = $<HTMLUListElement>('items-list');
const issuesList = $<HTMLUListElement>('issues-list');
const saveButton = $<HTMLButtonElement>('save-btn');
const saveStatus = $<HTMLParagraphElement>('save-status');

const storage = new LocalStorageManager();
const plan: RoomPlan = storage.loadPlan() ?? createDefaultPlan();

let room: RoomSize = {
  widthMeters: plan.roomDimensions.widthMeters ?? 4,
  lengthMeters: plan.roomDimensions.lengthMeters ?? 5
};
let objects: RoomObject[] = [...plan.roomObjects];
let exits: ExitMarker[] = [...plan.exits];

let photoSource: HTMLImageElement | HTMLCanvasElement | null = null;
let scale: PhotoScale | null = null;
let mode: 'idle' | 'calibrate' | 'measure' = 'idle';
let photoPoints: PixelPoint[] = [];
/** True while the furniture size fields hold a value taken from the photo. */
let sizeFromPhoto = false;

function eventToCanvasPixel(ev: MouseEvent, canvas: HTMLCanvasElement): PixelPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) * (canvas.width / rect.width),
    y: (ev.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function parsePositive(input: HTMLInputElement, fallback: number): number {
  const value = Number.parseFloat(input.value);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function setMode(next: typeof mode): void {
  mode = next;
  photoPoints = [];
  calibrateButton.setAttribute('aria-pressed', String(next === 'calibrate'));
  measureButton.setAttribute('aria-pressed', String(next === 'measure'));
  photoHint.textContent =
    next === 'calibrate' ? 'Click the two ends of something whose length you know, then enter that length and apply.'
    : next === 'measure' ? 'Click the two ends of the span you want to measure.'
    : 'Set the scale first, then measure objects in the photo.';
  drawPhoto();
}

function drawPhoto(): void {
  const ctx = photoCanvas.getContext('2d');
  if (!ctx || !photoSource) return;
  ctx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);
  ctx.drawImage(photoSource, 0, 0, photoCanvas.width, photoCanvas.height);

  ctx.fillStyle = '#e11d48';
  ctx.strokeStyle = '#e11d48';
  ctx.lineWidth = Math.max(2, photoCanvas.width / 300);
  for (const p of photoPoints) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, ctx.lineWidth * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (photoPoints.length === 2) {
    ctx.beginPath();
    ctx.moveTo(photoPoints[0]!.x, photoPoints[0]!.y);
    ctx.lineTo(photoPoints[1]!.x, photoPoints[1]!.y);
    ctx.stroke();
  }
}

function setPhotoSource(source: HTMLImageElement | HTMLCanvasElement, width: number, height: number): void {
  photoSource = source;
  photoCanvas.width = width;
  photoCanvas.height = height;
  scale = null;
  scaleStatus.textContent = 'Scale not set. Sizes from the photo are unavailable until you set it.';
  measureReadout.textContent = '';
  setMode('idle');
  drawPhoto();
}

function loadPhotoFile(file: File): void {
  const url = URL.createObjectURL(file);
  if (file.type.startsWith('video/')) {
    video.src = url;
    videoControls.hidden = false;
    return;
  }
  const img = new Image();
  img.onload = () => {
    videoControls.hidden = true;
    setPhotoSource(img, img.naturalWidth, img.naturalHeight);
    URL.revokeObjectURL(url);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    scaleStatus.textContent = 'That file could not be opened as a photo.';
  };
  img.src = url;
}

/** Copies the video's current frame into the photo canvas. */
function captureVideoFrame(): void {
  if (video.videoWidth === 0) return;
  const frame = document.createElement('canvas');
  frame.width = video.videoWidth;
  frame.height = video.videoHeight;
  frame.getContext('2d')?.drawImage(video, 0, 0);
  setPhotoSource(frame, frame.width, frame.height);
}

video.addEventListener('loadeddata', () => {
  frameSlider.max = String(video.duration || 0);
  frameSlider.value = '0';
  video.currentTime = 0;
});
video.addEventListener('seeked', captureVideoFrame);
frameSlider.addEventListener('input', () => {
  video.currentTime = Number.parseFloat(frameSlider.value);
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) loadPhotoFile(file);
});

photoCanvas.addEventListener('click', (ev) => {
  if (!photoSource || mode === 'idle') return;
  const p = eventToCanvasPixel(ev, photoCanvas);
  if (mode === 'calibrate' && photoPoints.length >= 2) photoPoints.shift();
  photoPoints.push(p);

  if (mode === 'measure' && photoPoints.length === 2) {
    if (!scale) {
      measureReadout.textContent = 'Set the scale first, so the measurement has units.';
    } else {
      const metres = measureMetres(photoPoints[0]!, photoPoints[1]!, scale);
      measureReadout.textContent = `Measured ${metres.toFixed(2)} m. This is an estimate from the photo.`;
      useWidthButton.dataset.metres = metres.toFixed(2);
      useDepthButton.dataset.metres = metres.toFixed(2);
    }
    photoPoints = [];
  }
  drawPhoto();
});

applyScaleButton.addEventListener('click', () => {
  if (photoPoints.length !== 2) {
    scaleStatus.textContent = 'Click two points on the photo first.';
    return;
  }
  try {
    scale = calibrateScale(photoPoints[0]!, photoPoints[1]!, parsePositiveOrThrow(knownLengthInput));
    scaleStatus.textContent = `Scale set: about ${scale.pixelsPerMetre.toFixed(0)} pixels per metre. Photo sizes are estimates.`;
    setMode('idle');
  } catch (err) {
    scaleStatus.textContent = err instanceof Error ? err.message : 'The scale could not be set.';
  }
});

function parsePositiveOrThrow(input: HTMLInputElement): number {
  const value = Number.parseFloat(input.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('Enter the known length in metres, for example 0.9 for a 90 cm door.');
  }
  return value;
}

calibrateButton.addEventListener('click', () => setMode(mode === 'calibrate' ? 'idle' : 'calibrate'));
measureButton.addEventListener('click', () => {
  if (!scale) {
    measureReadout.textContent = 'Set the scale first.';
    return;
  }
  setMode(mode === 'measure' ? 'idle' : 'measure');
});

function useMeasurement(target: HTMLInputElement, button: HTMLButtonElement): void {
  const metres = button.dataset.metres;
  if (!metres) {
    measureReadout.textContent = 'Measure something first.';
    return;
  }
  target.value = metres;
  sizeFromPhoto = true;
}
useWidthButton.addEventListener('click', () => useMeasurement(furnitureWidthInput, useWidthButton));
useDepthButton.addEventListener('click', () => useMeasurement(furnitureDepthInput, useDepthButton));

presetSelect.addEventListener('change', () => {
  const preset = FURNITURE_PRESETS.find((p) => p.label === presetSelect.value);
  if (!preset) return;
  furnitureLabelInput.value = preset.label;
  furnitureWidthInput.value = String(preset.widthMeters);
  furnitureDepthInput.value = String(preset.depthMeters);
  sizeFromPhoto = false;
});
for (const input of [furnitureWidthInput, furnitureDepthInput]) {
  input.addEventListener('input', () => {
    sizeFromPhoto = false;
  });
}

for (const input of [roomWidthInput, roomLengthInput]) {
  input.addEventListener('change', () => {
    room = {
      widthMeters: parsePositive(roomWidthInput, room.widthMeters),
      lengthMeters: parsePositive(roomLengthInput, room.lengthMeters)
    };
    refresh();
  });
}

function planFrame(): PlanFrame {
  const pixelsPerMetre = Math.min(
    PLAN_WIDTH / (room.widthMeters + PLAN_MARGIN_METRES),
    PLAN_HEIGHT / (room.lengthMeters + PLAN_MARGIN_METRES)
  );
  return { originX: PLAN_WIDTH / 2, originY: PLAN_HEIGHT / 2, pixelsPerMetre };
}

function drawPlan(): void {
  const ctx = planCanvas.getContext('2d');
  if (!ctx) return;
  const frame = planFrame();
  const toPx = (x: number, z: number) => ({ x: frame.originX + x * frame.pixelsPerMetre, y: frame.originY + z * frame.pixelsPerMetre });

  ctx.clearRect(0, 0, PLAN_WIDTH, PLAN_HEIGHT);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, PLAN_WIDTH, PLAN_HEIGHT);

  const topLeft = toPx(-room.widthMeters / 2, -room.lengthMeters / 2);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.strokeRect(topLeft.x, topLeft.y, room.widthMeters * frame.pixelsPerMetre, room.lengthMeters * frame.pixelsPerMetre);

  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const o of objects) {
    const fp = footprintOf(o);
    const corner = toPx(fp.x - fp.halfWidth, fp.z - fp.halfDepth);
    const w = fp.halfWidth * 2 * frame.pixelsPerMetre;
    const d = fp.halfDepth * 2 * frame.pixelsPerMetre;
    ctx.fillStyle = o.sizeSource === 'photo' ? 'rgba(14,165,233,0.35)' : 'rgba(100,116,139,0.35)';
    ctx.fillRect(corner.x, corner.y, w, d);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.strokeRect(corner.x, corner.y, w, d);
    const c = toPx(fp.x, fp.z);
    ctx.fillStyle = '#0f172a';
    ctx.fillText(o.label, c.x, c.y);
  }

  for (const e of exits) {
    const p = toPx(e.position.x, e.position.z);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = e.type === 'primary' ? '#16a34a' : '#f59e0b';
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.fillText(e.label, p.x, p.y - 14);
  }
}

planCanvas.addEventListener('click', (ev) => {
  const frame = planFrame();
  const rect = planCanvas.getBoundingClientRect();
  const pixel = {
    x: (ev.clientX - rect.left) * (planCanvas.width / rect.width),
    y: (ev.clientY - rect.top) * (planCanvas.height / rect.height)
  };
  const metres = planPixelToMetres(pixel, frame);

  if (toolSelect.value === 'exit') {
    const snap = snapToNearestWall(metres, room);
    const label = exitLabelInput.value.trim() || `Exit ${exits.length + 1}`;
    exits.push(makeExit(label, snap.position, exitTypeSelect.value === 'alternative' ? 'alternative' : 'primary'));
  } else {
    const label = furnitureLabelInput.value.trim() || 'Furniture';
    const width = parsePositive(furnitureWidthInput, DEFAULT_FOOTPRINT_METRES);
    const depth = parsePositive(furnitureDepthInput, DEFAULT_FOOTPRINT_METRES);
    objects.push(makeFurniture(label, metres, width, depth, sizeFromPhoto ? 'photo' : 'entered'));
  }
  refresh();
});

function removeObject(id: string): void {
  objects = objects.filter((o) => o.id !== id);
  refresh();
}

function removeExit(id: string): void {
  exits = exits.filter((e) => e.id !== id);
  refresh();
}

function renderItems(): void {
  itemsList.replaceChildren();
  const rows: Array<{ text: string; onRemove: () => void }> = [
    ...objects.map((o) => ({
      text: `${o.label}: ${(o.widthMeters ?? 0).toFixed(2)} × ${(o.depthMeters ?? 0).toFixed(2)} m, ${o.sizeSource === 'photo' ? 'size from photo (estimate)' : 'size entered by you'}`,
      onRemove: () => removeObject(o.id)
    })),
    ...exits.map((e) => ({
      text: `${e.label}: ${e.type === 'primary' ? 'main exit' : 'alternative exit'}`,
      onRemove: () => removeExit(e.id)
    }))
  ];
  if (rows.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Nothing placed yet.';
    itemsList.append(li);
    return;
  }
  for (const row of rows) {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = row.text;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', row.onRemove);
    li.append(text, ' ', remove);
    itemsList.append(li);
  }
}

function renderIssues(): string[] {
  const issues = validateLayout(room, objects, exits);
  issuesList.replaceChildren();
  for (const issue of issues) {
    const li = document.createElement('li');
    li.textContent = issue;
    issuesList.append(li);
  }
  saveButton.disabled = issues.length > 0;
  return issues;
}

function refresh(): void {
  drawPlan();
  renderItems();
  renderIssues();
}

saveButton.addEventListener('click', () => {
  if (validateLayout(room, objects, exits).length > 0) return;

  const saved: RoomPlan = {
    ...plan,
    roomTemplate: 'custom',
    roomDimensions: { widthMeters: room.widthMeters, lengthMeters: room.lengthMeters },
    roomObjects: objects,
    exits,
    // Routes that pointed at an exit you removed would no longer work.
    routes: plan.routes.filter((r) => exits.some((e) => e.id === r.exitId)),
    updatedAt: new Date().toISOString()
  };
  storage.savePlan(saved);

  // Storage can fail silently (private mode, full quota). Read back to confirm.
  const check = storage.loadPlan();
  if (check?.updatedAt === saved.updatedAt) {
    saveStatus.textContent = 'Saved. Open the plan in the app to see the arrow routes update.';
  } else {
    saveStatus.textContent = 'The layout could not be saved in this browser. Check that storage is allowed, then try again.';
  }
});

roomWidthInput.value = String(room.widthMeters);
roomLengthInput.value = String(room.lengthMeters);
presetSelect.replaceChildren(
  ...FURNITURE_PRESETS.map((p) => {
    const option = document.createElement('option');
    option.value = p.label;
    option.textContent = p.label;
    return option;
  })
);
photoCanvas.width = 640;
photoCanvas.height = 480;
setMode('idle');
refresh();
