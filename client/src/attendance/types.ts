import { mergeStrokeGroups, StrokeChoice } from "../api/inkStrokeGroups";
import {
  InkDocumentV2,
  LessonLocation,
  LessonTerm,
} from "../types";
export { equal } from "../api/inkStrokeGroups";
export interface Term {
  year: number;
  term: LessonTerm;
}
export const termKey = (t: Term) => `${t.year}:${t.term}`;
export const terms: Record<LessonTerm, string> = {
  spring: "봄학기",
  summer: "여름학기",
  fall: "가을학기",
  winter: "겨울학기",
};
export interface Center extends Term {
  id: string;
  locationId: string;
  weekday: number;
  revision: number;
  deletedAt: string | null;
}
export interface Period {
  id: string;
  centerId: string;
  name: string;
  position: number;
  revision: number;
  deletedAt: string | null;
}
export interface PageMeta {
  id: string;
  periodId: string;
  pageType: "photo" | "note";
  imageHash: string | null;
  width: number;
  height: number;
  position: number;
  revision: number;
  deletedAt: string | null;
  updatedAt: string;
}
export const NOTE_WIDTH = 1000;
export const NOTE_HEIGHT = 1414;
export const normalizePage = <T extends PageMeta>(page: T): T => ({
  ...page,
  pageType: page.pageType ?? "photo",
});
export const pageReady = (record: RecordPage) =>
  record.local.pageType === "note" || record.photoReady;
export interface Page extends PageMeta {
  inkDocument: InkDocumentV2;
}
export interface Catalog {
  centers: Center[];
  periods: Period[];
  pages: PageMeta[];
}
export function isPeriodDeleted(
  catalog: Catalog | undefined,
  periodId: string
) {
  const period = catalog?.periods.find((p) => p.id === periodId);
  return !!(
    period?.deletedAt ||
    catalog?.centers.find((c) => c.id === period?.centerId)?.deletedAt
  );
}
export interface Conflict {
  id: string;
  local?: StrokeChoice;
  server?: StrokeChoice;
}
export interface RecordPage {
  id: string;
  semester: Term;
  local: Page;
  base?: Page;
  dirty: boolean;
  version: number;
  conflicts: Conflict[];
  photoReady: boolean;
  error?: string;
  remoteDeleted?: boolean;
  historyKey?: number;
}
export interface SavedCatalog extends Catalog {
  semester: Term;
  locations: LessonLocation[];
}
export function mergeInk(
  base: InkDocumentV2 | undefined,
  local: InkDocumentV2,
  remote: InkDocumentV2
) {
  const { strokes, conflicts } = mergeStrokeGroups(base?.strokes, local.strokes, remote.strokes, false);
  return { ink: { ...remote, strokes }, conflicts };
}
