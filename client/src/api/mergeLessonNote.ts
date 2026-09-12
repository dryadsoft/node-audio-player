import { equal, mergeStrokeGroups, StrokeChoice } from "./inkStrokeGroups";
import {
  InkDocument,
  InkDocumentV2,
  LessonCurriculumWeek,
} from "../types";
export { equal } from "./inkStrokeGroups";
export const normalizeInk = (ink: InkDocument): InkDocumentV2 =>
  ink.version === 2
    ? ink
    : {
        ...ink,
        version: 2,
        pageCount: 2,
        strokes: ink.strokes.map((s) => ({ ...s, page: 0 })),
      };
export interface NoteConflict {
  id: string;
  label: string;
  local: string | StrokeChoice;
  server: string | StrokeChoice;
}
export function mergeLessonNote(
  base: LessonCurriculumWeek | undefined,
  local: LessonCurriculumWeek,
  server: LessonCurriculumWeek
) {
  const conflicts: NoteConflict[] = [];
  const choose = <T extends NoteConflict["local"]>(
    id: string,
    label: string,
    b: T,
    l: T,
    r: T
  ): T => {
    if (equal(l, r)) return l;
    if (base && equal(l, b)) return r;
    if (base && equal(r, b)) return l;
    conflicts.push({
      id,
      label,
      local: l as NoteConflict["local"],
      server: r as NoteConflict["server"],
    });
    return l;
  };
  const bi = base && normalizeInk(base.inkDocument),
    li = normalizeInk(local.inkDocument),
    ri = normalizeInk(server.inkDocument);
  const { strokes, conflicts: inkConflicts } = mergeStrokeGroups(bi?.strokes, li.strokes, ri.strokes);
  conflicts.push(...inkConflicts.map(c => ({ ...c, id: `stroke:${c.id}`, label: "필기 획" })));
  const merged = {
    ...server,
    className:
      choose(
        "className",
        "수업명",
        base?.className,
        local.className,
        server.className
      ) || "",
    content:
      choose(
        "content",
        "수업내용",
        base?.content,
        local.content,
        server.content
      ) || "",
    inkDocument: {
      ...ri,
      pageCount: Math.max(
        li.pageCount,
        ri.pageCount,
        ...strokes.map((s) => s.page + 1)
      ),
      strokes,
    },
  };
  return { merged, conflicts };
}
