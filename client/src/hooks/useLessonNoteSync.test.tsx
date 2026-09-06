import { act, render } from "@testing-library/react";
import { api, ApiError } from "../api";
import {
  clearLessonNoteDraft,
  loadLessonNoteDraft,
  saveLessonNoteDraft,
} from "../api/lessonNoteDrafts";
import { LessonCurriculumWeek } from "../types";
import { useLessonNoteSync } from "./useLessonNoteSync";
jest.mock("../api/lessonNoteDrafts", () => ({
  loadLessonNoteDraft: jest.fn().mockResolvedValue(undefined),
  saveLessonNoteDraft: jest.fn().mockResolvedValue(undefined),
  clearLessonNoteDraft: jest.fn().mockResolvedValue(undefined),
}));
const note = (revision = 1): LessonCurriculumWeek => ({
  week: 1,
  className: "원본",
  content: "내용",
  hasInk: false,
  revision,
  updatedAt: String(revision),
  inkDocument: { version: 2, aspectRatio: 4 / 3, pageCount: 2, strokes: [] },
});
let sync: ReturnType<typeof useLessonNoteSync>;
function Harness({
  id = "c",
  remote = initial,
}: {
  id?: string;
  remote?: LessonCurriculumWeek;
}) {
  sync = useLessonNoteSync(id, remote.week, remote);
  return null;
}
const initial = note();
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};
const tick = async () => {
  await act(async () => {
    jest.advanceTimersByTime(701);
  });
};
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (loadLessonNoteDraft as jest.Mock).mockResolvedValue(undefined);
  (saveLessonNoteDraft as jest.Mock).mockResolvedValue(undefined);
  (clearLessonNoteDraft as jest.Mock).mockResolvedValue(undefined);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
it("applies a remote revision when clean and merges independent edits when dirty", async () => {
  const view = render(<Harness />);
  await flush();
  act(() => sync.update({ className: "장비" }));
  view.rerender(<Harness remote={{ ...note(2), content: "서버" }} />);
  await flush();
  expect(sync.draft?.className).toBe("장비");
  expect(sync.draft?.content).toBe("서버");
  expect(sync.conflicts).toHaveLength(0);
});
it("preserves input entered during save and uses the acknowledgement revision", async () => {
  let finish: (v: LessonCurriculumWeek) => void = () => {};
  jest
    .spyOn(api, "updateLessonCurriculumWeek")
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    )
    .mockImplementation(async (input) => ({
      ...note(3),
      className: input.className,
    }));
  render(<Harness />);
  await flush();
  act(() => sync.update({ className: "전송" }));
  await tick();
  act(() => sync.update({ className: "추가 입력" }));
  await act(async () => finish({ ...note(2), className: "전송" }));
  expect(sync.draft?.className).toBe("추가 입력");
  expect(sync.draft?.revision).toBe(2);
  await tick();
  expect(api.updateLessonCurriculumWeek).toHaveBeenLastCalledWith(
    expect.objectContaining({ className: "추가 입력", revision: 2 })
  );
});
it("rebases a 409 and retries, but stops at a text conflict", async () => {
  jest
    .spyOn(api, "updateLessonCurriculumWeek")
    .mockRejectedValueOnce(new ApiError("충돌", 409))
    .mockImplementation(async (input) => ({ ...note(3), ...input }));
  jest
    .spyOn(api, "lessonCurriculumWeek")
    .mockResolvedValue({ ...note(2), content: "서버" });
  render(<Harness />);
  await flush();
  act(() => sync.update({ className: "장비" }));
  await tick();
  expect(api.updateLessonCurriculumWeek).toHaveBeenCalledTimes(2);
  expect(sync.draft?.content).toBe("서버");
  expect(sync.conflicts).toHaveLength(0);
});
it("limits repeated 409 saves to three retries", async () => {
  jest
    .spyOn(api, "updateLessonCurriculumWeek")
    .mockRejectedValue(new ApiError("충돌", 409));
  let revision = 1;
  jest
    .spyOn(api, "lessonCurriculumWeek")
    .mockImplementation(async () => note(++revision));
  render(<Harness />);
  await flush();
  act(() => sync.update({ className: "장비" }));
  await tick();
  expect(api.updateLessonCurriculumWeek).toHaveBeenCalledTimes(4);
  expect(sync.saveState).toBe("error");
  await tick();
  expect(api.updateLessonCurriculumWeek).toHaveBeenCalledTimes(4);
});
it("holds remote ink during interaction and defers saves during Korean composition", async () => {
  const save = jest
    .spyOn(api, "updateLessonCurriculumWeek")
    .mockResolvedValue(note(3));
  const view = render(<Harness />);
  await flush();
  act(() => sync.interaction(true));
  view.rerender(<Harness remote={{ ...note(2), content: "새 내용" }} />);
  await flush();
  expect(sync.draft?.revision).toBe(1);
  act(() => sync.interaction(false));
  expect(sync.draft?.revision).toBe(2);
  act(() => {
    sync.composition(true);
    sync.update({ className: "한" });
  });
  await tick();
  expect(save).not.toHaveBeenCalled();
  act(() => sync.composition(false));
  await tick();
  expect(save).toHaveBeenCalledTimes(1);
});
it("keeps legacy and revision-mismatched drafts available for conflict recovery", async () => {
  (loadLessonNoteDraft as jest.Mock).mockResolvedValue({
    local: { ...note(), className: "옛 임시" },
  });
  render(<Harness remote={note(4)} />);
  await flush();
  expect(sync.conflicts.map((c) => c.id)).toContain("className");
  act(() => sync.resolve(sync.conflicts[0], "local"));
  expect(sync.draft?.className).toBe("옛 임시");
  expect(saveLessonNoteDraft).toHaveBeenLastCalledWith(
    "c:1",
    expect.objectContaining({ className: "옛 임시" }),
    expect.objectContaining({ revision: 4 })
  );
});
it("does not apply a late save from another week to the active week", async () => {
  let finish: (v: LessonCurriculumWeek) => void = () => {};
  jest.spyOn(api, "updateLessonCurriculumWeek").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const view = render(<Harness />);
  await flush();
  act(() => sync.update({ className: "첫 주" }));
  await tick();
  view.rerender(<Harness remote={{ ...note(), week: 2 }} />);
  await flush();
  await act(async () => finish({ ...note(2), className: "첫 주" }));
  expect(sync.draft?.week).toBe(2);
  expect(sync.draft?.className).toBe("원본");
});

it("accepts server text normalization without an endless save loop", async () => {
  jest
    .spyOn(api, "updateLessonCurriculumWeek")
    .mockResolvedValue({ ...note(2), className: "수업" });
  render(<Harness />);
  await flush();
  act(() => sync.update({ className: " 수업 " }));
  await tick();
  expect(sync.draft?.className).toBe("수업");
  expect(sync.saveState).toBe("saved");
  await tick();
  expect(api.updateLessonCurriculumWeek).toHaveBeenCalledTimes(1);
});
