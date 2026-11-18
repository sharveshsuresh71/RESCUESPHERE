# RescueSphere — Immersive 3D Experience

The root page (`index.html`) is now an immersive, full-screen 3D introduction inspired by the interaction style in the Fernhollow reference: cinematic full-screen composition, a floating navigation layer, scroll-driven camera movement, pointer parallax, a loading reveal, and an optional sound toggle.

## What changed

- `index.html`: the landing page. It loads `src/landing/landing.ts` as a module.
- `src/landing/models.ts`: eight section models built from physical materials with rounded geometry. Hero: cut-away home with the escape route to the exit and the meeting point. How it works: floor plan with the route drawn step by step. Room: furnished room with a lit exit. Benefits: four icon tiles. Problems: blocked corridor with a warning and a detour. FAQ: cards that open in turn. Roadmap: three platforms with a pulse reaching each. Footer: a small neighbourhood with a meeting point. Each model assembles into place on transition.
- `src/landing/stage.ts`: one full-page stage with studio lighting and reflections. The active model assembles in and the previous one scatters out. A scan line sweeps on each change, the camera glides to each model's viewpoint, and a reticle tracks the pointer. Drag the empty space to turn the active model; it springs back to rest when you let go.
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
