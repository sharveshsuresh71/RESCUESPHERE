/*
 * Pinned flow. The page scrolls through a tall section while the sticky stage stays in view.
 * Each of the four steps turns the model 180° (cumulative, so step 4 is 540°) with a soft tween,
 * and the matching caption is shown. The stage reads the angle from data-flip on the slot.
 */

const STEP_TURN_DEG = 180;
const SMOOTH_MS = 220;

export function initInside(reduced: boolean): void {
  const pin = document.getElementById('inside');
  const slot = pin?.querySelector<HTMLElement>('.slot') ?? null;
  const caps = pin ? [...pin.querySelectorAll<HTMLElement>('.rf-cap')] : [];
  if (!pin || !slot || caps.length === 0) return;

  let current = 0;
  let step = 0;
  let last = performance.now();

  function stepFromScroll(): number {
    const range = pin!.offsetHeight - window.innerHeight;
    if (range <= 0) return 0;
    const p = Math.min(0.999, Math.max(0, -pin!.getBoundingClientRect().top / range));
    return Math.min(caps.length - 1, Math.floor(p * caps.length));
  }

  function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = now - last;
    last = now;

    const s = stepFromScroll();
    if (s !== step) {
      step = s;
      caps.forEach((c, i) => c.classList.toggle('is-on', i === s));
    }

    const goal = step * STEP_TURN_DEG;
    if (reduced) {
      current = goal;
    } else {
      current += (goal - current) * (1 - Math.exp(-dt / SMOOTH_MS));
      if (Math.abs(goal - current) < 0.05) current = goal;
    }
    slot!.dataset.flip = current.toFixed(2);
  }
  requestAnimationFrame(frame);
}
