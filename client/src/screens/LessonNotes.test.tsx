import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "react-query";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../context/ThemeContext";
import LessonNotes from "./LessonNotes";
import { LessonCurriculumWeek } from "../types";
import {
  clearLessonNoteDraft,
  loadLessonNoteDraft,
  saveLessonNoteDraft,
} from "../api/lessonNoteDrafts";

jest.mock("../api/lessonNoteDrafts", () => ({
  lessonNoteDraftKey: (id: string, week: number) => `${id}:${week}`,
  loadLessonNoteDraft: jest.fn().mockResolvedValue(undefined),
  saveLessonNoteDraft: jest.fn().mockResolvedValue(undefined),
  clearLessonNoteDraft: jest.fn().mockResolvedValue(undefined),
}));

const currentYear = new Date().getFullYear();
const week = (number: number): LessonCurriculumWeek => ({
  week: number,
  className: number === 1 ? "첫 만남" : "",
  content: number === 1 ? "인사와 과정 소개" : "",
  lessonPlan: "",
  materials: "",
  hasInk: false,
  inkDocument: { version: 1, aspectRatio: 4 / 3, strokes: [] },
  revision: 1,
  updatedAt: "2026-09-03T00:00:00.000Z",
});
const weeks = Array.from({ length: 12 }, (_, index) => {
  const item = week(index + 1);
  const { inkDocument, ...summary } = item;
  return summary;
});
const summary = {
  id: "curriculum-1",
  year: currentYear,
  term: "fall" as const,
  programName: "오감별",
  completedWeeks: 1,
  linkedPlanCount: 2,
  createdAt: "2026-09-03T00:00:00.000Z",
  updatedAt: "2026-09-03T00:00:00.000Z",
};

const sourcePlan = {
  id: "source-plan",
  year: currentYear,
  term: "fall" as const,
  locationId: "location-1",
  locationName: "서초 문화센터",
  locationActive: true,
  programName: "오감별",
  sectionName: "월요일",
  curriculumId: null,
  completedWeeks: 12,
  status: "complete" as const,
  revision: 1,
  createdAt: "2026-09-03T00:00:00.000Z",
  updatedAt: "2026-09-03T00:00:00.000Z",
};

const jsonResponse = (payload: unknown, status = 200) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  } as Response);

const pencilEvent = (
  type: string,
  clientX: number,
  clientY: number,
  pressure: number,
  buttons: number,
) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerType: { value: "pen" },
    pointerId: { value: 7 },
    clientX: { value: clientX },
    clientY: { value: clientY },
    pressure: { value: pressure },
    buttons: { value: buttons },
    timeStamp: { value: 0 },
    tiltX: { value: 0 },
    tiltY: { value: 0 },
  });
  return event;
};

