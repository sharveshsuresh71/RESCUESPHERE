# Testing checklist

## Desktop

- [ ] App loads with no console errors
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] Welcome screen renders
- [ ] Disclaimer is visible
- [ ] Room setup works
- [ ] Exits can be added and removed
- [ ] Obstacles can be added and removed
- [ ] Routes can be created and reviewed
- [ ] Meeting point can be selected
- [ ] Checklist updates progress
- [ ] Report shows Planning Progress
- [ ] Plan persists after refresh
- [ ] Dashboard displays saved plan
- [ ] Reset asks for confirmation
- [ ] Pause/resume/restart controls work

## IWER

- [ ] XR emulation starts
- [ ] Pointer interaction works
- [ ] Immersive session enters and exits
- [ ] Core flow completes
- [ ] No XR console errors

## Meta Quest hardware

Only mark complete after physical testing:

- [ ] Public HTTPS URL loads
- [ ] Immersive session enters
- [ ] Hand tracking works
- [ ] Pinch selection works
- [ ] Pinch drag works
- [ ] Spatial panels are reachable
- [ ] Performance is stable
- [ ] Local persistence works

## Advanced upgrade checks

- [ ] Drag a furniture marker and confirm the 3D preview follows it.
- [ ] Resize and rotate furniture; confirm its 3D footprint changes.
- [ ] Place two furniture markers close together and confirm the overlap warning appears.
- [ ] Add one or two exits and mark obstacles; calculate A* routes.
- [ ] Move an obstacle into a route corridor, recalculate, and compare the route.
- [ ] Confirm the report includes dimensions, furniture, route counts and route distances.
- [ ] Export the report using browser Print → Save as PDF.
- [ ] Confirm dashboard analytics update after changing the plan.
- [ ] On supported Quest hardware, test immersive AR, passthrough, hand tracking and pinch detection.
- [ ] Verify routes and room dimensions manually; app output is not a safety certification.
