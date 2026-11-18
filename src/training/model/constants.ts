/** Planner cell size in metres. */
export const CELL = 0.1;

/** Radius of the simulated walker. Object clearance below this blocks the walker. */
export const BODY_RADIUS = 0.25;

/** Clearance (distance from the walker's centre to the nearest obstacle) below this is a tight passage. */
export const NARROW_CLEARANCE = 0.45;

/** Gaps between obstacles up to this width are reported as narrow passages. */
export const NARROW_GAP = 0.9;

/** Trip-hazard distance: within this range of a non-blocking object, the route counts as touching it. */
export const HAZARD_RANGE = 0.15;

/** Wall thickness used when measuring gaps between objects and walls. */
export const WALL_THICKNESS = 1.0;

/** Tolerance for comparing float32 clearances with thresholds, so boundary cells classify consistently. */
export const EPS = 1e-4;