describe("LessonNotes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (loadLessonNoteDraft as jest.Mock).mockResolvedValue(undefined);
    (saveLessonNoteDraft as jest.Mock).mockResolvedValue(undefined);
    (clearLessonNoteDraft as jest.Mock).mockResolvedValue(undefined);
    const context = {
      setTransform: jest.fn(),
      clearRect: jest.fn(),
      beginPath: jest.fn(),
      arc: jest.fn(),
      fill: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
    } as unknown as CanvasRenderingContext2D;
    jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context);
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("edits a shared week and autosaves plan and material fields", async () => {
    let savedBody: Record<string, unknown> | undefined;
    jest.spyOn(window, "fetch").mockImplementation((input, options) => {
      const url = String(input);
      if (url === "/api/lesson-curricula" && !options?.method) {
        return jsonResponse([summary]);
      }
      if (url === "/api/lesson-plans") return jsonResponse([]);
      if (url === "/api/lesson-curricula/curriculum-1") {
        return jsonResponse({ ...summary, weeks });
      }
      if (url === "/api/lesson-curricula/curriculum-1/weeks/1") {
        if (options?.method === "PUT") {
          savedBody = JSON.parse(String(options.body));
          return jsonResponse({ ...week(1), ...savedBody, revision: 2 });
        }
        return jsonResponse(week(1));
      }
      return jsonResponse(week(1));
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MemoryRouter initialEntries={["/lesson-notes"]}>
            <LessonNotes />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "1주차 공통 수업 기록" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/장소 2곳 연결/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("키보드 입력 열기"));
    fireEvent.change(screen.getByLabelText("1주차 진행 플랜"), {
      target: { value: "노래 후 촉감 놀이" },
    });
    fireEvent.change(screen.getByLabelText("1주차 사용 교구"), {
      target: { value: "스카프, 탬버린" },
    });

    await waitFor(() => expect(savedBody).toBeDefined(), { timeout: 2500 });
    expect(savedBody).toMatchObject({
      className: "첫 만남",
      content: "인사와 과정 소개",
      lessonPlan: "노래 후 촉감 놀이",
      materials: "스카프, 탬버린",
      expectedRevision: 1,
    });
    expect(savedBody?.inkDocument).toEqual({
      version: 1,
      aspectRatio: 4 / 3,
      strokes: [],
    });
    expect(await screen.findByText("저장 완료")).toBeInTheDocument();
  });

  it("passes ten rapid timestamp-zero Pencil strokes to the IndexedDB draft", async () => {
    jest.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/lesson-curricula") return jsonResponse([summary]);
      if (url === "/api/lesson-plans") return jsonResponse([]);
      if (url === "/api/lesson-curricula/curriculum-1") {
        return jsonResponse({ ...summary, weeks });
      }
      if (url === "/api/lesson-curricula/curriculum-1/weeks/1") {
        return jsonResponse(week(1));
      }
      return jsonResponse([]);
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MemoryRouter initialEntries={["/lesson-notes"]}>
            <LessonNotes />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "1주차 공통 수업 기록" });
    const canvas = await screen.findByLabelText("Apple Pencil 필기 영역 1페이지");
    Object.assign(canvas, { releasePointerCapture: jest.fn() });

    for (let index = 0; index < 10; index += 1) {
      fireEvent(
        canvas,
        pencilEvent("pointerdown", 20 + index * 20, 40, 0.7, 1),
      );
      fireEvent(
        window,
        pencilEvent("pointerup", 30 + index * 20, 50, 0, 0),
      );
    }

    await waitFor(() => {
      const calls = (saveLessonNoteDraft as jest.Mock).mock.calls;
      expect(calls[calls.length - 1]?.[0]).toBe("curriculum-1:1");
      expect(calls[calls.length - 1]?.[1].inkDocument.strokes).toHaveLength(10);
    });
  });

  it("replaces all shared class names and content from an independent plan", async () => {
    let replaceBody: Record<string, unknown> | undefined;
    jest.spyOn(window, "fetch").mockImplementation((input, options) => {
      const url = String(input);
      if (url === "/api/lesson-curricula" && !options?.method) {
        return jsonResponse([summary]);
      }
      if (url === "/api/lesson-plans") return jsonResponse([sourcePlan]);
      if (url === "/api/lesson-curricula/curriculum-1") {
        return jsonResponse({ ...summary, weeks });
      }
      if (
        url === "/api/lesson-curricula/curriculum-1/weeks" &&
        options?.method === "PUT"
      ) {
        replaceBody = JSON.parse(String(options.body));
        return jsonResponse({
          ...summary,
          updatedAt: "2026-09-03T01:00:00.000Z",
          weeks,
        });
      }
      if (url === "/api/lesson-curricula/curriculum-1/weeks/1") {
        return jsonResponse(week(1));
      }
      return jsonResponse([]);
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MemoryRouter initialEntries={["/lesson-notes"]}>
            <LessonNotes />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "1주차 공통 수업 기록" });
    fireEvent.click(screen.getByRole("button", { name: "12주 교체" }));
    const dialog = await screen.findByRole("dialog", { name: "공통 12주 교체" });
    fireEvent.change(within(dialog).getByLabelText("교체할 12주 원본"), {
      target: { value: sourcePlan.id },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "12주 교체" }));

    await waitFor(() => expect(replaceBody).toBeDefined());
    expect(replaceBody).toEqual({
      sourcePlanId: sourcePlan.id,
      expectedUpdatedAt: summary.updatedAt,
    });
    expect(
      await screen.findByText("공통 원본의 12주 수업명과 내용을 교체했습니다."),
    ).toBeInTheDocument();
  });

  it("confirms deletion and preserves linked plans through the delete API", async () => {
    let deleteBody: Record<string, unknown> | undefined;
    let deleted = false;
    jest.spyOn(window, "fetch").mockImplementation((input, options) => {
      const url = String(input);
      if (url === "/api/lesson-curricula" && !options?.method) {
        return jsonResponse(deleted ? [] : [summary]);
      }
      if (url === "/api/lesson-plans") return jsonResponse([]);
      if (url === "/api/lesson-curricula/curriculum-1" && !options?.method) {
        return jsonResponse({ ...summary, weeks });
      }
      if (
        url === "/api/lesson-curricula/curriculum-1" &&
        options?.method === "DELETE"
      ) {
        deleteBody = JSON.parse(String(options.body));
        deleted = true;
        return jsonResponse({ id: summary.id, detachedPlanCount: 2 });
      }
      if (url === "/api/lesson-curricula/curriculum-1/weeks/1") {
        return jsonResponse(week(1));
      }
      return jsonResponse([]);
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MemoryRouter initialEntries={["/lesson-notes"]}>
            <LessonNotes />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "1주차 공통 수업 기록" });
    fireEvent.click(screen.getByRole("button", { name: "원본 삭제" }));
    const dialog = await screen.findByRole("dialog", { name: "공통 원본 삭제" });
    const deleteButton = within(dialog).getByRole("button", { name: "영구 삭제" });
    expect(deleteButton).toBeDisabled();
    fireEvent.click(within(dialog).getByLabelText("삭제되는 내용을 확인했습니다."));
    fireEvent.click(deleteButton);

    await waitFor(() => expect(deleteBody).toBeDefined());
    expect(deleteBody).toEqual({ expectedUpdatedAt: summary.updatedAt });
    expect(
      await screen.findByText(
        "공통 원본을 삭제하고 장소 2곳의 수업명과 내용을 보존했습니다.",
      ),
    ).toBeInTheDocument();
  });

  it("blocks management while another week has an unsaved local draft", async () => {
    (loadLessonNoteDraft as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === "curriculum-1:2" ? week(2) : undefined),
    );
    jest.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/lesson-curricula") return jsonResponse([summary]);
      if (url === "/api/lesson-plans") return jsonResponse([]);
      if (url === "/api/lesson-curricula/curriculum-1") {
        return jsonResponse({ ...summary, weeks });
      }
      if (url === "/api/lesson-curricula/curriculum-1/weeks/1") {
        return jsonResponse(week(1));
      }
      return jsonResponse([]);
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MemoryRouter initialEntries={["/lesson-notes"]}>
            <LessonNotes />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "1주차 공통 수업 기록" });
    fireEvent.click(screen.getByRole("button", { name: "12주 교체" }));
    expect(
      await screen.findByText(
        "2주차에 미저장 내용이 있습니다. 해당 주차를 열어 저장한 후 다시 시도하세요.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "공통 12주 교체" })).not.toBeInTheDocument();
  });

  const otherSummary = { ...summary, id: "curriculum-2", term: "winter" as const, programName: "겨울 놀이" };
  const renderNavigation = (detailResponse?: () => Promise<Response>) => {
    const draftStore = new Map<string, LessonCurriculumWeek>();
    (loadLessonNoteDraft as jest.Mock).mockImplementation((key: string) => Promise.resolve(draftStore.get(key)));
    (saveLessonNoteDraft as jest.Mock).mockImplementation((key: string, value: LessonCurriculumWeek) => {
      draftStore.set(key, value);
      return Promise.resolve();
    });
    (clearLessonNoteDraft as jest.Mock).mockImplementation((key: string) => {
      draftStore.delete(key);
      return Promise.resolve();
    });
    const fetchMock = jest.spyOn(window, "fetch").mockImplementation((input, options) => {
      const url = String(input);
      if (url === "/api/lesson-curricula") return jsonResponse([summary, otherSummary]);
      if (url === "/api/lesson-plans") return jsonResponse([]);
      if (url === "/api/lesson-curricula/curriculum-1") return jsonResponse({ ...summary, weeks });
      if (url === "/api/lesson-curricula/curriculum-2") {
        return detailResponse ? detailResponse() : jsonResponse({ ...otherSummary, weeks });
      }
      const match = url.match(/\/lesson-curricula\/(curriculum-\d)\/weeks\/(\d+)$/);
      if (match) {
        if (options?.method === "PUT") {
          const body = JSON.parse(String(options.body));
          return jsonResponse({ ...body, week: Number(match[2]), revision: 2 });
        }
        return jsonResponse(week(Number(match[2])));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MemoryRouter><LessonNotes /></MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    return { draftStore, fetchMock };
  };

  const openTerm = (name = "오감별") => {
    const list = screen.getByRole("complementary", { name: "공통 수업노트 목록" });
    const trigger = within(list).getByRole("button", { name: new RegExp(name) });
    trigger.focus();
    fireEvent.click(trigger);
    return trigger;
  };

  it("keeps text and ink when toggling keyboard fields and shows management in the top header", async () => {
    const { draftStore, fetchMock } = renderNavigation();
    const heading = await screen.findByRole("heading", { name: "1주차 공통 수업 기록" });
    const topHeader = screen.getByRole("heading", { name: "공통 수업노트" }).closest("header")!;
    expect(within(topHeader).getByRole("status")).toHaveTextContent("저장 완료");
    expect(within(topHeader).getByRole("button", { name: "12주 교체" })).toBeEnabled();
    expect(within(topHeader).getByRole("button", { name: "원본 삭제" })).toBeEnabled();
    expect(within(topHeader).getByRole("button", { name: "새 공통 원본" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "가을학기 · 오감별" })).not.toBeInTheDocument();
    const toggle = within(heading.parentElement!).getByRole("button", { name: "키보드 입력 열기" });
    const fields = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(fields).not.toBeVisible();
    const canvas = screen.getByLabelText("Apple Pencil 필기 영역 1페이지");
    Object.assign(canvas, { releasePointerCapture: jest.fn() });
    fireEvent(canvas, pencilEvent("pointerdown", 30, 40, 0.7, 1));
    fireEvent(window, pencilEvent("pointerup", 60, 60, 0, 0));
    await waitFor(() => expect(draftStore.get("curriculum-1:1")?.inkDocument.strokes).toHaveLength(1));
    fireEvent.click(toggle);
    expect(fields).toBeVisible();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.change(screen.getByRole("textbox", { name: "1주차 공통 수업명" }), {
      target: { value: "접어도 유지되는 기록" },
    });
    fireEvent.click(screen.getByRole("button", { name: "키보드 입력 닫기" }));
    expect(fields).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "키보드 입력 열기" }));
    expect(screen.getByRole("textbox", { name: "1주차 공통 수업명" })).toHaveValue("접어도 유지되는 기록");
    expect(screen.getByLabelText("Apple Pencil 필기 영역 1페이지")).toBe(canvas);
    await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => {
      if (options?.method !== "PUT") return false;
      const body = JSON.parse(String(options.body));
      return body.className === "접어도 유지되는 기록" && body.inkDocument.strokes.length === 1;
    })).toBe(true), { timeout: 2500 });
  });

  it("keeps save errors visible in the header and retries with the keyboard fields closed", async () => {
    const { fetchMock } = renderNavigation();
    const originalFetch = fetchMock.getMockImplementation()!;
    let failSave = true;
    fetchMock.mockImplementation((input, options) => options?.method === "PUT" && failSave
      ? jsonResponse({ message: "저장 연결 실패" }, 503)
      : originalFetch(input, options));
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    await screen.findByRole("heading", { name: "1주차 공통 수업 기록" });
    fireEvent.click(screen.getByRole("button", { name: "키보드 입력 열기" }));
    fireEvent.change(screen.getByRole("textbox", { name: "1주차 공통 수업명" }), {
      target: { value: "저장 재시도 기록" },
    });
    fireEvent.click(screen.getByRole("button", { name: "키보드 입력 닫기" }));
    const topHeader = screen.getByRole("heading", { name: "공통 수업노트" }).closest("header")!;
    expect(within(topHeader).getByRole("button", { name: "12주 교체" })).toBeDisabled();
    await waitFor(() => expect(within(topHeader).getByRole("status")).toHaveTextContent("저장 실패"), { timeout: 2500 });
    expect(within(topHeader).getByRole("button", { name: "원본 삭제" })).toBeDisabled();
    failSave = false;
    fireEvent.click(screen.getByRole("button", { name: "저장 재시도" }));
    await waitFor(() => expect(within(topHeader).getByRole("status")).toHaveTextContent("저장 완료"), { timeout: 2500 });
    expect(within(topHeader).getByRole("button", { name: "12주 교체" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "키보드 입력 열기" })).toHaveAttribute("aria-expanded", "false");
  });

  it("browses another term without changing the note and only switches after choosing a week", async () => {
    const { fetchMock } = renderNavigation();
    await screen.findByLabelText("1주차 공통 수업명");
    const canvas = screen.getByLabelText("Apple Pencil 필기 영역 1페이지");
    openTerm("겨울 놀이");
    const dialog = await screen.findByRole("dialog");
    const nav = await within(dialog).findByRole("navigation", { name: "주차 선택" });
    await waitFor(() => expect(within(nav).getAllByRole("button")).toHaveLength(12));
    expect(screen.getByRole("heading", { name: "1주차 공통 수업 기록" })).toBeInTheDocument();
    expect(screen.getByLabelText("Apple Pencil 필기 영역 1페이지")).toBe(canvas);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("curriculum-2/weeks"))).toBe(false);
    fireEvent.click(within(nav).getByRole("button", { name: "12주차" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByLabelText("12주차 공통 수업명")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "12주차 공통 수업 기록" })).toHaveFocus());
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("curriculum-2/weeks/12"))).toBe(true);
  });

  it("closes and reopens the drawer without resetting the current canvas or draft", async () => {
    renderNavigation();
    const input = await screen.findByLabelText("1주차 공통 수업명");
    fireEvent.click(screen.getByRole("button", { name: "키보드 입력 열기" }));
    fireEvent.change(input, { target: { value: "작성 중인 수업" } });
    const canvas = screen.getByLabelText("Apple Pencil 필기 영역 1페이지");
    const trigger = openTerm();
    let dialog = await screen.findByRole("dialog");
    const firstWeek = await within(dialog).findByRole("button", { name: /^1주차/ });
    expect(firstWeek).toHaveAttribute("aria-current", "true");
    expect(firstWeek).toHaveFocus();
    fireEvent.keyDown(firstWeek, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    openTerm();
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^1주차/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("1주차 공통 수업명")).toHaveValue("작성 중인 수업");
    expect(screen.getByLabelText("Apple Pencil 필기 영역 1페이지")).toBe(canvas);
    expect(screen.getByRole("button", { name: "키보드 입력 닫기" })).toHaveAttribute("aria-expanded", "true");
    openTerm();
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "주차 메뉴 닫기" }));
    expect(trigger).toHaveFocus();
    openTerm();
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("restores the unsaved local draft when switching weeks before autosave", async () => {
    const { draftStore, fetchMock } = renderNavigation();
    const input = await screen.findByLabelText("1주차 공통 수업명");
    fireEvent.click(screen.getByRole("button", { name: "키보드 입력 열기" }));
    fireEvent.change(input, { target: { value: "저장 대기 중 전환" } });
    await waitFor(() => expect(draftStore.get("curriculum-1:1")?.className).toBe("저장 대기 중 전환"));
    openTerm();
    const nextWeek = await within(screen.getByRole("dialog")).findByRole("button", { name: "2주차" });
    await act(async () => { fireEvent.click(nextWeek); });
    await screen.findByLabelText("2주차 공통 수업명");
    expect(screen.getByRole("button", { name: "키보드 입력 열기" })).toHaveAttribute("aria-expanded", "false");
    openTerm();
    const previousWeek = await within(screen.getByRole("dialog")).findByRole("button", { name: /^1주차/ });
    await act(async () => { fireEvent.click(previousWeek); });
    await waitFor(() => expect(screen.getByLabelText("1주차 공통 수업명")).toHaveValue("저장 대기 중 전환"));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) =>
      String(url).endsWith("curriculum-1/weeks/1") && options?.method === "PUT" &&
      JSON.parse(String(options.body)).className === "저장 대기 중 전환",
    )).toBe(true), { timeout: 2500 });
  });

  it("supports the mobile term step, back navigation, and keyboard focus containment", async () => {
    renderNavigation();
    await screen.findByLabelText("1주차 공통 수업명");
    const trigger = screen.getByRole("button", { name: "학기·주차 선택" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "학기 선택" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /겨울 놀이/ }));
    await within(dialog).findByRole("button", { name: "12주차" });
    const closeButton = within(dialog).getByRole("button", { name: "주차 메뉴 닫기" });
    closeButton.focus();
    fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
    expect(within(dialog).getByRole("button", { name: "12주차" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(closeButton).toHaveFocus();
    fireEvent.click(within(dialog).getByRole("button", { name: "학기 목록으로" }));
    expect(within(dialog).getByRole("heading", { name: "학기 선택" })).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(trigger).toHaveFocus();
  });

  it("does not show stale weeks while loading another term and offers retry on failure", async () => {
    let rejectDetail: (error: Error) => void = () => undefined;
    const pending = new Promise<Response>((_resolve, reject) => { rejectDetail = reject; });
    let failed = true;
    renderNavigation(() => failed ? pending : jsonResponse({ ...otherSummary, weeks }));
    await screen.findByLabelText("1주차 공통 수업명");
    openTerm();
    await within(screen.getByRole("dialog")).findByRole("button", { name: "12주차" });
    fireEvent.click(screen.getByRole("button", { name: "주차 메뉴 닫기" }));
    openTerm("겨울 놀이");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("status")).toHaveTextContent("주차 목록을 불러오는 중...");
    expect(within(dialog).queryByRole("button", { name: "12주차" })).not.toBeInTheDocument();
    rejectDetail(new Error("목록 조회 실패"));
    await within(dialog).findByRole("alert");
    failed = false;
    fireEvent.click(within(dialog).getByRole("button", { name: "다시 시도" }));
    expect(await within(dialog).findByRole("button", { name: "12주차" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "1주차 공통 수업 기록" })).toBeInTheDocument();
  });

});
