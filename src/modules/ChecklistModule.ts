import type { ExperienceModule } from '../core/ExperienceStateManager';
import type { ExperienceStateManager } from '../core/ExperienceStateManager';
import {
  createPanel,
  createButton,
  createActionRow,
  createParagraph,
  createDisclaimer
} from '../ui/UiHelpers';

export class ChecklistModule implements ExperienceModule {
  readonly id = 'checklist' as const;

  constructor(private readonly state: ExperienceStateManager) {}

  render(container: HTMLElement): void {
    const plan = this.state.plan;
    const panel = createPanel('Preparedness Checklist', 'Review your household plan');

    const completed = plan.checklist.filter((item) => item.completed).length;
    const percentage = Math.round((completed / plan.checklist.length) * 100);

    panel.append(
      createParagraph(`Completed: ${completed} of ${plan.checklist.length} items (${percentage}%)`)
    );

    const track = document.createElement('div');
    track.className = 'progress-track';

    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = `${percentage}%`;
    track.append(fill);
    panel.append(track);

    const list = document.createElement('div');
    list.className = 'checklist';

    for (const item of plan.checklist) {
      const row = document.createElement('label');
      row.className = 'check-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = item.completed;

      checkbox.addEventListener('change', () => {
        this.state.updatePlan((current) => {
          const target = current.checklist.find((candidate) => candidate.id === item.id);

          if (target) {
            target.completed = checkbox.checked;
          }
        });

        this.state.show('checklist');
      });

      const text = document.createElement('span');
      text.textContent = item.label;

      row.append(checkbox, text);
      list.append(row);
    }

    panel.append(list);
    panel.append(createDisclaimer('Checklist completion is not proof of actual safety.'));

    const back = createButton('Back', () => this.state.show('meetingPoint'));
    const next = createButton('Continue to Report', () => this.state.show('report'), 'primary');

    panel.append(createActionRow(back, next));
    container.append(panel);
  }
}
