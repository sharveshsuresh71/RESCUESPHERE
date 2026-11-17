import type { ExperienceModule, ExperienceStateManager } from '../core/ExperienceStateManager';
import type { RoomTemplate } from '../core/types';
import {
  createPanel,
  createButton,
  createActionRow,
  createParagraph,
  createField,
  createSelect
} from '../ui/UiHelpers';
import { createPlanEditor } from '../ui/PlanEditor';
import { detectFurnitureCollisions } from '../algorithms/CollisionDetection';

export class RoomSetupModule implements ExperienceModule {
  readonly id = 'roomSetup' as const;

  constructor(
    private readonly state: ExperienceStateManager,
    private readonly scanRoom?: (onStatus: (message: string) => void) => Promise<{ widthMeters: number; lengthMeters: number; confidence: 'estimated'; planeCount: number }>
  ) {}

  render(container: HTMLElement): void {
    const plan = this.state.plan;
    const panel = createPanel('Room Setup', 'Create a simplified room representation');

    panel.append(
      createParagraph(
        'Choose a template and add simple door, window, and furniture markers. This is user-provided planning information, not an automatic room scan.'
      )
    );

    const template = createSelect([
      { value: 'rectangle', label: 'Simple rectangular room' },
      { value: 'bedroom', label: 'Bedroom layout' },
      { value: 'livingRoom', label: 'Living room layout' },
      { value: 'custom', label: 'Custom layout' }
    ]);

    template.value = plan.roomTemplate;
    template.addEventListener('change', () => {
      const presets: Record<RoomTemplate, [number, number] | null> = {
        rectangle: [4, 5],
        bedroom: [3.5, 4],
        livingRoom: [5, 6],
        custom: null
      };
      this.state.updatePlan((current) => {
        current.roomTemplate = template.value as RoomTemplate;
        const preset = presets[current.roomTemplate];
        if (preset) {
          current.roomDimensions.widthMeters = preset[0];
          current.roomDimensions.lengthMeters = preset[1];
          this.clampAll(current);
        }
      });
      this.state.show('roomSetup');
    });

    const scanPanel = document.createElement('div');
    scanPanel.className = 'scanner-card';
    const scanTitle = document.createElement('h3');
    scanTitle.textContent = '✨ Auto Room Scanner';
    const scanDescription = createParagraph('On a compatible Meta Quest browser, scan the visible floor using WebXR plane detection. The scanner estimates the largest detected floor-plane bounds; review and confirm the dimensions before planning.');
    const scanStatus = document.createElement('p');
    scanStatus.className = 'scanner-status';
    scanStatus.textContent = this.scanRoom ? 'Ready to scan · Meta Quest + HTTPS required' : 'XR scanner is not connected.';
    const scanButton = createButton('Start 15-second room scan', async () => {
      if (!this.scanRoom) { scanStatus.textContent = 'Scanner unavailable. You can still enter room dimensions manually.'; return; }
      scanButton.disabled = true;
      scanStatus.textContent = 'Preparing scanner…';
      try {
        const result = await this.scanRoom(message => { scanStatus.textContent = message; });
        this.state.updatePlan(current => {
          current.roomDimensions.widthMeters = Math.round(result.widthMeters * 10) / 10;
          current.roomDimensions.lengthMeters = Math.round(result.lengthMeters * 10) / 10;
          this.clampAll(current);
        });
        scanStatus.textContent = `Estimated floor bounds: ${result.widthMeters.toFixed(1)}m × ${result.lengthMeters.toFixed(1)}m. Please verify with a tape measure before relying on this plan.`;
        this.state.show('roomSetup');
      } catch (error) {
        scanStatus.textContent = error instanceof Error ? error.message : 'Room scan failed. Enter dimensions manually.';
      } finally {
        scanButton.disabled = false;
      }
    }, 'primary');
    scanPanel.append(scanTitle, scanDescription, scanButton, scanStatus);

    const width = document.createElement('input');
    width.type = 'number';
    width.min = '1';
    width.max = '20';
    width.step = '0.1';
    width.value = String(plan.roomDimensions.widthMeters ?? 4);
    width.addEventListener('change', () => {
      const value = Number(width.value);
      this.state.updatePlan((current) => {
        current.roomDimensions.widthMeters = Number.isFinite(value) && value >= 1 && value <= 20 ? value : null;
        this.clampAll(current);
      });
      this.state.show('roomSetup');
    });

    const length = document.createElement('input');
    length.type = 'number';
    length.min = '1';
    length.max = '20';
    length.step = '0.1';
    length.value = String(plan.roomDimensions.lengthMeters ?? 5);
    length.addEventListener('change', () => {
      const value = Number(length.value);
      this.state.updatePlan((current) => {
        current.roomDimensions.lengthMeters = Number.isFinite(value) && value >= 1 && value <= 20 ? value : null;
        this.clampAll(current);
      });
      this.state.show('roomSetup');
    });

    const addDoor = createButton('Add Door', () => this.addObject('door'));
    const addWindow = createButton('Add Window', () => this.addObject('window'));
    const furnitureCatalog = [
      { value: 'Bed', label: '🛏️ Bed · 2.0 × 1.5m' },
      { value: 'Sofa', label: '🛋️ Sofa · 1.8 × 0.8m' },
      { value: 'Table', label: '▰ Table · 1.2 × 0.8m' },
      { value: 'Chair', label: '🪑 Chair · 0.5 × 0.5m' },
      { value: 'Wardrobe', label: '▥ Wardrobe · 1.2 × 0.6m' },
      { value: 'Fridge', label: '▯ Fridge · 0.7 × 0.7m' },
      { value: 'Bookshelf', label: '▤ Bookshelf · 0.9 × 0.35m' },
      { value: 'Desk', label: '▰ Desk · 1.2 × 0.6m' },
      { value: 'Cabinet', label: '▰ Cabinet · 0.8 × 0.45m' },
      { value: 'Generic Block', label: '⬛ Generic block · 0.9 × 0.65m' }
    ];
    const furnitureSelect = createSelect(furnitureCatalog);
    const addFurniture = createButton('＋ Add 3D Block', () => this.addFurnitureBlock(furnitureSelect.value));
    const resizeFurniture = createButton('Resize Last Furniture', () => {
      this.state.updatePlan(current => { const item = [...current.roomObjects].reverse().find(o => o.kind === 'furniture' || o.kind === 'custom'); if (item) { item.widthMeters = (item.widthMeters ?? .8) >= 1.2 ? .9 : 1.4; item.depthMeters = (item.depthMeters ?? .6) >= .8 ? .65 : .85; } });
      this.state.show('roomSetup');
    });
    const rotateFurniture = createButton('Rotate Last Furniture 15°', () => {
      this.state.updatePlan(current => { const item = [...current.roomObjects].reverse().find(o => o.kind === 'furniture' || o.kind === 'custom'); if (item) item.rotationDegrees = ((item.rotationDegrees ?? 0) + 15) % 360; });
      this.state.show('roomSetup');
    });
    const reset = createButton('Reset Layout', () => {
      this.state.updatePlan((current) => {
        current.roomObjects = [];
      });
      this.state.show('roomSetup');
    }, 'danger');

    panel.append(
      scanPanel,
      createField('Room template', template),
      createField('Room width in meters', width),
      createField('Room length in meters', length),
      createField('Furniture / object block', furnitureSelect),
      createActionRow(addDoor, addWindow, addFurniture, resizeFurniture, rotateFurniture, reset)
    );

    panel.append(
      createParagraph(`Room markers: ${plan.roomObjects.length}. Drag a marker to place it (or focus it and use arrow keys).`),
      createPlanEditor(plan, 'objects', () => this.state.updatePlan(() => undefined))
    );

    const collisions = detectFurnitureCollisions(plan.roomObjects);
    if (collisions.length) {
      const warning = document.createElement('div'); warning.className = 'disclaimer';
      warning.textContent = `Possible furniture overlap: ${collisions.map(c => `${c.first} / ${c.second}`).join(', ')}. Move the markers apart and verify actual clearances.`;
      panel.append(warning);
    }

    const list = document.createElement('div');
    list.className = 'marker-list';
    for (const object of plan.roomObjects) {
      const row = document.createElement('div');
      row.className = 'marker-row';
      const name = document.createElement('span');
      name.textContent = object.label;
      const detail = document.createElement('small');
      detail.textContent = object.kind === 'furniture' ? `3D block · ${object.widthMeters ?? 0.8}m × ${object.depthMeters ?? 0.6}m · ${object.rotationDegrees ?? 0}°` : object.kind;
      row.append(
        name, detail,
        createButton('Remove', () => {
          this.state.updatePlan((current) => {
            current.roomObjects = current.roomObjects.filter((o) => o.id !== object.id);
          });
          this.state.show('roomSetup');
        }, 'danger')
      );
      list.append(row);
    }
    panel.append(list);

    const back = createButton('Back', () => this.state.show('safety'));
    const next = createButton('Continue to Exit Mapping', () => this.state.show('exitMapping'), 'primary');

    panel.append(createActionRow(back, next));
    container.append(panel);
  }

