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

export type InkPoint = [number, number, number, number, number?, number?];

export interface InkStroke {
  id: string;
  color: "#111827" | "#1d4ed8" | "#dc2626";
  width: 2 | 4 | 7;
  points: InkPoint[];
}

export interface InkDocumentV1 {
  version: 1;
  aspectRatio: number;
  strokes: InkStroke[];
}

export interface InkStrokeV2 extends InkStroke {
  page: number;
}

export interface InkDocumentV2 {
  version: 2;
  aspectRatio: number;
  pageCount: number;
  strokes: InkStrokeV2[];
}

export type InkDocument = InkDocumentV1 | InkDocumentV2;

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
