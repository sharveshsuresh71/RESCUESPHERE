import type { ExperienceModule } from '../core/ExperienceStateManager';
import type { ExperienceStateManager } from '../core/ExperienceStateManager';
import {
  createPanel,
  createButton,
  createActionRow,
  createParagraph,
  createDisclaimer
} from '../ui/UiHelpers';

const DISCLAIMER =
  'RescueSphere is an educational home-preparedness simulation. It is not professional emergency training and does not replace official guidance, emergency services, or your household’s local emergency plan. Always follow instructions from local authorities.';

export class SafetyIntroductionModule implements ExperienceModule {
  readonly id = 'safety' as const;

  constructor(private readonly state: ExperienceStateManager) {}

  render(container: HTMLElement): void {
    const panel = createPanel('Safety and Privacy', 'Before you begin');

    panel.append(
      createParagraph('RescueSphere is educational. You create your own room information and route comparisons use that user-provided data.'),
      createParagraph('Your room layout, checklist progress, meeting-point label, and report are stored locally in this browser.'),
      createDisclaimer(DISCLAIMER)
    );

    const back = createButton('Back', () => this.state.show('welcome'));
    const next = createButton('Continue', () => this.state.show('roomSetup'), 'primary');

    panel.append(createActionRow(back, next));
    container.append(panel);
  }
}
