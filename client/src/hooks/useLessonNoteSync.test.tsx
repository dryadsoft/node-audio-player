import { act, render, waitFor } from "@testing-library/react";
import { fixture } from "../testSupport/noteFixture";
import { NoteWorkspaceContext } from "../offline/useNoteWorkspace";
import { useLessonNoteSync } from "./useLessonNoteSync";
import { api } from "../api";
let sync: ReturnType<typeof useLessonNoteSync>;
function Harness({ week = 1 }: { week?: number }) {
  sync = useLessonNoteSync("c1", week);
  return null;
}
beforeEach(() =>
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  })
);
afterEach(() => jest.restoreAllMocks());
it("opens a locally cached note without a server response", async () => {
  const f = fixture();
  await f.workspace.refresh();
  Object.defineProperty(navigator, "onLine", { value: false });
  render(
    <NoteWorkspaceContext.Provider value={f.workspace}>
      <Harness />
    </NoteWorkspaceContext.Provider>
  );
  expect(sync.draft?.className).toBe("첫 만남");
  act(() => sync.update({ content: "오프라인 편집" }));
  await waitFor(() => expect(sync.saveState).toBe("unsaved"));
  expect(sync.draft?.content).toBe("오프라인 편집");
  expect(api.updateLessonCurriculumWeek).not.toHaveBeenCalled();
});
it("keeps Korean composition local until it finishes", async () => {
  const f = fixture();
  await f.workspace.refresh();
  render(
    <NoteWorkspaceContext.Provider value={f.workspace}>
      <Harness />
    </NoteWorkspaceContext.Provider>
  );
  act(() => {
    sync.composition(true);
    sync.update({ className: "한" });
  });
  await waitFor(() => expect(sync.saveState).toBe("unsaved"));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 750));
    await f.workspace.refresh();
  });
  expect(api.updateLessonCurriculumWeek).not.toHaveBeenCalled();
  act(() => sync.composition(false));
  await act(async () => {
    await f.workspace.refresh(true);
  });
  await waitFor(() => expect(sync.saveState).toBe("saved"));
});
it("keeps the current week isolated from earlier asynchronous writes", async () => {
  const f = fixture();
  await f.workspace.refresh();
  const view = render(
    <NoteWorkspaceContext.Provider value={f.workspace}>
      <Harness />
    </NoteWorkspaceContext.Provider>
  );
  act(() => sync.update({ className: "첫 주 수정" }));
  view.rerender(
    <NoteWorkspaceContext.Provider value={f.workspace}>
      <Harness week={2} />
    </NoteWorkspaceContext.Provider>
  );
  await waitFor(() =>
    expect(
      f.workspace.getSnapshot().notes.find((n) => n.key === "c1:1")?.local
        .className
    ).toBe("첫 주 수정")
  );
  expect(sync.draft?.week).toBe(2);
  expect(sync.draft?.className).toBe("");
  view.rerender(
    <NoteWorkspaceContext.Provider value={f.workspace}>
      <Harness />
    </NoteWorkspaceContext.Provider>
  );
  expect(sync.draft?.className).toBe("첫 주 수정");
});
it("retains typed input after local storage failure and retries it", async () => {
  const f = fixture();
  await f.workspace.refresh();
  render(
    <NoteWorkspaceContext.Provider value={f.workspace}>
      <Harness />
    </NoteWorkspaceContext.Provider>
  );
  jest
    .spyOn(f.store, "change")
    .mockRejectedValueOnce(new DOMException("full", "QuotaExceededError"));
  act(() => sync.update({ content: "사라지면 안 되는 입력" }));
  await waitFor(() => expect(sync.saveState).toBe("error"));
  expect(sync.draft?.content).toBe("사라지면 안 되는 입력");
  await act(async () => {
    await sync.retry();
  });
  await waitFor(() => expect(sync.saveState).toBe("unsaved"));
  expect(sync.draft?.content).toBe("사라지면 안 되는 입력");
});
