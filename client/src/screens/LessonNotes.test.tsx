import "@testing-library/jest-dom";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "react-query";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../context/ThemeContext";
import { NoteWorkspaceContext } from "../offline/useNoteWorkspace";
import { NoteWorkspace } from "../offline/noteWorkspace";
import { api } from "../api";
import { fixture } from "../testSupport/noteFixture";
import LessonNotes from "./LessonNotes";

const pencilEvent = (type: string, x: number, buttons: number) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerType: { value: "pen" },
    pointerId: { value: 7 },
    clientX: { value: x },
    clientY: { value: 40 },
    pressure: { value: buttons ? 0.7 : 0 },
    buttons: { value: buttons },
    tiltX: { value: 0 },
    tiltY: { value: 0 },
  });
  return event;
};
beforeEach(() => {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({
      setTransform: jest.fn(),
      clearRect: jest.fn(),
      beginPath: jest.fn(),
      arc: jest.fn(),
      fill: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
    } as unknown as CanvasRenderingContext2D);
  jest
    .spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect")
    .mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 400,
      bottom: 300,
      width: 400,
      height: 300,
      toJSON: () => ({}),
    });
});
afterEach(() => jest.restoreAllMocks());
const mount = (workspace: NoteWorkspace) =>
  render(
    <NoteWorkspaceContext.Provider value={workspace}>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        <ThemeProvider>
          <MemoryRouter>
            <LessonNotes />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </NoteWorkspaceContext.Provider>
  );
const openTerm = (name = "오감별") => {
  const list = screen.getByRole("complementary", {
    name: "공통 수업노트 목록",
  });
  const trigger = within(list).getByRole("button", { name: new RegExp(name) });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
};

it("keeps title, content and ten consecutive Pencil strokes in durable local storage", async () => {
  const f = fixture();
  mount(f.workspace);
  const input = await screen.findByLabelText("1주차 공통 수업명");
  fireEvent.change(input, { target: { value: "태블릿 수업" } });
  fireEvent.change(screen.getByLabelText("1주차 공통 수업할 내용"), {
    target: { value: "필기와 함께 보존" },
  });
  const canvas = screen.getByLabelText("Apple Pencil 필기 영역 1페이지");
  Object.assign(canvas, { releasePointerCapture: jest.fn() });
  for (let i = 0; i < 10; i++) {
    fireEvent(canvas, pencilEvent("pointerdown", 20 + i * 20, 1));
    fireEvent(window, pencilEvent("pointerup", 30 + i * 20, 0));
  }
  await waitFor(() =>
    expect(
      f.workspace.getSnapshot().notes.find((n) => n.key === "c1:1")?.local
        .inkDocument.strokes
    ).toHaveLength(10)
  );
  await waitFor(
    () =>
      expect(f.data.get("c1")!.weeks[0]).toMatchObject({
        className: "태블릿 수업",
        content: "필기와 함께 보존",
      }),
    { timeout: 3000 }
  );
  expect(screen.getByLabelText("Apple Pencil 필기 영역 1페이지")).toBe(canvas);
});

it("reopens offline, browses an unopened term and edits week twelve", async () => {
  const f = fixture(["c1", "c2"]);
  await f.workspace.refresh();
  Object.defineProperty(navigator, "onLine", { value: false });
  mount(new NoteWorkspace(f.store));
  await screen.findByLabelText("1주차 공통 수업명");
  openTerm("겨울 놀이");
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(
    await within(dialog).findByRole("button", { name: /^12주차/ })
  );
  const last = await screen.findByLabelText("12주차 공통 수업명");
  fireEvent.change(last, { target: { value: "비행기 모드에서도 기록" } });
  await waitFor(async () =>
    expect(
      (await f.store.read()).notes.find((n) => n.key === "c2:12")?.local
        .className
    ).toBe("비행기 모드에서도 기록")
  );
  fireEvent.click(screen.getByRole("button", { name: "수업노트 관리" }));
  expect(screen.getByRole("button", { name: "새 공통 원본" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "12주 교체" })).toBeDisabled();
  expect(api.updateLessonCurriculumWeek).not.toHaveBeenCalled();
});

it("keeps the active canvas when browsing terms and restores drawer focus", async () => {
  const f = fixture(["c1", "c2"]);
  mount(f.workspace);
  const input = await screen.findByLabelText("1주차 공통 수업명");
  fireEvent.change(input, { target: { value: "작성 중" } });
  const canvas = screen.getByLabelText("Apple Pencil 필기 영역 1페이지");
  const trigger = openTerm("겨울 놀이");
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByRole("button", { name: /^12주차/ });
  expect(screen.getByLabelText("Apple Pencil 필기 영역 1페이지")).toBe(canvas);
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.getByLabelText("1주차 공통 수업명")).toHaveValue("작성 중");
});

