import type { ExperienceModule, ExperienceStateManager } from '../core/ExperienceStateManager';
import type { MeetingPointCategory } from '../core/types';
import {
  createPanel,
  createButton,
  createActionRow,
  createParagraph,
  createField,
  createSelect
} from '../ui/UiHelpers';

export class MeetingPointModule implements ExperienceModule {
  readonly id = 'meetingPoint' as const;

  constructor(private readonly state: ExperienceStateManager) {}

  render(container: HTMLElement): void {
    const plan = this.state.plan;
    const panel = createPanel('Household Meeting Point', 'Choose where your household plans to meet');

    panel.append(
      createParagraph('Select a meeting-point category and add an optional custom label. RescueSphere does not collect GPS coordinates or precise home addresses.')
    );

    const category = createSelect([
      { value: 'outdoor', label: 'Designated outdoor meeting location' },
      { value: 'householdArea', label: 'Familiar household meeting area' },
      { value: 'other', label: 'Another household-selected location' }
    ]);

    category.value = plan.meetingPoint.category;

    const customLabel = document.createElement('input');
    customLabel.type = 'text';
    customLabel.value = plan.meetingPoint.customLabel;
    customLabel.placeholder = 'Optional meeting-point description';

    category.addEventListener('change', () => {
      this.state.updatePlan((current) => {
        current.meetingPoint.category = category.value as MeetingPointCategory;
      });
    });

    customLabel.addEventListener('change', () => {
      this.state.updatePlan((current) => {
        current.meetingPoint.customLabel = customLabel.value.trim();
      });
    });

    panel.append(
      createField('Meeting-point category', category),
      createField('Custom meeting-point label', customLabel)
    );

    const back = createButton('Back', () => this.state.show('routes'));
    const next = createButton('Continue to Checklist', () => this.state.show('checklist'), 'primary');

    panel.append(createActionRow(back, next));
    container.append(panel);
  }
}
