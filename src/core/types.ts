export type RoomTemplate = 'rectangle' | 'bedroom' | 'livingRoom' | 'custom';

export type ExitType = 'primary' | 'alternative';

export type ObstacleCategory =
  | 'furniture'
  | 'storage'
  | 'clutter'
  | 'narrowPassage'
  | 'other';

export type MeetingPointCategory = 'outdoor' | 'householdArea' | 'other';

export type RouteLabel = 'Route A' | 'Route B';

export type RouteReviewStatus = 'notReviewed' | 'reviewed';

export type ModuleId =
  | 'welcome'
  | 'safety'
  | 'roomSetup'
  | 'exitMapping'
  | 'obstacles'
  | 'routes'
  | 'meetingPoint'
  | 'checklist'
  | 'report'
  | 'dashboard';

export interface Vec2 {
  x: number;
  z: number;
}

export interface RoomDimensions {
  widthMeters: number | null;
  lengthMeters: number | null;
}

export interface RoomObject {
  id: string;
  kind: 'door' | 'window' | 'furniture' | 'custom';
  label: string;
  position: Vec2;
  userConfirmed: boolean;
  widthMeters?: number;
  depthMeters?: number;
  rotationDegrees?: number;
  /** Where the size came from: measured on a calibrated photo, or typed in by the user. */
  sizeSource?: 'photo' | 'entered';
}

export interface ExitMarker {
  id: string;
  label: string;
  position: Vec2;
  type: ExitType;
  userConfirmed: boolean;
}

export interface ObstacleMarker {
  id: string;
  category: ObstacleCategory;
  label: string;
  position: Vec2;
  userConfirmed: boolean;
}

export interface RoutePlan {
  id: string;
  label: RouteLabel;
  startPoint: Vec2;
  exitId: string;
  routePoints: Vec2[];
  obstacleCount: number;
  distanceMeters: number | null;
  distanceAvailable: boolean;
  reviewStatus: RouteReviewStatus;
}

export interface MeetingPoint {
  category: MeetingPointCategory;
  customLabel: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

export interface RoomPlan {
  id: string;
  name: string;
  roomDimensions: RoomDimensions;
  roomTemplate: RoomTemplate;
  roomObjects: RoomObject[];
  exits: ExitMarker[];
  obstacles: ObstacleMarker[];
  routes: RoutePlan[];
  meetingPoint: MeetingPoint;
  checklist: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
}

export interface PreparednessReport {
  planId: string;
  completionPercentage: number;
  completedTasks: number;
  totalTasks: number;
  generatedAt: string;
}
