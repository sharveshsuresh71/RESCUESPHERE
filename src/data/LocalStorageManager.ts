import type { RoomPlan } from '../core/types';
import { createDefaultPlan } from './defaultPlan';

const PLAN_KEY = 'rescuesphere:currentPlan';

export class LocalStorageManager {
  private available: boolean;

  constructor() {
    this.available = this.checkAvailability();
  }

  private checkAvailability(): boolean {
    try {
      const testKey = 'rescuesphere:storage-test';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  loadPlan(): RoomPlan | null {
    if (!this.available) {
      return null;
    }

    const raw = window.localStorage.getItem(PLAN_KEY);

    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<RoomPlan>;
      // Merge over defaults so older or partial saves cannot crash the UI.
      const base = createDefaultPlan();
      const plan: RoomPlan = { ...base, ...parsed };
      plan.roomDimensions = { ...base.roomDimensions, ...(parsed.roomDimensions ?? {}) };
      plan.meetingPoint = { ...base.meetingPoint, ...(parsed.meetingPoint ?? {}) };
      for (const key of ['roomObjects', 'exits', 'obstacles', 'routes'] as const) {
        if (!Array.isArray(plan[key])) {
          (plan as unknown as Record<string, unknown>)[key] = [];
        }
      }
      if (!Array.isArray(plan.checklist) || plan.checklist.length === 0) {
        plan.checklist = base.checklist;
      }
      return plan;
    } catch {
      return null;
    }
  }

  savePlan(plan: RoomPlan): void {
    if (!this.available) {
      return;
    }

    try {
      window.localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
    } catch {
      // Storage full or blocked: keep working in memory.
    }
  }

  clear(): void {
    if (!this.available) {
      return;
    }

    window.localStorage.removeItem(PLAN_KEY);
  }
}
