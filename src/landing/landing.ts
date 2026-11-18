import { startStage } from './stage';
import { initEffects } from './effects';

/* Landing page entry: the 3D stage and the DOM effects, both driven by the same reduced-motion check. */
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const slots = [...document.querySelectorAll<HTMLElement>('.slot[data-model]')];
const canvas = document.getElementById('stage3d');

if (canvas instanceof HTMLCanvasElement) {
  if (startStage(canvas, slots, reduced)) document.body.classList.add('has-stage');
}

initEffects(reduced);
