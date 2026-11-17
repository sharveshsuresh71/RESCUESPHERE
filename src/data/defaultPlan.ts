import type { RoomPlan } from '../core/types';

export function createDefaultPlan(): RoomPlan {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    name: 'My Household Preparedness Plan',
    roomDimensions: {
      widthMeters: 4,
      lengthMeters: 5
    },
    roomTemplate: 'rectangle',
    roomObjects: [],
    exits: [],
    obstacles: [],
    routes: [],
    meetingPoint: {
      category: 'other',
      customLabel: ''
    },
    checklist: [
      {
        id: crypto.randomUUID(),
        label: 'Household members know the selected meeting point.',
        completed: false
      },
      {
        id: crypto.randomUUID(),
        label: 'Potential exits have been identified.',
        completed: false
      },
      {
        id: crypto.randomUUID(),
        label: 'Marked obstacles have been reviewed.',
        completed: false
      },
      {
        id: crypto.randomUUID(),
        label: 'The household preparedness plan has been discussed.',
        completed: false
      },
      {
        id: crypto.randomUUID(),
        label: 'The plan can be reviewed again later.',
        completed: false
      }
    ],
    createdAt: now,
    updatedAt: now
  };
}
