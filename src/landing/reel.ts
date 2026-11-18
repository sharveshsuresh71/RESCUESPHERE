/*
 * Stride-style hero reel. Each .rf-item holds one 3D model; only the active item is shown, so the
 * layout-bound stage renders one model at a time and it assembles in on every change.
 * A colour circle grows from the centre behind the model and becomes the new page colour (--flav
 * on :root, which the hero and the pinned section both read). The name rises letter by letter.
 */

const REVEAL_MS = 900;
const AUTOPLAY_MS = 3200;
/* the outgoing model fades out first; the incoming one appears after this pause so they never overlap */
const SWAP_DELAY_MS = 1000;

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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
  let swapTimer = 0;
  let pendingColor = '';

  const colorOf = (i: number): string => items[i]?.dataset.color ?? '#b3e04a';

  function setFlavour(color: string): void {
    root.style.setProperty('--flav', color);
  }

  function splitTitle(text: string): void {
    titleEl.textContent = '';
    titleEl.setAttribute('aria-label', text);
    [...text].forEach((ch, i) => {
      const s = document.createElement('span');
      s.className = 'rf-ch';
      s.style.setProperty('--i', String(i));
      s.setAttribute('aria-hidden', 'true');
      s.textContent = ch;
      titleEl.appendChild(s);
    });
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
      rv.style.clipPath = `circle(${(radius * easeInOut(t)).toFixed(1)}px at 50% 50%)`;
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
    items.forEach((el, j) => { if (j !== idx) el.setAttribute('data-off', ''); });
    window.clearTimeout(swapTimer);
    if (instant) {
      items[idx]?.removeAttribute('data-off');
    } else {
      swapTimer = window.setTimeout(() => items[idx]?.removeAttribute('data-off'), SWAP_DELAY_MS);
    }
    splitTitle(it.dataset.name ?? '');
    subEl.textContent = it.dataset.sub ?? '';
    countEl.textContent = String(idx + 1).padStart(2, '0');
    if (!reduced) {
      countEl.animate(
        [{ transform: 'translateY(14px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' }
      );
    }
    if (instant) setFlavour(colorOf(idx));
    else revealTo(colorOf(idx));
    lastAction = performance.now();
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

  /* autoplay: advance after 3.2 s with no interaction, only while the hero is on screen */
  window.setInterval(() => {
    if (!autoOn || !inView || document.hidden) return;
    if (performance.now() - lastAction < AUTOPLAY_MS) return;
    show(active + 1);
  }, 400);

  show(0, true);
}
