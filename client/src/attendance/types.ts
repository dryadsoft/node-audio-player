import {
  InkDocumentV2,
  InkStrokeV2,
  LessonLocation,
  LessonTerm,
} from "../types";
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
  local?: InkStrokeV2;
  server?: InkStrokeV2;
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
export const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function mergeInk(
  base: InkDocumentV2 | undefined,
  local: InkDocumentV2,
  remote: InkDocumentV2
) {
  const b = new Map(base?.strokes.map((s) => [s.id, s])),
    l = new Map(local.strokes.map((s) => [s.id, s])),
    r = new Map(remote.strokes.map((s) => [s.id, s]));
  const strokes: InkStrokeV2[] = [],
    conflicts: Conflict[] = [];
  Array.from(
    new Set([
      ...Array.from(b.keys()),
      ...Array.from(l.keys()),
      ...Array.from(r.keys()),
    ])
  ).forEach((id) => {
    const bs = b.get(id),
      ls = l.get(id),
      rs = r.get(id);
    let chosen = ls;
    if (equal(ls, rs)) chosen = ls;
    else if (equal(ls, bs)) chosen = rs;
    else if (equal(rs, bs)) chosen = ls;
    else conflicts.push({ id, local: ls, server: rs });
    if (chosen) strokes.push(chosen);
  });
  return { ink: { ...remote, strokes }, conflicts };
}
