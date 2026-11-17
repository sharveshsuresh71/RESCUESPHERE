# RescueSphere UI Upgrade

This update refreshes both experiences:

- **Overview (`index.html`)** — stronger cinematic typography, atmospheric dark navy treatment, glass navigation, cleaner feature cards, and a restrained cyan/amber HUD.
- **3D planner (`app.html`)** — persistent workspace navigation for all ten planner steps, an editorial top bar, live-scene labels/legend, responsive glass panels, improved forms/cards, and a visible 3D viewport behind the controls.
- **Navigation** — the active planner step is highlighted as you move through the workflow.
- **XR controls** — the Mixed Reality action is placed inside the planner shell so it follows the workspace styling.

## Run

```bash
npm install
npm run dev
```

Open the Vite URL for the overview. Select **Open planner** to enter the 3D workspace. The planner is also available at `/app.html`.

The interface remains a preparedness aid using user-provided room information. It does not certify exits, routes, dimensions, or building safety.
