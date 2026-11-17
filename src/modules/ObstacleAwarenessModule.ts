import type { ExperienceModule, ExperienceStateManager } from '../core/ExperienceStateManager';
import type { ObstacleCategory } from '../core/types';
import {
  createPanel,
  createButton,
  createActionRow,
  createParagraph,
  createField,
  createSelect,
  createDisclaimer
} from '../ui/UiHelpers';
import { createPlanEditor } from '../ui/PlanEditor';

export class ObstacleAwarenessModule implements ExperienceModule {
  readonly id = 'obstacles' as const;

  constructor(private readonly state: ExperienceStateManager) {}

  render(container: HTMLElement): void {
    const plan = this.state.plan;
    const panel = createPanel('Obstacle Awareness', 'Mark up to three user-provided obstacles');

    panel.append(
      createParagraph('Identify furniture, storage, clutter, narrow passages, or other items that may affect movement planning.'),
      createParagraph(`Obstacles marked: ${plan.obstacles.length} of 3`)
    );

    panel.append(
      createPlanEditor(plan, 'obstacles', () => {
        this.state.updatePlan((current) => {
          current.routes = [];
        });
      })
    );

    const category = createSelect([
      { value: 'furniture', label: 'Furniture' },
      { value: 'storage', label: 'Storage items' },
      { value: 'clutter', label: 'Clutter' },
      { value: 'narrowPassage', label: 'Narrow passage' },
      { value: 'other', label: 'Other user-defined obstacle' }
    ]);

    const label = document.createElement('input');
    label.type = 'text';
    label.placeholder = 'Optional obstacle label';

    const add = createButton('Add Obstacle', () => {
      this.state.updatePlan((current) => {
        if (current.obstacles.length >= 3) {
          return;
        }

        current.routes = [];
        current.obstacles.push({
          id: crypto.randomUUID(),
          category: category.value as ObstacleCategory,
          label: label.value.trim() || category.options[category.selectedIndex]?.text || 'Obstacle',
          position: { x: (current.obstacles.length - 1) * 0.6, z: 0.3 },
          userConfirmed: true
        });
      });

      this.state.show('obstacles');
    });

    const remove = createButton('Remove Last Obstacle', () => {
      this.state.updatePlan((current) => {
        current.obstacles.pop();
        current.routes = [];
      });
      this.state.show('obstacles');
    }, 'danger');

    panel.append(
      createField('Obstacle category', category),
      createField('Obstacle label', label),
      createActionRow(add, remove),
      createDisclaimer('Obstacles are user-provided information. RescueSphere does not automatically detect real-world obstacles.')
    );

    const back = createButton('Back', () => this.state.show('exitMapping'));
    const next = createButton('Continue to Route Comparison', () => this.state.show('routes'), 'primary');

    panel.append(createActionRow(back, next));
    container.append(panel);
  }
}
