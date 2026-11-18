/* DOM effects for the landing page: letter reveals, scroll progress, cursor spotlight,
   tilting cards, magnetic buttons, parallax headings, the FAQ accordion, reveal-on-scroll,
   and the transition into the planner. Everything here is plain DOM and runs without WebGL. */

export function initEffects(reduced: boolean): void {
  /* letter split: each character rises in with a stagger */
  if (!reduced) {
    document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
      if (el.classList.contains('hero-title')) {
        el.querySelectorAll<HTMLElement>('.line').forEach(splitInto);
      } else {
        splitInto(el);
      }
    });
  }

  /* scroll progress bar and parallax headings */
  const bar = document.getElementById('progress');
  const parallax = [...document.querySelectorAll<HTMLElement>('[data-speed]')];
  const onScroll = (): void => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    if (!reduced) {
      for (const el of parallax) {
        const speed = parseFloat(el.dataset.speed ?? '0') || 0;
        const r = el.getBoundingClientRect();
        el.style.transform = `translateY(${(r.top - window.innerHeight / 2) * -speed}px)`;
      }
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* cursor spotlight */
  const spot = document.getElementById('spot');
  if (spot) {
    window.addEventListener('pointermove', (e) => {
      spot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    }, { passive: true });
  }

  /* tilt and magnetic hover: only where a fine pointer exists and motion is allowed */
  if (!reduced && window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll<HTMLElement>('.tilt').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const b = card.getBoundingClientRect();
        const x = (e.clientX - b.left) / b.width - 0.5;
        const y = (e.clientY - b.top) / b.height - 0.5;
        card.style.transform = `perspective(900px) rotateX(${-y * 8}deg) rotateY(${x * 10}deg)`;
      });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; });
    });
    document.querySelectorAll<HTMLElement>('.magnetic').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        const b = btn.getBoundingClientRect();
        btn.style.transform = `translate(${(e.clientX - b.left - b.width / 2) * 0.25}px, ${(e.clientY - b.top - b.height / 2) * 0.25}px)`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
    });
  }

  /* FAQ accordion */
  document.querySelectorAll<HTMLButtonElement>('.accordion .q').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.parentElement;
      if (!item) return;
      const open = !item.classList.contains('open');
      document.querySelectorAll('.accordion li').forEach((li) => li.classList.remove('open'));
      document.querySelectorAll<HTMLButtonElement>('.accordion .q').forEach((b) => {
        b.setAttribute('aria-expanded', 'false');
        const ic = b.querySelector('.ic');
        if (ic) ic.textContent = '↓';
      });
      if (open) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        const ic = btn.querySelector('.ic');
        if (ic) ic.textContent = '↑';
      }
    });
  });

  /* reveal on scroll */
  const els = [...document.querySelectorAll<HTMLElement>('.reveal')];
  if (!('IntersectionObserver' in window) || reduced) {
    els.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { (e.target as HTMLElement).classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.15 });
    els.forEach((el) => io.observe(el));
  }

  /* demo sign-up */
  const form = document.getElementById('joinForm') as HTMLFormElement | null;
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = document.getElementById('joinMsg');
    if (msg) msg.textContent = 'Thanks. You are on the list. (Demo: connect this form to your email service.)';
    form.reset();
  });

  /* transition into the planner: the page warps, then navigates */
  document.querySelectorAll<HTMLAnchorElement>('a[data-transition]').forEach((a) => {
    a.addEventListener('click', (e) => {
      if (reduced) return;
      e.preventDefault();
      const href = a.getAttribute('href') ?? 'app.html';
      document.body.classList.add('is-warping');
      window.dispatchEvent(new Event('rs:warp'));
      window.setTimeout(() => { window.location.href = href; }, 900);
    });
  });
}

function splitInto(el: HTMLElement): void {
  let i = 0;
  const walk = (node: Node): void => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const ch of n.textContent ?? '') {
          const s = document.createElement('span');
          if (ch.trim() === '') {
            s.textContent = '\u00A0';
          } else {
            s.className = 'ch';
            s.style.setProperty('--i', String(i++));
            s.textContent = ch;
          }
          frag.appendChild(s);
        }
        n.replaceWith(frag);
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        walk(n);
      }
    });
  };
  walk(el);
  el.classList.add('split-ready');
}