it("contains keyboard focus in the mobile week drawer and supports back navigation", async () => {
  const f = fixture(["c1", "c2"]);
  mount(f.workspace);
  await screen.findByLabelText("1주차 공통 수업명");
  const trigger = screen.getByRole("button", { name: "학기·주차 선택" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: /겨울 놀이/ }));
  const last = await within(dialog).findByRole("button", { name: /^12주차/ });
  const close = within(dialog).getByRole("button", { name: "주차 메뉴 닫기" });
  close.focus();
  fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
  expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: "Tab" });
  expect(close).toHaveFocus();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "학기 목록으로" })
  );
  expect(
    within(dialog).getByRole("heading", { name: "학기 선택" })
  ).toBeInTheDocument();
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("requires confirmation for online deletion and preserves linked-plan API behavior", async () => {
  const f = fixture();
  const remove = jest
    .spyOn(api, "deleteLessonCurriculum")
    .mockImplementation(async () => {
      f.data.delete("c1");
      return { id: "c1", detachedPlanCount: 2 };
    });
  mount(f.workspace);
  await screen.findByLabelText("1주차 공통 수업명");
  fireEvent.click(screen.getByRole("button", { name: "수업노트 관리" }));
  fireEvent.click(screen.getByRole("button", { name: "원본 삭제" }));
  const dialog = await screen.findByRole("dialog", { name: "수업노트 관리" });
  const button = await within(dialog).findByRole("button", {
    name: "영구 삭제",
  });
  expect(button).toBeDisabled();
  fireEvent.click(
    within(dialog).getByLabelText("삭제되는 내용을 확인했습니다.")
  );
  fireEvent.click(button);
  await waitFor(() =>
    expect(remove).toHaveBeenCalledWith({
      id: "c1",
      expectedUpdatedAt: "2026-09-09T00:00:00.000Z",
    })
  );
  expect(
    await screen.findByText(
      "공통 원본을 삭제하고 장소 2곳의 수업명과 내용을 보존했습니다."
    )
  ).toBeInTheDocument();
});

it("blocks replacement if another week still has a conflict", async () => {
  const f = fixture();
  await f.workspace.refresh();
  await f.edit("c1:2", { content: "이 기기" });
  f.editRemote("c1", 2, { content: "다른 기기" });
  await f.workspace.refresh();
  mount(f.workspace);
  await screen.findByLabelText("1주차 공통 수업명");
  fireEvent.click(screen.getByRole("button", { name: "수업노트 관리" }));
  fireEvent.click(screen.getByRole("button", { name: "12주 교체" }));
  expect(await screen.findAllByText(/2주차에 미저장 내용/)).not.toHaveLength(0);
  expect(
    screen.queryByRole("heading", { name: "공통 12주 교체" })
  ).not.toBeInTheDocument();
});

it("shows deleted dirty notes as read-only recovery records", async () => {
  const f = fixture();
  await f.workspace.refresh();
  await f.edit("c1:1", { className: "보존된 노트" });
  f.data.clear();
  await f.workspace.refresh();
  mount(f.workspace);
  const input = await screen.findByLabelText("1주차 공통 수업명");
  expect(input).toHaveAttribute("readonly");
  expect(input).toHaveValue("보존된 노트");
  expect(
    screen.getByRole("button", { name: "복구 기록 내보내기" })
  ).toBeEnabled();
  expect(
    screen.queryByLabelText("Apple Pencil 필기 영역 1페이지")
  ).not.toBeInTheDocument();
});

it("keeps local save failure visible and permits retry without losing input", async () => {
  const f = fixture();
  await f.workspace.refresh();
  mount(f.workspace);
  await screen.findByLabelText("1주차 공통 수업명");
  jest
    .spyOn(f.store, "change")
    .mockRejectedValueOnce(new DOMException("full", "QuotaExceededError"));
  fireEvent.change(screen.getByLabelText("1주차 공통 수업명"), {
    target: { value: "보존할 입력" },
  });
  await screen.findByText("저장 실패");
  fireEvent.click(screen.getByRole("button", { name: "저장 상태 상세" }));
  await screen.findByRole("button", { name: "저장 재시도" });
  expect(screen.getByLabelText("1주차 공통 수업명")).toHaveValue("보존할 입력");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "저장 재시도" }));
  });
  await waitFor(() => expect(f.workspace.getSnapshot().storageError).toBe(""));
  expect(screen.getByLabelText("1주차 공통 수업명")).toHaveValue("보존할 입력");
});

