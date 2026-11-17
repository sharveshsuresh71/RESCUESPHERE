import type { ExperienceModule } from '../core/ExperienceStateManager';
import type { ExperienceStateManager } from '../core/ExperienceStateManager';
import { createPanel, createButton, createActionRow, createParagraph } from '../ui/UiHelpers';

export class WelcomeModule implements ExperienceModule {
  readonly id = 'welcome' as const;

  constructor(private readonly state: ExperienceStateManager) {}

  render(container: HTMLElement): void {
    const panel = createPanel('Plan with clarity.', 'A spatial preparedness workspace');
    panel.classList.add('welcome-panel');

    panel.append(
      createParagraph(
        'Shape a digital version of your space, explore possible ways out, and bring your household plan together in one clear 3D workspace.'
      )
    );

    const start = createButton('Build my safety plan', () => this.state.show('safety'), 'primary');
    const how = createButton('Review safety briefing', () => this.state.show('safety'));
    const privacy = createButton('Privacy & data', () => this.state.show('safety'));
    const disclaimer = createButton('Important limitations', () => this.state.show('safety'));

    panel.append(createActionRow(start, how, privacy, disclaimer));
    container.append(panel);
  }
}
