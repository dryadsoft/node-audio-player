import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const jsonResponse = (payload: unknown, status = 200) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  } as Response);

describe("LessonNotes", () => {
  beforeEach(() => {
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
      await screen.findByRole("heading", { name: "가을학기 · 오감별" }),
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
});
