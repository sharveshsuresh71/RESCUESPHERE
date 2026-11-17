# RescueSphere: Morphos landing + PLENUM planner

Two visual directions, applied to the existing app. The copy, routes and planner logic are unchanged.

## What changed

- **`index.html` (landing), light and professional.** Paper background (#edf2fd) with one fixed WebGL canvas and a 750vh scroll runway. The same palette and fonts as the planner. A visible credit chip ("Created by Sharvesh Suresh · Shark Webs") stays on screen. The sound toggle was removed to keep the page simple. Scroll moves through four additive-blended point-cloud forms, each grown in from tiny, held, then blown past the camera:
  1. Surface: the room as a dot wireframe, with a door cut in the front wall.
  2. Structure: a node network joined to nearest neighbours.
  3. Core: a red dumbbell (two hazard points on a path).
  4. Sphere: the rescue sphere, with exit rings and a beacon.
  A 14,000-point dust field drifts with noise and changes palette per chapter (teal, cyan/violet, red, violet). The pointer ripples the dust. Scroll progress is kept outside any framework state and runs in both directions. Chapter copy fades and slides per chapter under a fixed corner nav. Cards lift on hover and focus.
- **`src/styles/main.css` (planner), PLENUM-style.** A pale studio palette (paper #edf2fd, ink #12141c, accent #3d5afe). Petrona headings, Familjen Grotesk body, Red Hat Mono labels. The old layered overrides were replaced by one stylesheet that covers every class the TypeScript uses.
- **`app.html`:** loads the three PLENUM font families.
- **`src/spatial/RoomScene.ts`:** the 3D viewport background is the paper colour, so the stage matches the UI.

## Not used, on purpose

- The scrollhaus.ai videos, Spline scene and images in the supplied briefs are not used. Those files belong to that site. The effects above are built from original code.
- PLENUM's live Spline form is not used. Providing a `.splinecode` scene would be needed to reproduce it.

## Running

    npm install
    npm run dev        # overview at /, planner at /app.html
    npm run build

The landing page loads Three.js r128 from cdnjs and the planner loads Three.js from npm. Fonts load from Google Fonts. If the 3D scene cannot start, the landing page falls back to the text overview and says so in the loader.

## Verification status

- Landing page: rendered headlessly at 1440×900 and 390×844 with the CDN blocked, so the 3D scene did not run. Checked: no horizontal overflow, no JavaScript errors, chapters advance and reverse with scroll, the chapters and cards stay readable on both sizes.
- Planner: its stylesheet rendered against a static copy of the shell markup at both sizes, with no overflow. The TypeScript modules were not bundled.
- Not verified: the WebGL forms, the pointer ripple, `npm run build`, and the planner running with its TypeScript modules. The sandbox could not install Vite or Three.js.
