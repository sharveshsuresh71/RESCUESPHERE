# IWSDK migration guide

This scaffold intentionally uses standard Three.js and WebXR APIs so it runs without assuming unavailable IWSDK APIs.

Before migrating to IWSDK:

1. Run `npm create @iwsdk@latest` in a separate folder.
2. Inspect `package.json`, installed `@iwsdk/*` exports, `.d.ts` files, generated source, and official examples.
3. Map the current DOM-based panels to the IWSDK spatial UI system actually exposed by the installed version.
4. Map pointer events to the documented hand interaction system.
5. Map the current scene objects to the installed ECS component/system conventions.
6. Preserve all product logic, local persistence, safety language, and desktop fallback.
7. Do not claim IWSDK implementation until the migration is complete and verified in IWER.

## Migration priorities

1. XR session lifecycle.
2. Hand input and pinch selection.
3. Spatial panels and buttons.
4. Room scene ECS representation.
5. Marker placement and dragging.
6. Route visualization.
7. Local persistence.
8. Quest Browser validation.

## Non-negotiables

- Never invent IWSDK APIs.
- Never assume hand tracking, passthrough, or spatial understanding is available.
- Use feature detection.
- Keep the manual room builder functional.
- Keep the safety disclaimer visible.
- Do not label routes as safe.
