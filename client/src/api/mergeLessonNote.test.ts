import { mergeLessonNote, normalizeInk } from "./mergeLessonNote";
import { LessonCurriculumWeek, InkStrokeV2 } from "../types";
const stroke = (id: string, width = 2): InkStrokeV2 => ({
  id,
  page: 0,
  color: "#111827",
  width,
  points: [[0.1, 0.2, 0.7, 0]],
});
const note = (strokes: InkStrokeV2[] = []): LessonCurriculumWeek => ({
  week: 1,
  className: "수업",
  content: "내용",
  hasInk: !!strokes.length,
  revision: 1,
  updatedAt: "",
  inkDocument: { version: 2, aspectRatio: 4 / 3, pageCount: 2, strokes },
});
it("merges independent text and simultaneous strokes", () => {
  const base = note(),
    local = { ...note([stroke("a")]), className: "장비" },
    remote = { ...note([stroke("b")]), content: "서버", revision: 2 };
  const result = mergeLessonNote(base, local, remote);
  expect(result.conflicts).toEqual([]);
  expect(result.merged.className).toBe("장비");
  expect(result.merged.content).toBe("서버");
  expect(result.merged.inkDocument.strokes.map((s) => s.id)).toEqual([
    "a",
    "b",
  ]);
});
it("accepts deletion against unchanged strokes while preserving additions", () => {
  const result = mergeLessonNote(
    note([stroke("a")]),
    note(),
    note([stroke("a"), stroke("b")])
  );
  expect(result.conflicts).toEqual([]);
  expect(result.merged.inkDocument.strokes.map((s) => s.id)).toEqual(["b"]);
});
it("isolates conflicting text and modified/deleted strokes", () => {
  const result = mergeLessonNote(
    note([stroke("a")]),
    { ...note(), className: "장비" },
    { ...note([stroke("a", 4), stroke("b")]), className: "서버" }
  );
  expect(result.conflicts.map((c) => c.id)).toEqual(["stroke:a", "className"]);
  expect(result.merged.inkDocument.strokes.map((s) => s.id)).toEqual(["b"]);
});
it("requires comparison for legacy drafts without an ancestor", () => {
  const result = mergeLessonNote(
    undefined,
    { ...note(), content: "임시" },
    note([stroke("server")])
  );
  expect(result.conflicts.map((c) => c.id)).toEqual([
    "stroke:server",
    "content",
  ]);
});
it("accepts identical edits and retains the largest page count", () => {
  const base = note(),
    local = { ...note(), content: "같음" },
    remote = {
      ...local,
      inkDocument: {
        ...normalizeInk(note().inkDocument),
        version: 2 as const,
        pageCount: 5,
      },
    };
  const result = mergeLessonNote(base, local, remote);
  expect(result.conflicts).toEqual([]);
  expect(result.merged.inkDocument.pageCount).toBe(5);
});
