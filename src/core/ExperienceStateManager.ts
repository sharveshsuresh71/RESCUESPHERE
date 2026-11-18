import type { ModuleId, RoomPlan } from './types';
import { createDefaultPlan } from '../data/defaultPlan';
import { LocalStorageManager } from '../data/LocalStorageManager';

export interface ExperienceModule {
  readonly id: ModuleId;
  render(container: HTMLElement): void;
}

const moduleOrder: ModuleId[] = [
  'welcome',
  'safety',
  'roomSetup',
  'exitMapping',
  'obstacles',
  'routes',
  'meetingPoint',
  'checklist',
  'report',
  'dashboard'
];

export class ExperienceStateManager {
  private readonly modules = new Map<ModuleId, ExperienceModule>();
  private readonly storage = new LocalStorageManager();
  private _currentModule: ModuleId = 'welcome';
  private renderToken = 0;
  private _plan: RoomPlan;
  private readonly listeners: Array<(plan: RoomPlan) => void> = [];

  constructor() {
    this._plan = this.storage.loadPlan() ?? createDefaultPlan();
  }

  get currentModule(): ModuleId {
    return this._currentModule;
  }

  get plan(): RoomPlan {
    return this._plan;
  }

  subscribe(listener: (plan: RoomPlan) => void): void {
    this.listeners.push(listener);
    listener(this._plan);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this._plan);
    }
  }

  register(module: ExperienceModule): void {
    this.modules.set(module.id, module);
  }

  show(moduleId: ModuleId): void {
    const module = this.modules.get(moduleId);

    if (!module) {
      throw new Error(`Unknown module: ${moduleId}`);
    }

    this._currentModule = moduleId;
    document.querySelectorAll<HTMLButtonElement>('.module-nav [data-module]').forEach((button) => {
      const active = button.dataset.module === moduleId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'step' : 'false');
    });
    this.persist();
    this.notify();

    const host = document.getElementById('module-host');

    if (!host) {
      throw new Error('Missing #module-host element.');
    }

    // the current panel fades out first; the next one renders once it has gone, so they never overlap
    const token = ++this.renderToken;
    const hadContent = host.children.length > 0;
    [...host.children].forEach((child) => child.classList.add('is-leaving'));
    window.setTimeout(() => {
      if (token !== this.renderToken) return;
      host.replaceChildren();
      module.render(host);
    }, hadContent ? 260 : 0);
  }

  next(): void {
    const index = moduleOrder.indexOf(this._currentModule);
    const nextModule = moduleOrder[Math.min(index + 1, moduleOrder.length - 1)];
    if (nextModule) {
      this.show(nextModule);
    }
  }

  previous(): void {
    const index = moduleOrder.indexOf(this._currentModule);
    const previousModule = moduleOrder[Math.max(index - 1, 0)];
    if (previousModule) {
      this.show(previousModule);
    }
  }

  updatePlan(mutator: (plan: RoomPlan) => void): void {
    mutator(this._plan);
    this._plan.updatedAt = new Date().toISOString();
    this.persist();
    this.notify();
  }

  resetPlan(): void {
    this._plan = createDefaultPlan();
    this.persist();
    this.notify();
    this.show('welcome');
  }

  persist(): void {
    this.storage.savePlan(this._plan);
  }

  calculatePlanningProgress(): number {
    const conditions = [
      this._plan.roomObjects.length > 0,
      this._plan.exits.length > 0,
      this._plan.obstacles.length > 0,
      this._plan.routes.some((route) => route.reviewStatus === 'reviewed'),
      this._plan.meetingPoint.category !== 'other' || this._plan.meetingPoint.customLabel.length > 0,
      this._plan.checklist.every((item) => item.completed)
    ];

    const completed = conditions.filter(Boolean).length;
    return Math.round((completed / conditions.length) * 100);
  }
}
