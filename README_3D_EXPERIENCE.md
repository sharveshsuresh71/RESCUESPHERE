# RescueSphere — Immersive 3D Experience

The root page (`index.html`) is now an immersive, full-screen 3D introduction inspired by the interaction style in the Fernhollow reference: cinematic full-screen composition, a floating navigation layer, scroll-driven camera movement, pointer parallax, a loading reveal, and an optional sound toggle.

## What changed

- `index.html`: the landing page. It loads `src/landing/landing.ts` as a module.
- `src/landing/models.ts`: eight schematic, CAD-style models, one per section. Hero: wireframe room with a scan plane and route to the exit. How it works: floor plan with the route drawn step by step. Room: furnished CAD drawing with the exit lit. Benefits: 2x2 dashboard panels with live bars. Problems: corridor with a blocked route and a detour. FAQ: accordion rows that open in turn. Roadmap: timeline with a pulse reaching each milestone. Footer: ground grid with a scan sweep.
- `src/landing/stage.ts`: one full-page stage. The model for the section in view eases in and the others fade out. A thin scan line sweeps on each change, the camera glides to each model's viewpoint, and a crosshair reticle tracks the pointer in 3D.
- `src/landing/effects.ts`: letter-by-letter reveals, scroll progress, cursor spotlight, tilting cards, magnetic buttons, parallax headings, FAQ accordion, reveal on scroll, and the transition into the planner.
- `src/styles/landing.css`: landing styles, including the planner button and the warp overlay.
- `app.html`: the original room-planning application, unchanged.

Three.js comes from npm (`three` 0.180), so no CDN is needed for the 3D.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The landing page is the default route. Open `/app.html` to use the original room-planning application.

## Production build

```bash
npm run build
npm run preview
```

## Notes

- The 3D house/room, routes, hazard markers, and meeting-point scene are original RescueSphere visuals built with Three.js. This does not copy Gladeye's proprietary valley engine or assets; the supplied message contained the interface example but not the complete inlined original engine/assets.
- The experience loads Three.js r128 from cdnjs and Sora/DM Sans from Google Fonts, so those visual dependencies need network access. The existing application continues to use its npm-installed Three.js dependency.
- The ambient sound toggle is off by default and creates a very low-volume synthesized tone only after the visitor enables it.
- RescueSphere is a preparedness aid, not a replacement for official emergency instructions, professional advice, building inspections, or certified safety systems.
