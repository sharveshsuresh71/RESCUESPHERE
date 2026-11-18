import type { ExperienceModule } from '../core/ExperienceStateManager';
import type { ExperienceStateManager } from '../core/ExperienceStateManager';
import {
  createPanel,
  createButton,
  createActionRow,
  createParagraph,
  createDisclaimer
} from '../ui/UiHelpers';
import { createPlanEditor } from '../ui/PlanEditor';

export class ExitMappingModule implements ExperienceModule {
  readonly id = 'exitMapping' as const;

  constructor(private readonly state: ExperienceStateManager) {}

  render(container: HTMLElement): void {
    const plan = this.state.plan;
    const panel = createPanel('Exit Mapping', 'Identify up to two potential exits');

    panel.append(
      createParagraph('Add and label user-identified potential exits. RescueSphere does not determine whether an exit is safe or accessible.'),
      createParagraph(`Potential exits identified: ${plan.exits.length} of 2`)
    );

    if (plan.exits.length === 0) {
      panel.append(createParagraph('Add at least one potential exit before continuing.'));
    }

    panel.append(
      createParagraph('Drag the exit markers (A, B) to where doors or other potential exits are in your room.'),
      createPlanEditor(plan, 'exits', () => {
        this.state.updatePlan((current) => {
          current.routes = [];
        });
      })
    );

    const addPrimary = createButton('Add Potential Exit A', () => this.addExit('primary'));
    const addAlternative = createButton('Add Potential Exit B', () => this.addExit('alternative'));
    addPrimary.disabled = plan.exits.some((exit) => exit.type === 'primary');
    addAlternative.disabled = plan.exits.some((exit) => exit.type === 'alternative');
    const remove = createButton('Remove Last Exit', () => {
      this.state.updatePlan((current) => {
        current.exits.pop();
        current.routes = [];
      });
      this.state.show('exitMapping');
    }, 'danger');

    panel.append(createActionRow(addPrimary, addAlternative, remove));
    panel.append(createDisclaimer('All exits are user-identified potential exits. They are not verified safe exits.'));

    const back = createButton('Back', () => this.state.show('roomSetup'));
    const next = createButton('Continue to Obstacles', () => this.state.show('obstacles'), 'primary');

    if (plan.exits.length === 0) {
      next.disabled = true;
    }

    panel.append(createActionRow(back, next));
    container.append(panel);
  }

  private addExit(type: 'primary' | 'alternative'): void {
    this.state.updatePlan((current) => {
      if (current.exits.length >= 2 || current.exits.some((exit) => exit.type === type)) {
        return;
      }
      current.routes = [];

      current.exits.push({
        id: crypto.randomUUID(),
        label: type === 'primary' ? 'Potential Exit A' : 'Potential Exit B',
        position: {
          x: type === 'primary' ? -1 : 1,
          z: -(current.roomDimensions.lengthMeters ?? 5) / 2
        },
        type,
        userConfirmed: true
      });
    });

    this.state.show('exitMapping');
  }
}
