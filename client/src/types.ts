export interface TrackReference {
  path: string;
  name: string;
}

export interface PlaylistTrack extends TrackReference {
  available: boolean;
}

export interface SavedPlaylist {
  id: string;
  title: string;
  tracks: PlaylistTrack[];
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistDownloadStatus {
  id: string;
  playlistId: string;
  status: "queued" | "processing" | "ready" | "failed";
  completed: number;
  total: number;
  fileName?: string;
  error?: string;
}

export interface LibraryResponse {
  directory: Array<{ name: string }>;
  playlist: Array<{ name: string }>;
}

export type LessonTerm = "spring" | "summer" | "fall" | "winter";

export interface LessonLocation {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LessonWeek {
  week: number;
  className: string;
  content: string;
}

export interface LessonPlanSummary {
  id: string;
  year: number;
  term: LessonTerm;
  locationId: string;
  locationName: string;
  locationActive: boolean;
  programName: string;
  sectionName: string;
  completedWeeks: number;
  status: "draft" | "complete";
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface LessonPlan extends LessonPlanSummary {
  weeks: LessonWeek[];
}

export interface LessonPlanInput {
  year: number;
  term: LessonTerm;
  locationId: string;
  programName: string;
  sectionName: string;
  weeks: LessonWeek[];
}
