/*
 * Pinned product overview. The page scrolls through a tall section while the sticky stage stays
 * in view. Each of the four steps (room, doors, route, plan) turns the floor plan a quarter turn
 * on a time-based ease-in-out tween, shows its caption, and lights its place on the step rail.
 * The stage reads the angle from data-flip on the slot.
 */

const STEP_TURN_DEG = 90;
const TURN_MS = 1100;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function initInside(reduced: boolean): void {
  const pin = document.getElementById('inside');
  const slot = pin?.querySelector<HTMLElement>('.slot') ?? null;
  const caps = pin ? [...pin.querySelectorAll<HTMLElement>('.rf-cap')] : [];
  const rail = pin ? [...pin.querySelectorAll<HTMLElement>('.rf-rail li')] : [];
  if (!pin || !slot || caps.length === 0) return;
  const pinEl: HTMLElement = pin;
  const slotEl: HTMLElement = slot;

  let step = 0;
  let from = 0;
  let to = 0;
  let tStart = 0;
  let current = 0;

  function stepFromScroll(): number {
    const range = pinEl.offsetHeight - window.innerHeight;
    if (range <= 0) return 0;
    const p = Math.min(0.999, Math.max(0, -pinEl.getBoundingClientRect().top / range));
    return Math.min(caps.length - 1, Math.floor(p * caps.length));
  }

  function frame(now: number): void {
    requestAnimationFrame(frame);

    const s = stepFromScroll();
    if (s !== step) {
      step = s;
      caps.forEach((c, i) => c.classList.toggle('is-on', i === s));
      rail.forEach((r, i) => r.classList.toggle('is-on', i <= s));
      from = current;
      to = step * STEP_TURN_DEG;
      tStart = now;
    }

    const t = reduced ? 1 : Math.min(1, (now - tStart) / TURN_MS);
    current = from + (to - from) * easeInOutCubic(t);
    slotEl.dataset.flip = current.toFixed(2);
  }
  requestAnimationFrame(frame);
}
