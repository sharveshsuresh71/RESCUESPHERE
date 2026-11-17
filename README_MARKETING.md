# RescueSphere marketing site

The root `index.html` is the responsive marketing website. It uses semantic HTML rendered from `src/main.ts`, a custom SVG isometric apartment illustration, and `src/styles/marketing.css`.

The existing application is preserved at `app.html` and uses `src/app.ts`. Marketing CTAs open this existing planner.

## Run locally
```bash
npm install
npm run typecheck
npm run build
npm run dev
```
Open `http://localhost:5173/` for the marketing website and `http://localhost:5173/app.html` for the existing planner.

The isometric apartment is an illustrative product visual, not a measured scan of an actual property. Hazard and route examples are illustrative. RescueSphere is a preparedness aid, not a certified emergency-response or building-safety system.