  private clampAll(plan: import('../core/types').RoomPlan): void {
    const halfW = (plan.roomDimensions.widthMeters ?? 4) / 2;
    const halfL = (plan.roomDimensions.lengthMeters ?? 5) / 2;
    const clamp = (p: { x: number; z: number }) => {
      p.x = Math.max(-halfW, Math.min(halfW, p.x));
      p.z = Math.max(-halfL, Math.min(halfL, p.z));
    };
    plan.roomObjects.forEach((o) => clamp(o.position));
    plan.exits.forEach((o) => clamp(o.position));
    plan.obstacles.forEach((o) => clamp(o.position));
    plan.routes = []; // routes depend on geometry; recreate after layout changes
  }


  private addFurnitureBlock(label: string): void {
    const sizes: Record<string, [number, number]> = {
      Bed: [2.0, 1.5], Sofa: [1.8, 0.8], Table: [1.2, 0.8], Chair: [0.5, 0.5],
      Wardrobe: [1.2, 0.6], Fridge: [0.7, 0.7], Bookshelf: [0.9, 0.35],
      Desk: [1.2, 0.6], Cabinet: [0.8, 0.45], 'Generic Block': [0.9, 0.65]
    };
    const [width, depth] = sizes[label] ?? [0.9, 0.65];
    this.state.updatePlan(current => {
      const index = current.roomObjects.filter(o => o.kind === 'furniture').length;
      const halfW = (current.roomDimensions.widthMeters ?? 4) / 2;
      const halfL = (current.roomDimensions.lengthMeters ?? 5) / 2;
      const x = Math.max(-halfW + width / 2, Math.min(halfW - width / 2, (index % 3 - 1) * 0.8));
      const z = Math.max(-halfL + depth / 2, Math.min(halfL - depth / 2, Math.floor(index / 3) * 0.9 - 0.8));
      current.roomObjects.push({
        id: crypto.randomUUID(), kind: 'furniture', label,
        position: { x, z }, userConfirmed: true,
        widthMeters: width, depthMeters: depth, rotationDegrees: 0
      });
      current.routes = [];
    });
    this.state.show('roomSetup');
  }

  private addObject(kind: 'door' | 'window' | 'furniture'): void {
    this.state.updatePlan((current) => {
      current.roomObjects.push({
        id: crypto.randomUUID(),
        kind,
        label: kind.charAt(0).toUpperCase() + kind.slice(1),
        position: { x: (current.roomObjects.length % 5) * 0.55 - 1.1, z: 0 },
        userConfirmed: true,
        widthMeters: kind === 'furniture' ? 0.9 : undefined,
        depthMeters: kind === 'furniture' ? 0.65 : undefined,
        rotationDegrees: 0
      });
    });

    this.state.show('roomSetup');
  }
}
