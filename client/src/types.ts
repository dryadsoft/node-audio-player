import type { InkDocument } from "@dryadsoft/react-ink-canvas";

export type {
  InkDocument,
  InkDocumentV1,
  InkDocumentV2,
  InkPoint,
  InkStroke,
  InkStrokeV2,
} from "@dryadsoft/react-ink-canvas";

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

export interface LessonCurriculumWeekSummary {
  week: number;
  className: string;
  content: string;
  lessonPlan: string;
  materials: string;
  hasInk: boolean;
  revision: number;
  updatedAt: string;
}

export interface LessonCurriculumWeek extends LessonCurriculumWeekSummary {
  inkDocument: InkDocument;
}

export interface LessonCurriculumSummary {
  id: string;
  year: number;
  term: LessonTerm;
  programName: string;
  completedWeeks: number;
  linkedPlanCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LessonCurriculum extends LessonCurriculumSummary {
  weeks: LessonCurriculumWeekSummary[];
}

export interface DeleteLessonCurriculumResult {
  id: string;
  detachedPlanCount: number;
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
  curriculumId: string | null;
  completedWeeks: number;
  status: "draft" | "complete";
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface LessonPlanDocumentFields {
  documentTitle: string;
  courseName: string;
  instructorName: string;
  representativeProfile: string;
  courseIntroduction: string;
  audience: string;
  capacity: string;
  scheduleDetails: string;
  tuition: string;
  materialFee: string;
  openLecture: string;
  notice: string;
}

export interface LessonPlan
  extends LessonPlanSummary, LessonPlanDocumentFields {
  weeks: LessonWeek[];
}

export interface LessonPlanInput extends LessonPlanDocumentFields {
  year: number;
  term: LessonTerm;
  locationId: string;
  programName: string;
  sectionName: string;
  curriculumId: string | null;
  weeks: LessonWeek[];
}
