import { LessonTerm } from './lesson-plan.interface';

export type InkPoint = [number, number, number, number, number?, number?];

export interface InkStroke {
  id: string;
  color: '#111827' | '#1d4ed8' | '#dc2626';
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
  inkDocument: InkDocumentV2;
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

export interface LessonCurriculumResponse extends LessonCurriculumSummary {
  weeks: LessonCurriculumWeekSummary[];
}
