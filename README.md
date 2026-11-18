# RescueSphere

A 3D landing page and a room-planning app, built with Vite, TypeScript, and three.js.

- Landing page (`index.html`): full-page 3D stage with one model per section, transitions, live cursor, and scroll effects.
- Planner (`app.html`): the room-planning workspace.
- 3D viewer (`viewer.html`): inspect each section model. Orbit, zoom and pan; isometric, top, front and side presets; fill, speed, grid and axes controls; keyboard shortcuts (1–8 select, F fit, Space pause, G grid).

## Setup

```bash
npm install
npm run dev        # http://localhost:5173 (landing) and /app.html (planner)
npm run build      # typecheck + production build into dist/
npm run preview    # serve the built site
```

## 3D and effects

- One full-page three.js stage. Each section has its own 3D model that grows in as you scroll to it.
- 3D room: scroll orbits the camera; the escape route pulses toward the exit.
- Effects: letter reveals, scroll progress bar, cursor spotlight, tilting cards, magnetic buttons, parallax headings.
- three.js comes from npm (`three` 0.180), so no CDN is needed.

## Notes

- Preparedness aid only. It does not replace official emergency instructions or certified safety systems.
- Room dimensions and photos stay in the browser.
