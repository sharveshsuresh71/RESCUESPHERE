import type { RoomPlan, Vec2 } from '../core/types';

export type EditableLayer = 'objects' | 'exits' | 'obstacles' | 'none';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SCALE = 60; // px per meter

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

/**
 * Top-down 2D room plan. Markers on the editable layer can be dragged with
 * mouse, touch or pen. Positions are metres from the room centre (x right, z down).
 */
export function createPlanEditor(
  plan: RoomPlan,
  editable: EditableLayer,
  onChange: () => void
): SVGSVGElement {
  const width = plan.roomDimensions.widthMeters ?? 4;
  const length = plan.roomDimensions.lengthMeters ?? 5;
  const pad = 20;
  const w = width * SCALE;
  const h = length * SCALE;

  const svg = el('svg', {
    viewBox: `${-w / 2 - pad} ${-h / 2 - pad} ${w + pad * 2} ${h + pad * 2}`,
    class: 'plan-editor',
    role: 'img',
    'aria-label': 'Top-down room plan. Drag markers to reposition them.'
  });

  svg.append(el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, class: 'plan-room' }));

  const toPx = (p: Vec2) => ({ x: p.x * SCALE, y: p.z * SCALE });
  const clampPoint = (p: Vec2): Vec2 => ({
    x: Math.max(-width / 2, Math.min(width / 2, p.x)),
    z: Math.max(-length / 2, Math.min(length / 2, p.z))
  });

  // Routes (behind markers)
  for (const route of plan.routes) {
    if (route.routePoints.length < 2) continue;
    const pts = route.routePoints.map((p) => `${p.x * SCALE},${p.z * SCALE}`).join(' ');
    svg.append(
      el('polyline', {
        points: pts,
        class: route.label === 'Route A' ? 'plan-route route-a' : 'plan-route route-b'
      })
    );
  }

  const addMarker = (
    position: Vec2,
    cls: string,
    text: string,
    layer: EditableLayer,
    footprint?: { width: number; depth: number }
  ): void => {
    const group = el('g', { class: `plan-marker ${cls}${editable === layer ? ' draggable' : ''}` });
    const px = toPx(position);
    const markerShape = footprint
      ? el('rect', { x: -footprint.width * SCALE / 2, y: -footprint.depth * SCALE / 2, width: footprint.width * SCALE, height: footprint.depth * SCALE, rx: 5 })
      : el('circle', { cx: 0, cy: 0, r: 13 });
    if (footprint) markerShape.setAttribute('class', 'furniture-footprint');
    const label = el('text', { x: 0, y: 4, 'text-anchor': 'middle' });
    label.textContent = text.slice(0, 2).toUpperCase();
    const title = el('title', {});
    title.textContent = text;
    group.append(markerShape, label, title);
    group.setAttribute('transform', `translate(${px.x} ${px.y})`);
    svg.append(group);

    if (editable !== layer) return;

    group.setAttribute('tabindex', '0');
    group.setAttribute('role', 'button');
    group.setAttribute('aria-label', `${text}. Drag or use arrow keys to move.`);

    const apply = () => group.setAttribute('transform', `translate(${position.x * SCALE} ${position.z * SCALE})`);

    group.addEventListener('pointerdown', (event) => {
      group.setPointerCapture(event.pointerId);
      const move = (e: PointerEvent) => {
        const ctm = svg.getScreenCTM();
        if (!ctm) return;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const local = pt.matrixTransform(ctm.inverse());
        const next = clampPoint({ x: local.x / SCALE, z: local.y / SCALE });
        position.x = Number(next.x.toFixed(2));
        position.z = Number(next.z.toFixed(2));
        apply();
      };
      const up = () => {
        group.removeEventListener('pointermove', move);
        group.removeEventListener('pointerup', up);
        group.removeEventListener('pointercancel', up);
        onChange();
      };
      group.addEventListener('pointermove', move);
      group.addEventListener('pointerup', up);
      group.addEventListener('pointercancel', up);
      event.preventDefault();
    });

    group.addEventListener('keydown', (event) => {
      const step = 0.1;
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step]
      };
      const d = delta[event.key];
      if (!d) return;
      const next = clampPoint({ x: position.x + d[0], z: position.z + d[1] });
      position.x = Number(next.x.toFixed(2));
      position.z = Number(next.z.toFixed(2));
      apply();
      onChange();
      event.preventDefault();
    });
  };

  for (const object of plan.roomObjects) {
    const footprint = object.kind === 'furniture' || object.kind === 'custom'
      ? { width: object.widthMeters ?? 0.8, depth: object.depthMeters ?? 0.6 }
      : undefined;
    addMarker(object.position, `obj-${object.kind}`, object.label, 'objects', footprint);
  }
  for (const exit of plan.exits) addMarker(exit.position, 'exit', exit.label.replace('Potential Exit ', ''), 'exits');
  for (const obstacle of plan.obstacles) addMarker(obstacle.position, 'obstacle', obstacle.label, 'obstacles');

  return svg;
}
