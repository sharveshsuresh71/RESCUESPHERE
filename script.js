/* RescueSphere template script.
   1. Petal burst in the hero (animated canvas, pauses when off-screen and respects reduced motion).
   2. Accordion FAQ.
   3. Reveal-on-scroll for cards and steps.
   4. Beta sign-up message (demo only: no data is sent). */

(function petals(){
  const cv = document.getElementById('petals');
  if (!cv) return;
  const g = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LIME='179,224,74', MINT='70,196,137', PEACH='240,160,106';
  const COUNT = 12;
  let w, h, dpr, visible = true, t0 = performance.now();

  function size(){
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = cv.clientWidth; h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // One petal: a tapered leaf from the centre outward, with a soft colour gradient.
  function petal(angle, len, width, color){
    g.save();
    g.rotate(angle);
    const grad = g.createLinearGradient(0, 0, len, 0);
    grad.addColorStop(0, 'rgba('+PEACH+',.95)');
    grad.addColorStop(.35, 'rgba('+color+',.9)');
    grad.addColorStop(1, 'rgba('+color+',0)');
    g.fillStyle = grad;
    g.filter = 'blur(1.2px)';
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(len * .5, -width, len, 0);
    g.quadraticCurveTo(len * .5, width, 0, 0);
    g.fill();
    g.restore();
  }

  function frame(now){
    if (!visible) { requestAnimationFrame(frame); return; }
    const t = reduce ? 0 : (now - t0) / 1000;
    g.clearRect(0, 0, w, h);
    const cx = w * .5, cy = h * .5, R = Math.min(w, h) * .42;
    g.save();
    g.translate(cx, cy);
    g.rotate(t * .08);
    for (let i = 0; i < COUNT; i++){
      const a = (i / COUNT) * Math.PI * 2;
      const breathe = 1 + Math.sin(t * .9 + i * .7) * .08;
      const color = i % 3 === 0 ? MINT : LIME;
      petal(a, R * breathe, R * .16 * (i % 2 ? 1 : .75), color);
    }
    // bright core
    const core = g.createRadialGradient(0, 0, 0, 0, 0, R * .18);
    core.addColorStop(0, 'rgba('+PEACH+',1)');
    core.addColorStop(1, 'rgba('+PEACH+',0)');
    g.fillStyle = core;
    g.beginPath(); g.arc(0, 0, R * .18, 0, Math.PI * 2); g.fill();
    g.restore();
    if (!reduce) requestAnimationFrame(frame);
  }

  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !reduce) requestAnimationFrame(frame); });
  io.observe(cv);
  addEventListener('resize', () => { size(); if (reduce) frame(0); });
  size();
  requestAnimationFrame(frame);
})();

/* FAQ accordion */
document.querySelectorAll('.accordion .q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.parentElement;
    const open = !item.classList.contains('open');
    document.querySelectorAll('.accordion li').forEach(li => li.classList.remove('open'));
    document.querySelectorAll('.accordion .q').forEach(b => { b.setAttribute('aria-expanded','false'); b.querySelector('.ic').textContent = '↓'; });
    if (open) {
      item.classList.add('open');
      btn.setAttribute('aria-expanded','true');
      btn.querySelector('.ic').textContent = '↑';
    }
  });
});

/* reveal on scroll */
(function(){
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('in')); return; }
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: .15 });
  els.forEach(el => io.observe(el));
})();

/* beta sign-up: demo only, nothing is sent anywhere */
document.getElementById('joinForm').addEventListener('submit', e => {
  e.preventDefault();
  document.getElementById('joinMsg').textContent = 'Thanks. You are on the list. (Demo: connect this form to your email service.)';
  e.target.reset();
});
