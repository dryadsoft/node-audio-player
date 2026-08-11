export const LESSON_TERMS = ['spring', 'summer', 'fall', 'winter'] as const;

export type LessonTerm = typeof LESSON_TERMS[number];

export interface LessonLocationResponse {
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
  status: 'draft' | 'complete';
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface LessonPlanResponse extends LessonPlanSummary {
  weeks: LessonWeek[];
}