it("refreshes local copies after an online 12-week replacement", async () => {
  const f = fixture();
  const replace = jest
    .spyOn(api, "replaceLessonCurriculumWeeks")
    .mockImplementation(async ({ id }) => {
      for (let week = 1; week <= 12; week++)
        f.editRemote(id, week, { className: "", content: "" });
      return api.lessonCurriculum(id);
    });
  mount(f.workspace);
  await screen.findByLabelText("1주차 공통 수업명");
  fireEvent.click(screen.getByRole("button", { name: "수업노트 관리" }));
  fireEvent.click(screen.getByRole("button", { name: "12주 교체" }));
  const dialog = await screen.findByRole("dialog", { name: "수업노트 관리" });
  fireEvent.change(await within(dialog).findByLabelText("교체할 12주 원본"), {
    target: { value: "__empty__" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "12주 교체" }));
  await waitFor(() =>
    expect(replace).toHaveBeenCalledWith({
      id: "c1",
      sourcePlanId: null,
      expectedUpdatedAt: "2026-09-09T00:00:00.000Z",
    })
  );
  await screen.findByText("공통 원본의 12주 수업명과 내용을 교체했습니다.");
  expect(screen.getByLabelText("1주차 공통 수업명")).toHaveValue("");
  expect(f.workspace.getSnapshot().notes).toHaveLength(12);
});

it("keeps the editor mounted when an in-flight save fails during a Pencil stroke", async () => {
  const f = fixture();
  await f.workspace.refresh();
  mount(f.workspace);
  await screen.findByLabelText("1주차 공통 수업명");
  const canvas = screen.getByLabelText("Apple Pencil 필기 영역 1페이지");
  const editor = canvas.closest(".notebook-ink-editor")!;
  const previousSibling = editor.previousElementSibling;
  fireEvent(canvas, pencilEvent("pointerdown", 40, 1));
  await act(async () => {
    await f.store.change(
      "c1:1",
      (n) =>
        n && {
          ...n,
          version: n.version + 1,
          error: "저장 실패 (400): 한 주차의 필기 데이터가 너무 큽니다.",
        }
    );
    await f.workspace.reload();
  });
  expect(screen.getByText("저장 실패")).toBeInTheDocument();
  expect(screen.getByLabelText("Apple Pencil 필기 영역 1페이지")).toBe(canvas);
  expect(editor.previousElementSibling).toBe(previousSibling);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent(window, pencilEvent("pointerup", 70, 0));
  await waitFor(() =>
    expect(
      f.workspace.getSnapshot().notes[0].local.inkDocument.strokes
    ).toHaveLength(1)
  );
});

it("filters inactive source plans without hiding common notebooks and preserves canvas through management", async () => {
  const f = fixture(["c1", "c2"]);
  const current = f.data.get("c1")!.summary;
  (api.lessonPlans as jest.Mock).mockResolvedValue([
    {
      id: "active",
      year: current.year,
      term: current.term,
      programName: current.programName,
      locationActive: true,
      locationName: "사용 센터",
      curriculumId: null,
    },
    {
      id: "inactive",
      year: current.year,
      term: current.term,
      programName: current.programName,
      locationActive: false,
      locationName: "중지 센터",
      curriculumId: null,
    },
  ]);
  mount(f.workspace);
  await screen.findByLabelText("1주차 공통 수업명");
  const canvas = screen.getByLabelText("Apple Pencil 필기 영역 1페이지");
  expect(
    within(
      screen.getByRole("complementary", { name: "공통 수업노트 목록" })
    ).getAllByRole("button")
  ).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "수업노트 관리" }));
  fireEvent.click(screen.getByRole("button", { name: "12주 교체" }));
  const source = await screen.findByLabelText("교체할 12주 원본");
  expect(
    within(source).getByRole("option", { name: "사용 센터" })
  ).toBeInTheDocument();
  expect(
    within(source).queryByRole("option", { name: "중지 센터" })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "12주 교체 닫기" }));
  fireEvent.click(screen.getByRole("button", { name: "수업노트 관리 닫기" }));
  expect(screen.getByLabelText("Apple Pencil 필기 영역 1페이지")).toBe(canvas);
});
