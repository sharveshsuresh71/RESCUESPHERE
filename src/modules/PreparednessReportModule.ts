import type { ExperienceModule } from '../core/ExperienceStateManager';
import type { ExperienceStateManager } from '../core/ExperienceStateManager';
import {
  createPanel,
  createButton,
  createActionRow,
  createParagraph,
  createDisclaimer
} from '../ui/UiHelpers';

export class PreparednessReportModule implements ExperienceModule {
  readonly id = 'report' as const;

  constructor(private readonly state: ExperienceStateManager) {}

  render(container: HTMLElement): void {
    const plan = this.state.plan;
    const progress = this.state.calculatePlanningProgress();
    const panel = createPanel('Preparedness Report', 'Your local planning summary');

    const completedChecklist = plan.checklist.filter((item) => item.completed).length;
    const reviewedRoutes = plan.routes.filter((route) => route.reviewStatus === 'reviewed').length;

    panel.append(
      createParagraph(`Planning Progress: ${progress}%`),
      createParagraph(`Potential exits identified: ${plan.exits.length}`),
      createParagraph(`Obstacles marked: ${plan.obstacles.length}`),
      createParagraph(`Routes reviewed: ${reviewedRoutes}`),
      createParagraph(`Meeting-point category: ${plan.meetingPoint.category}`),
      createParagraph(`Checklist completed: ${completedChecklist} of ${plan.checklist.length}`),
      createParagraph(`Room dimensions: ${plan.roomDimensions.widthMeters ?? 'Unknown'} m × ${plan.roomDimensions.lengthMeters ?? 'Unknown'} m`),
      createParagraph(`Furniture and room objects: ${plan.roomObjects.length}`),
      createParagraph(`Calculated routes: ${plan.routes.length}`),
      createParagraph(`Route distances: ${plan.routes.map(r => `${r.label} ${r.distanceMeters?.toFixed(1) ?? '—'} m`).join(' · ') || 'Not calculated'}`),
      createParagraph(`Meeting point: ${plan.meetingPoint.customLabel || plan.meetingPoint.category}`)
    );

    const exportPdf = createButton('Export PDF Report', () => {
      document.body.classList.add('printing-report');
      window.print();
      window.setTimeout(() => document.body.classList.remove('printing-report'), 800);
    }, 'primary');

    const save = createButton('Save Plan', () => {
      this.state.persist();
      this.state.show('dashboard');
    }, 'primary');

    const review = createButton('Review Plan', () => this.state.show('dashboard'));
    const restart = createButton('Restart Drill', () => {
      if (window.confirm('Start a new drill? This will replace the current unsaved plan.')) {
        this.state.resetPlan();
      }
    }, 'danger');

    const dashboard = createButton('Return to Dashboard', () => this.state.show('dashboard'));

    panel.append(createActionRow(exportPdf, save, review, restart, dashboard));
    panel.append(
      createDisclaimer(
        'Planning Progress reflects completed application tasks. It is not a safety score and does not guarantee protection.'
      )
    );

    container.append(panel);
  }
}
