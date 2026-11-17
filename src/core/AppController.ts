import { ExperienceStateManager } from './ExperienceStateManager';
import { XRManager } from '../xr/XRManager';
import type { ViewPreset } from '../spatial/RoomScene';
import type { ModuleId } from './types';
import { WelcomeModule } from '../modules/WelcomeModule';
import { SafetyIntroductionModule } from '../modules/SafetyIntroductionModule';
import { RoomSetupModule } from '../modules/RoomSetupModule';
import { ExitMappingModule } from '../modules/ExitMappingModule';
import { ObstacleAwarenessModule } from '../modules/ObstacleAwarenessModule';
import { RouteComparisonModule } from '../modules/RouteComparisonModule';
import { MeetingPointModule } from '../modules/MeetingPointModule';
import { ChecklistModule } from '../modules/ChecklistModule';
import { PreparednessReportModule } from '../modules/PreparednessReportModule';
import { DashboardModule } from '../modules/DashboardModule';

/** Order of the workflow, used by the assistant's "next step" button. */
const ORDER: ModuleId[] = ['welcome', 'safety', 'roomSetup', 'exitMapping', 'obstacles', 'routes', 'meetingPoint', 'checklist', 'report', 'dashboard'];

/** What the assistant says on each step. Short, plain, and tied to the 3D view. */
const TIPS: Record<ModuleId, string> = {
  welcome: 'Let’s build your safety plan. I’ll guide you one step at a time.',
  safety: 'Read the briefing first. It explains what this planner can and can’t tell you.',
  roomSetup: 'Set your room size, then use the view buttons to check it from above.',
  exitMapping: 'Mark up to two exits. The glowing beacons show your escape doors.',
  obstacles: 'Mark what could slow you down. Amber markers show the blockers.',
  routes: 'The pulses travel the route to each exit. Route A and B are two ways out.',
  meetingPoint: 'Choose a meeting point outside the building that everyone can reach.',
  checklist: 'Tick off each preparedness task. The progress ring updates live.',
  report: 'Review the plan, then print it to keep a copy.',
  dashboard: 'See your overall readiness at a glance.'
};

const ICON = {
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
  cube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/></svg>',
  top: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="12" r="3"/></svg>',
  side: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17h18M5 17V9l7-4 7 4v8"/></svg>',
  fit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>'
};

export class AppController {
  private readonly state = new ExperienceStateManager();
  private readonly xr = new XRManager();

  constructor(private readonly root: HTMLElement) {}

