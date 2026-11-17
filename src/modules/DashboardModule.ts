import type { ExperienceModule } from '../core/ExperienceStateManager';
import type { ExperienceStateManager } from '../core/ExperienceStateManager';
import {
  createPanel,
  createButton,
  createActionRow,
  createParagraph,
  createDisclaimer
} from '../ui/UiHelpers';

export class DashboardModule implements ExperienceModule {
  readonly id = 'dashboard' as const;

  constructor(private readonly state: ExperienceStateManager) {}

  render(container: HTMLElement): void {
    const plan = this.state.plan;
    const progress = this.state.calculatePlanningProgress();
    const panel = createPanel('Personal Dashboard', 'Your latest preparedness plan');

    const selectedExit = plan.exits.find((exit) => exit.type === 'primary');
    const selectedRoute = plan.routes.find((route) => route.reviewStatus === 'reviewed');

    const totalRouteDistance = plan.routes.reduce((sum, route) => sum + (route.distanceMeters ?? 0), 0);
    const completedTasks = plan.checklist.filter(item => item.completed).length;
    const stats = document.createElement('div');
    stats.className = 'analytics-grid';
    const cards: Array<[string, string]> = [
      ['Planning progress', `${progress}%`], ['Potential exits', String(plan.exits.length)],
      ['Marked obstacles', String(plan.obstacles.length)], ['Furniture / objects', String(plan.roomObjects.length)],
      ['Routes calculated', String(plan.routes.length)], ['Combined route length', `${totalRouteDistance.toFixed(1)} m`]
    ];
    cards.forEach(([label, value]) => { const card = document.createElement('div'); card.className = 'analytics-card'; const strong = document.createElement('strong'); strong.textContent = value; const small = document.createElement('span'); small.textContent = label; card.append(strong, small); stats.append(card); });
    const bar = document.createElement('div'); bar.className = 'progress-track'; const fill = document.createElement('div'); fill.className = 'progress-fill'; fill.style.width = `${progress}%`; bar.append(fill);
    panel.append(stats, bar);

    panel.append(
      createParagraph(`Plan: ${plan.name}`),
      createParagraph(`Last saved: ${new Date(plan.updatedAt).toLocaleString()}`),
      createParagraph(`Planning Progress: ${progress}%`),
      createParagraph(`Selected exit: ${selectedExit?.label ?? 'Not selected'}`),
      createParagraph(`Selected route: ${selectedRoute?.label ?? 'Not selected'}`),
      createParagraph(
        `Checklist status: ${completedTasks} of ${plan.checklist.length} complete`
      ),
      createParagraph(`Average calculated route length: ${plan.routes.length ? (totalRouteDistance / plan.routes.length).toFixed(1) + ' m' : 'Not available'}`)
    );

    const open = createButton('Open Saved Plan', () => this.state.show('report'), 'primary');
    const resume = createButton('Continue Previous Session', () => this.state.show('roomSetup'));
    const startNew = createButton('Start New Drill', () => {
      if (window.confirm('Start a new drill? This will replace the current plan.')) {
        this.state.resetPlan();
      }
    });

    const reset = createButton('Reset Local Data', () => {
      if (window.confirm('Delete all locally saved RescueSphere data? This cannot be undone.')) {
        this.state.resetPlan();
      }
    }, 'danger');

    panel.append(createActionRow(open, resume, startNew, reset));
    panel.append(createDisclaimer('Your plan is stored locally in this browser. No account or cloud synchronization is required.'));
    container.append(panel);
  }
}
