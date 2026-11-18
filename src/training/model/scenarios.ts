import type { SceneObject, TrainingScene } from './types';

/** Shared footprint helper: makes each object's size explicit and realistic. */
function obj(
  id: string,
  kind: SceneObject['kind'],
  label: string,
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  blocking = true
): SceneObject {
  return {
    id,
    kind,
    label,
    source: 'simulated',
    center: { x, z },
    width,
    depth,
    height,
    blocking,
    confidence: null
  };
}

const SIMULATED_DISCLOSURE =
  'SIMULATED TRAINING ROOM. Objects are placed by the app, not detected in your home. ' +
  'The route is not a guarantee of real-world safety.';

/**
 * Living room, 6.0 m × 5.0 m. Front door is partly blocked by a fallen bookshelf and
 * can only be reached through a narrow corridor. The patio door stays clear.
 */
export const LIVING_ROOM: TrainingScene = {
  id: 'living-room-drill',
  name: 'Living room drill',
  source: 'simulated',
  disclosure: SIMULATED_DISCLOSURE,
  bounds: { width: 6.0, length: 5.0 },
  start: { x: 2.0, z: 1.9 },
  exits: [
    {
      id: 'front-door',
      label: 'Front door',
      wall: 'south',
      center: { x: -1.0, z: -2.5 },
      approach: { x: -1.0, z: -2.0 },
      width: 0.9
    },
    {
      id: 'patio-door',
      label: 'Patio door',
      wall: 'east',
      center: { x: 3.0, z: 0.5 },
      approach: { x: 2.5, z: 0.5 },
      width: 0.9
    }
  ],
  objects: [
    obj('sofa', 'sofa', 'Sofa', -1.5, 2.0, 2.0, 0.9, 0.85),
    obj('armchair', 'armchair', 'Armchair', -2.6, 0.9, 0.8, 0.8, 0.9),
    obj('coffee-table', 'table', 'Coffee table', -1.5, 0.9, 1.1, 0.6, 0.45),
    obj('dining-table', 'table', 'Dining table', 1.0, 0.6, 1.6, 0.9, 0.75),
    obj('dining-chair-north', 'chair', 'Chair', 1.0, 1.4, 0.45, 0.45, 0.9),
    obj('dining-chair-south', 'chair', 'Chair', 1.0, -0.1, 0.45, 0.45, 0.9),
    obj('dining-chair-west', 'chair', 'Chair', -0.2, 0.6, 0.45, 0.45, 0.9),
    obj('sideboard', 'cabinet', 'Sideboard', -2.3, -2.2, 1.0, 0.45, 0.8),
    obj('fallen-shelf', 'shelf', 'Fallen bookshelf (blocks front door)', -0.9, -1.5, 1.4, 0.35, 0.3),
    obj('debris-pile', 'debris', 'Debris pile', 2.1, -1.2, 0.6, 0.5, 0.35),
    obj('fallen-lamp', 'fallenObject', 'Fallen floor lamp (trip hazard)', 0.2, -1.0, 0.4, 0.3, 0.12, false)
  ]
};

/**
 * Bedroom, 4.0 m × 4.5 m. The bedroom door is reached straight north past the
 * desk chair. The balcony door is reached through a narrow gap between the bed and
 * the wardrobe. Shoes on the floor are a trip hazard.
 */
export const BEDROOM: TrainingScene = {
  id: 'bedroom-drill',
  name: 'Bedroom drill',
  source: 'simulated',
  disclosure: SIMULATED_DISCLOSURE,
  bounds: { width: 4.0, length: 4.5 },
  start: { x: 0.0, z: -0.5 },
  exits: [
    {
      id: 'bedroom-door',
      label: 'Bedroom door',
      wall: 'north',
      center: { x: 0.5, z: 2.25 },
      approach: { x: 0.5, z: 1.75 },
      width: 0.9
    },
    {
      id: 'balcony-door',
      label: 'Balcony door',
      wall: 'south',
      center: { x: 1.0, z: -2.25 },
      approach: { x: 1.0, z: -1.85 },
      width: 0.9
    }
  ],
  objects: [
    obj('bed', 'bed', 'Double bed', 1.25, -0.5, 1.5, 2.0, 0.6),
    obj('wardrobe', 'cabinet', 'Wardrobe', -0.8, -1.95, 1.2, 0.6, 2.0),
    obj('bookshelf', 'shelf', 'Bookshelf', -1.85, 0.8, 0.3, 0.8, 1.8),
    obj('desk', 'table', 'Desk', -1.2, 1.5, 1.0, 0.5, 0.75),
    obj('desk-chair', 'chair', 'Desk chair', -0.3, 1.5, 0.45, 0.45, 0.9),
    obj('fallen-shoes', 'fallenObject', 'Shoes on floor (trip hazard)', -0.6, -0.8, 0.35, 0.25, 0.1, false),
    obj('clothes-pile', 'debris', 'Pile of clothes', -0.9, 0.9, 0.6, 0.5, 0.3)
  ]
};

export const TRAINING_SCENES: TrainingScene[] = [LIVING_ROOM, BEDROOM];