  start(): void {
    this.root.classList.add('rescue-app');
    this.xr.initialize(this.root);

    const shell = document.createElement('div');
    shell.className = 'app-shell';
    shell.innerHTML = `
      <aside class="app-sidebar" aria-label="Planner navigation">
        <a class="app-brand" href="../index.html"><span class="brand-mark">R</span><span>RESCUE<span>SPHERE</span><small>HOME SAFETY SYSTEM</small></span></a>
        <div class="sidebar-label">WORKSPACE</div>
        <nav class="module-nav">
          <button data-module="welcome"><i>⌂</i><span>Overview</span><b>01</b></button>
          <button data-module="safety"><i>✳</i><span>Safety briefing</span><b>02</b></button>
          <button data-module="roomSetup"><i>▦</i><span>3D room setup</span><b>03</b></button>
          <button data-module="exitMapping"><i>↗</i><span>Exit mapping</span><b>04</b></button>
          <button data-module="obstacles"><i>⌁</i><span>Hazards & obstacles</span><b>05</b></button>
          <button data-module="routes"><i>⇢</i><span>Route comparison</span><b>06</b></button>
          <button data-module="meetingPoint"><i>◎</i><span>Meeting point</span><b>07</b></button>
          <button data-module="checklist"><i>☑</i><span>Preparedness list</span><b>08</b></button>
          <button data-module="report"><i>▤</i><span>Plan report</span><b>09</b></button>
          <button data-module="dashboard"><i>◫</i><span>Dashboard</span><b>10</b></button>
        </nav>
        <div class="sidebar-bottom"><span class="status-dot"></span><span>LOCAL SESSION ACTIVE</span><small>Data stays on this device</small></div>
      </aside>
      <section class="app-workspace">
        <header class="workspace-topbar">
          <div><div class="crumb">RESCUESPHERE <span>/</span> PREPAREDNESS WORKSPACE</div><div class="workspace-title">Your safety environment</div></div>
          <div class="topbar-actions"><div class="progress-ring" role="img" aria-label="Planning progress"><svg viewBox="0 0 44 44" aria-hidden="true"><circle class="ring-bg" cx="22" cy="22" r="18"/><circle class="ring-fg" cx="22" cy="22" r="18"/></svg><span class="ring-val">0%</span></div><span class="live-pill"><i></i> 3D ENGINE READY</span><a href="../index.html" class="exit-link">← Back to overview</a></div>
        </header>
        <div class="workspace-stage">
          <div class="orb orb-1" aria-hidden="true"></div><div class="orb orb-2" aria-hidden="true"></div><div class="orb orb-3" aria-hidden="true"></div>
          <div class="scene-label"><span>LIVE SPATIAL VIEW</span><b>01 / HOME ENVIRONMENT</b></div>
          <div class="scene-legend"><span><i class="legend-safe"></i> ROUTE</span><span><i class="legend-risk"></i> OBSTACLE</span><span><i class="legend-exit"></i> EXIT</span></div>
          <aside class="assistant" aria-label="Guide assistant">
            <div class="assist-bubble" id="assist-text" aria-live="polite"></div>
            <div class="assist-tools">
              <span class="assist-avatar" aria-hidden="true">${ICON.spark}</span>
              <button type="button" class="assist-btn" data-view="iso" title="3D view" aria-label="3D view">${ICON.cube}</button>
              <button type="button" class="assist-btn" data-view="top" title="Top view" aria-label="Top view">${ICON.top}</button>
              <button type="button" class="assist-btn" data-view="front" title="Side view" aria-label="Side view">${ICON.side}</button>
              <button type="button" class="assist-btn" data-view="fit" title="Fit room" aria-label="Fit room">${ICON.fit}</button>
              <button type="button" class="assist-btn assist-next" data-next title="Next step" aria-label="Next step">${ICON.next}</button>
            </div>
          </aside>
          <main id="module-host"></main>
        </div>
      </section>`;
    this.root.append(shell);

    shell.querySelectorAll<HTMLButtonElement>('[data-module]').forEach((button) => {
      button.addEventListener('click', () => this.state.show(button.dataset.module as ModuleId));
    });
    shell.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
      button.addEventListener('click', () => this.xr.setView(button.dataset.view as ViewPreset));
    });
    shell.querySelector<HTMLButtonElement>('[data-next]')?.addEventListener('click', () => {
      const index = ORDER.indexOf(this.state.currentModule as ModuleId);
      const next = ORDER[index + 1];
      if (index >= 0 && next) this.state.show(next);
    });

    const modules = [
      new WelcomeModule(this.state),
      new SafetyIntroductionModule(this.state),
      new RoomSetupModule(this.state, (onStatus) => this.xr.scanRoom(onStatus)),
      new ExitMappingModule(this.state),
      new ObstacleAwarenessModule(this.state),
      new RouteComparisonModule(this.state),
      new MeetingPointModule(this.state),
      new ChecklistModule(this.state),
      new PreparednessReportModule(this.state),
      new DashboardModule(this.state)
    ];
    for (const module of modules) {
      this.state.register(module);
    }

    const ringFg = shell.querySelector<SVGCircleElement>('.ring-fg');
    const ringVal = shell.querySelector<HTMLElement>('.ring-val');
    const ring = shell.querySelector<HTMLElement>('.progress-ring');
    const updateRing = () => {
      const pct = this.state.calculatePlanningProgress();
      if (ringFg) ringFg.style.strokeDashoffset = String(113.1 * (1 - pct / 100));
      if (ringVal) ringVal.textContent = `${pct}%`;
      ring?.setAttribute('aria-label', `Planning progress ${pct}%`);
    };

    const bubble = shell.querySelector<HTMLElement>('#assist-text');
    const refreshAssistant = () => {
      if (bubble) bubble.textContent = TIPS[this.state.currentModule as ModuleId] ?? "";
    };
    // Any click (sidebar, next-buttons inside a module) can change the step, so refresh after it settles.
    shell.addEventListener('click', () => setTimeout(refreshAssistant, 0));

    this.state.subscribe((plan) => { this.xr.updateRoom(plan); updateRing(); });
    this.state.show(this.state.currentModule);
    updateRing();
    refreshAssistant();
  }
}
