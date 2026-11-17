# RescueSphere — Immersive 3D Experience

The root page (`index.html`) is now an immersive, full-screen 3D introduction inspired by the interaction style in the Fernhollow reference: cinematic full-screen composition, a floating navigation layer, scroll-driven camera movement, pointer parallax, a loading reveal, and an optional sound toggle.

## What changed

- `index.html`: new 3D-first RescueSphere landing experience.
- `public/rescuesphere-3d.html`: standalone copy of the experience for direct preview.
- `app.html`: preserves the original interactive RescueSphere application entry point.
- `vite.config.ts`: builds both the landing page and the app as separate HTML entries.

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
