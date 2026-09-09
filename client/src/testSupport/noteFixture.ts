import "fake-indexeddb/auto";
import { serialize, deserialize } from "v8";
import { api, ApiError } from "../api";
import { LessonCurriculumSummary, LessonCurriculumWeek } from "../types";
import { NoteStore } from "../offline/noteStore";
import { NoteWorkspace } from "../offline/noteWorkspace";
if (!(global as { structuredClone?: unknown }).structuredClone)
  Object.defineProperty(global, "structuredClone", {
    configurable: true,
    value: (value: unknown) => deserialize(serialize(value)),
  });
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const note = (week = 1): LessonCurriculumWeek => ({
  week,
  className: week === 1 ? "첫 만남" : "",
  content: "수업 내용",
  revision: 1,
  updatedAt: "2026-09-09T00:00:00.000Z",
  hasInk: false,
  inkDocument: { version: 2, aspectRatio: 4 / 3, pageCount: 2, strokes: [] },
});
export const summary = (id = "c1"): LessonCurriculumSummary => ({
  id,
  year: 2026,
  term: "fall",
  programName: id === "c1" ? "오감별" : "겨울 놀이",
  completedWeeks: 1,
  linkedPlanCount: 0,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
});
let serial = 0;
export function fixture(ids = ["c1"]) {
  const data = new Map(
    ids.map((id) => [
      id,
      {
        summary: summary(id),
        weeks: Array.from({ length: 12 }, (_, i) => note(i + 1)),
      },
    ])
  );
  let revision = 0;
  const editRemote = (
    id: string,
    week: number,
    changes: Partial<LessonCurriculumWeek>
  ) => {
    const item = data.get(id)!;
    const previous = item.weeks[week - 1];
    const now = new Date(Date.UTC(2026, 8, 9, 0, 0, ++revision)).toISOString();
    const next = {
      ...previous,
      ...changes,
      revision: previous.revision + 1,
      updatedAt: now,
    };
    item.weeks[week - 1] = next;
    item.summary.updatedAt = now;
    return clone(next);
  };
  jest
    .spyOn(api, "lessonCurricula")
    .mockImplementation(async () =>
      clone(Array.from(data.values()).map((d) => d.summary))
    );
  jest.spyOn(api, "lessonCurriculum").mockImplementation(async (id) => {
    const item = data.get(id);
    if (!item) throw new ApiError("삭제됨", 404);
    return clone({
      ...item.summary,
      weeks: item.weeks.map(({ inkDocument, ...w }) => w),
    });
  });
  jest
    .spyOn(api, "lessonCurriculumWeek")
    .mockImplementation(async (id, week) => {
      const item = data.get(id);
      if (!item) throw new ApiError("삭제됨", 404);
      return clone(item.weeks[week - 1]);
    });
  jest
    .spyOn(api, "updateLessonCurriculumWeek")
    .mockImplementation(async ({ id, ...input }) => {
      const item = data.get(id);
      if (!item) throw new ApiError("삭제됨", 404);
      if (item.weeks[input.week - 1].revision !== input.revision)
        throw new ApiError("충돌", 409);
      return editRemote(id, input.week, {
        className: input.className,
        content: input.content,
        inkDocument: input.inkDocument,
      });
    });
  jest.spyOn(api, "lessonPlans").mockResolvedValue([]);
  const store = new NoteStore(`notes-test-${++serial}`);
  const workspace = new NoteWorkspace(store);
  const edit = async (
    key: string,
    changes: Partial<LessonCurriculumWeek>,
    target = workspace
  ) => {
    const current = target.getSnapshot().notes.find((n) => n.key === key)!;
    await target.edit(key, current.local, { ...current.local, ...changes });
    await target.store.change(key, (n) => n && { ...n, changedAt: 0 });
    await target.reload();
  };
  return { data, store, workspace, edit, editRemote };
}
