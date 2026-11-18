/*
 * Hero reel. One 3D model at a time. Every change runs in the same order:
 *   1. the title and subtitle fade out and the colour circle starts growing from the centre;
 *   2. the current model shrinks away (the stage handles this, see data-reel);
 *   3. after a short pause the new title rises in and the new model scales in.
 * Nothing overlaps: the next model waits until the previous one is almost gone.
 */

const REVEAL_MS = 800;       // colour circle
const TEXT_OUT_MS = 180;     // title and subtitle fade out before the new text
const SWAP_DELAY_MS = 420;   // the outgoing model is nearly gone before the next one starts
const AUTOPLAY_MS = 3600;    // time with no interaction before the next model

function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

export function initReel(reduced: boolean): void {
  const hero = document.getElementById('reel');
  const items = hero ? [...hero.querySelectorAll<HTMLElement>('.rf-item')] : [];
  const title = document.getElementById('reelTitle');
  const sub = document.getElementById('reelSub');
  const count = document.getElementById('reelCount');
  const next = document.getElementById('reelNext') as HTMLButtonElement | null;
  const auto = document.getElementById('reelAuto') as HTMLButtonElement | null;
  const rvEl = hero?.querySelector<HTMLElement>('.rf-rv') ?? null;
  const stageEl = hero?.querySelector<HTMLElement>('.rf-stage') ?? null;
  if (!hero || !title || !sub || !count || !next || !auto || !rvEl || !stageEl || items.length === 0) return;
  const heroEl: HTMLElement = hero;
  const titleEl: HTMLElement = title;
  const subEl: HTMLElement = sub;
  const countEl: HTMLElement = count;
  const rv: HTMLElement = rvEl;
  const stage: HTMLElement = stageEl;
  const root = document.documentElement;

  let active = 0;
  let autoOn = !reduced;
  let inView = false;
  let lastAction = performance.now();
  let revealFrame = 0;
  let pendingColor = '';
  let textTimer = 0;
  let swapTimer = 0;

  const colorOf = (i: number): string => items[i]?.dataset.color ?? '#b3e04a';

  function setFlavour(color: string): void {
    root.style.setProperty('--flav', color);
  }

  function writeText(it: HTMLElement): void {
    titleEl.textContent = '';
    titleEl.setAttribute('aria-label', it.dataset.name ?? '');
    [...(it.dataset.name ?? '')].forEach((ch, i) => {
      const s = document.createElement('span');
      s.className = 'rf-ch';
      s.style.setProperty('--i', String(i));
      s.setAttribute('aria-hidden', 'true');
      s.textContent = ch;
      titleEl.appendChild(s);
    });
    subEl.textContent = it.dataset.sub ?? '';
  }

  function revealTo(color: string): void {
    if (revealFrame) {
      cancelAnimationFrame(revealFrame);
      revealFrame = 0;
      setFlavour(pendingColor);
    }
    pendingColor = color;
    if (reduced) {
      setFlavour(color);
      return;
    }
    rv.style.background = color;
    const radius = (Math.hypot(heroEl.clientWidth, heroEl.clientHeight) / 2) * 1.05;
    const start = performance.now();
    const frame = (now: number): void => {
      const t = Math.min(1, (now - start) / REVEAL_MS);
      rv.style.clipPath = `circle(${(radius * easeInOutSine(t)).toFixed(1)}px at 50% 50%)`;
      if (t < 1) {
        revealFrame = requestAnimationFrame(frame);
        return;
      }
      revealFrame = 0;
      setFlavour(color);
      rv.style.clipPath = 'circle(0px at 50% 50%)';
    };
    revealFrame = requestAnimationFrame(frame);
  }

  function show(i: number, instant = false): void {
    const idx = ((i % items.length) + items.length) % items.length;
    const it = items[idx];
    if (!it) return;
    active = idx;
    lastAction = performance.now();

    // the outgoing model is switched off now; the stage shrinks it away
    items.forEach((el, j) => { if (j !== idx) el.setAttribute('data-off', ''); });
    countEl.textContent = String(idx + 1).padStart(2, '0');
    if (!reduced) {
      countEl.animate(
        [{ transform: 'translateY(12px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' }
      );
    }

    window.clearTimeout(textTimer);
    window.clearTimeout(swapTimer);

    if (instant) {
      writeText(it);
      it.removeAttribute('data-off');
      setFlavour(colorOf(idx));
      return;
    }

    // 1. text leaves and the colour circle starts
    titleEl.classList.add('is-out');
    subEl.classList.add('is-out');
    revealTo(colorOf(idx));

    // 2. the new text rises in once the old text has gone
    textTimer = window.setTimeout(() => {
      writeText(it);
      titleEl.classList.remove('is-out');
      subEl.classList.remove('is-out');
    }, reduced ? 0 : TEXT_OUT_MS);

    // 3. the new model scales in after the old one has shrunk away
    swapTimer = window.setTimeout(() => it.removeAttribute('data-off'), reduced ? 0 : SWAP_DELAY_MS);
  }

  next.addEventListener('click', () => show(active + 1));

  auto.addEventListener('click', () => {
    autoOn = !autoOn;
    auto.setAttribute('aria-pressed', String(autoOn));
    auto.classList.toggle('is-off', !autoOn);
    lastAction = performance.now();
  });

  /* swipe the stage left or right */
  let startX = 0;
  let dragging = false;
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    startX = e.clientX;
    dragging = true;
    lastAction = performance.now();
  });
  stage.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 50) show(active + (dx < 0 ? 1 : -1));
  });
  stage.addEventListener('pointercancel', () => { dragging = false; });

  window.addEventListener('keydown', (e) => {
    if (!inView) return;
    lastAction = performance.now();
    if (e.key === 'ArrowRight') show(active + 1);
    else if (e.key === 'ArrowLeft') show(active - 1);
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      inView = entries[0]?.isIntersecting ?? false;
    }, { threshold: 0.6 }).observe(heroEl);
  } else {
    inView = true;
  }

  /* autoplay: advance after the pause with no interaction, only while the hero is on screen */
  window.setInterval(() => {
    if (!autoOn || !inView || document.hidden) return;
    if (performance.now() - lastAction < AUTOPLAY_MS) return;
    show(active + 1);
  }, 400);

  show(0, true);
}
