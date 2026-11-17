import { findPath } from '../algorithms/Pathfinding';
import type { ExperienceModule, ExperienceStateManager } from '../core/ExperienceStateManager';
import {
  createPanel,
  createButton,
  createActionRow,
  createParagraph,
  createDisclaimer
} from '../ui/UiHelpers';
import { createPlanEditor } from '../ui/PlanEditor';

export class RouteComparisonModule implements ExperienceModule {
  readonly id = 'routes' as const;

  constructor(private readonly state: ExperienceStateManager) {}

  render(container: HTMLElement): void {
    const plan = this.state.plan;
    const panel = createPanel('Route Comparison', 'A* obstacle-aware route planning');

    panel.append(
      createParagraph('A* searches a 10 cm planning grid and routes around marked obstacles and furniture footprints. Results depend on your measurements and markings; they are not verified safe paths.')
    );

    const createRoutes = createButton('Calculate A* Evacuation Routes', () => this.createRoutes(), 'primary');
    panel.append(createActionRow(createRoutes));

    if (plan.exits.length === 0) {
      panel.append(createParagraph('Add at least one potential exit first (Exit Mapping), then calculate routes.'));
    }
    createRoutes.disabled = plan.exits.length === 0;

    if (plan.routes.length === 0 && plan.exits.length > 0) panel.append(createParagraph('No path is currently calculated. If no route appears, check whether obstacles block the room.'));

    if (plan.routes.length > 0) {
      panel.append(createPlanEditor(plan, 'none', () => undefined));
    }

    for (const route of plan.routes) {
      const card = document.createElement('div');
      card.className = 'card';

      const title = document.createElement('h3');
      title.textContent = route.label;

      const metrics = document.createElement('div');
      metrics.innerHTML = `
        <div class="metric"><span>Marked obstacles in plan</span><strong>${route.obstacleCount}</strong></div>
        <div class="metric"><span>Route segments</span><strong>${Math.max(route.routePoints.length - 1, 0)}</strong></div>
        <div class="metric"><span>A* path length</span><strong>${route.distanceAvailable ? `${route.distanceMeters?.toFixed(1)} m` : 'Not available'}</strong></div>
        <div class="metric"><span>Review status</span><strong>${route.reviewStatus === 'reviewed' ? 'Reviewed' : 'Not reviewed'}</strong></div>
      `;

      const review = createButton(route.reviewStatus === 'reviewed' ? 'Reviewed' : 'Mark as Reviewed', () => {
        this.state.updatePlan((current) => {
          const target = current.routes.find((candidate) => candidate.id === route.id);

          if (target) {
            target.reviewStatus = target.reviewStatus === 'reviewed' ? 'notReviewed' : 'reviewed';
          }
        });

        this.state.show('routes');
      });

      card.append(title, metrics, review);
      panel.append(card);
    }

    panel.append(
      createDisclaimer(
        'Review the marked route and consider whether your room layout needs improvement. RescueSphere does not guarantee route safety.'
      )
    );

    const back = createButton('Back', () => this.state.show('obstacles'));
    const next = createButton('Continue to Meeting Point', () => this.state.show('meetingPoint'), 'primary');

    panel.append(createActionRow(back, next));
    container.append(panel);
  }

  private createRoutes(): void {
    const plan = this.state.plan;
    if (plan.exits.length === 0) return;
    const width = plan.roomDimensions.widthMeters ?? 4;
    const length = plan.roomDimensions.lengthMeters ?? 5;
    const startPoint = { x: 0, z: length / 2 - 0.25 };
    const routes = plan.exits.slice(0, 2).map((exit, index) => {
      const result = findPath(startPoint, exit.position, width, length, plan.obstacles, plan.roomObjects);
      if (!result) return null;
      return {
        id: crypto.randomUUID(),
        label: index === 0 ? 'Route A' as const : 'Route B' as const,
        startPoint,
        exitId: exit.id,
        routePoints: result.points,
        obstacleCount: plan.obstacles.length,
        distanceMeters: result.distanceMeters,
        distanceAvailable: true,
        reviewStatus: 'notReviewed' as const
      };
    }).filter((route): route is NonNullable<typeof route> => route !== null);
    this.state.updatePlan(current => { current.routes = routes; });
    this.state.show('routes');
  }

}

