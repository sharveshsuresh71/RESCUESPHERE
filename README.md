# RescueSphere — Full WebXR Project Scaffold

RescueSphere is a hands-first, privacy-first Mixed Reality home-preparedness planning experience for the Meta VR Start Developer Competition 2026.

This repository contains a complete, runnable **Three.js + WebXR + TypeScript + Vite** project scaffold. It implements the full P0 product flow with desktop/IWER support and provides a clear migration path to the official Meta Immersive Web SDK (IWSDK).

## Important implementation note

This scaffold uses standard WebXR and Three.js APIs so it can run immediately without inventing IWSDK APIs. Before final competition submission, migrate the interaction, spatial UI, ECS, and input systems to the **installed IWSDK version’s documented APIs**.

Do not claim IWSDK usage, Quest hardware validation, hand-tracking validation, or spatial-understanding support until those features have actually been implemented and tested.

## Quick start

```bash
npm install
npm run dev
```

Open the local URL in a desktop browser. For XR emulation, use IWER or a WebXR-compatible browser emulator.

## Production build

```bash
npm run build
npm run preview
```

## Type checking

```bash
npm run typecheck
```

## What's in this build

- Interactive 2D top-down room plan (`src/ui/PlanEditor.ts`): drag door/window/furniture, exit and obstacle markers with mouse, touch or pen; arrow keys move a focused marker.
- 3D Three.js room preview behind the panels, kept in sync with the plan (room, markers, routes).
- Route A / Route B are illustrative polylines; obstacle counts use distance-to-segment proximity (not pathfinding); length is an approximate polyline length.
- Layout edits (room size, markers) clear generated routes so stale routes are never shown.
- "Enter Immersive View" prefers `immersive-ar`, falls back to `immersive-vr`, and degrades gracefully on desktop.
- Saved plans are validated/merged over defaults when loaded.

## Verification status

Type-checked with `tsc` and click-through tested in headless Chromium (Three.js stubbed). Not yet verified: a real `npm install && npm run build`, a real WebXR/IWER session, or Quest hardware. Run those before submitting.

## Core flow

`Welcome → Safety Introduction → Room Setup → Exit Mapping → Obstacle Awareness → Route Comparison → Meeting Point → Checklist → Report → Dashboard`

## Features

- Manual room builder with templates
- Door, window, and furniture markers
- Up to two user-identified exits
- Up to three user-marked obstacles
- Route A and Route B visualization
- Transparent route comparison
- Meeting-point selection
- Five-item preparedness checklist
- Final local report
- Planning Progress score
- Local dashboard
- Pause, resume, restart, and reset
- Local persistence
- WebXR entry with desktop fallback
- Public HTTPS deployment support

## Safety and privacy

RescueSphere is educational. It does not guarantee safety, replace emergency services, or replace official local guidance. All room data remains local in the browser.

## IWSDK migration

See `IWSDK_MIGRATION.md` before converting this scaffold to IWSDK. Inspect the installed `@iwsdk/*` types and official examples before changing interaction or ECS code.

## Advanced upgrade (November 2026)

The upgraded build adds:

- A* grid-based route calculation (10 cm cells) around user-marked obstacles and furniture footprints.
- Drag-and-drop room marker editing, desktop 3D orbit/zoom, furniture footprint sizing and rotation.
- Approximate furniture-overlap warnings to help review the entered floor plan.
- Print-to-PDF report export (choose **Save as PDF** in the browser print dialog).
- Dashboard analytics for exits, obstacles, room objects, routes, route lengths and planning completion.
- Improved WebXR session handling: immersive AR is preferred when supported, the scene background becomes transparent for passthrough, and supported hand joints are checked for pinch gestures.

### Run locally

```powershell
npm install
npm run typecheck
npm run build
npm run dev
```

Open the Vite URL shown in the terminal. Keep the terminal running while testing.

### Desktop controls

- Drag the 2D room markers to reposition doors, windows, furniture, exits and obstacles.
- Drag on the 3D canvas to orbit the room; use the mouse wheel to zoom.
- In Room Setup, add furniture, resize the most recently added furniture footprint, and rotate it in 15-degree steps.
- In Route Comparison, calculate A* routes after adding exits and marking obstacles.
- In Preparedness Report, select **Export PDF Report**, then choose **Save as PDF**.

### Meta Quest / WebXR notes

For headset testing, deploy or serve the app from an HTTPS origin and open it in a WebXR-capable Meta Quest browser. The app requests `immersive-ar` first and falls back to `immersive-vr` when available. Hand tracking requires headset support, browser support, permission and hand-tracking settings. The current hand feature detects tracked hands and pinch proximity; it does not yet use pinch gestures to grab or manipulate 3D objects. Real passthrough behavior must be verified on the target headset.

### Safety and accuracy limits

RescueSphere is a household planning and visualization aid, not a certified emergency navigation system. A* uses only manually entered room dimensions, marker positions and approximate furniture footprints. It does not sense the real room, verify door accessibility, account for smoke/fire/structural damage, or guarantee an unobstructed route. Check every plan in person and follow local emergency guidance.

## Auto Room Scanner (WebXR plane detection)

The Room Setup screen includes an **Auto Room Scanner**. On a compatible immersive-AR headset/browser, served from HTTPS (or localhost for development), it requests WebXR `plane-detection` and estimates the bounds of the largest detected horizontal plane over a 15-second scan. The estimated width and length are copied into the room dimensions and the user is asked to verify them.

**Limitations:** this is an experimental floor-plane estimate, not a full architectural scan. It does not identify every wall, door, window, furnishing, or hidden obstacle, and it is not a certified measurement. WebXR plane detection support and permission behavior vary by headset and browser. If unsupported or no suitable floor plane is detected, use the existing manual dimension fields. For reliable emergency planning, independently measure and verify all dimensions, exits, and clearances.

To test on a headset, deploy the app to an HTTPS origin, open it in a WebXR-compatible browser, allow camera/spatial-sensing permissions, enter Room Setup, start the scan, and slowly pan around the visible floor and room perimeter during the scan.

## 3D furniture block editor

After setting or scanning room dimensions, open **Room Setup** and choose a block from **Furniture / object block**. Add beds, sofas, tables, chairs, wardrobes, fridges, bookshelves, desks, cabinets, or a generic block. Each item is rendered as a simple 3D block model in the room preview and as a footprint in the top-down plan. Drag the footprint to reposition it; use **Resize Last Furniture**, **Rotate Last Furniture 15°**, or **Remove** to edit the layout. Overlap warnings are shown for furniture markers.

Furniture is currently added by the user from this catalog; the camera scanner estimates the floor dimensions and does not automatically recognize individual furniture or household objects. Verify all dimensions and escape clearances in the real room.
