import { startStage } from './stage';
import { initEffects } from './effects';
import { initReel } from './reel';
import { initInside } from './inside';

/* Landing page entry: the 3D stage, the hero reel, the pinned flow and the DOM effects,
   all driven by the same reduced-motion check. */
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const slots = [...document.querySelectorAll<HTMLElement>('.slot[data-model]')];
const canvas = document.getElementById('stage3d');

if (canvas instanceof HTMLCanvasElement) {
  if (startStage(canvas, slots, reduced)) document.body.classList.add('has-stage');
}

initReel(reduced);
initInside(reduced);
initEffects(reduced);
